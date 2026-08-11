"""
Mensagem direta 1-para-1 entre colegas da mesma organização
(ex.: médico <-> secretária). Entrega em tempo real via WebSocket;
escrita sempre via REST (POST), que persiste e depois empurra pro
socket de quem estiver conectado — evita duplicar validação/auth
dentro do loop do WebSocket.
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Set

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from deps import get_current_user, SECRET_KEY, ALGORITHM
from models.organization import User
from models.messages import DirectMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/messages", tags=["messages"])

# Janela de debounce da presença: só transmite "offline" depois de N segundos
# sem NENHUM socket do usuário. Reconexão antes disso cancela o offline e evita
# o pisca-pisca offline→online em quedas curtas (ex.: WS ocioso no Render).
OFFLINE_DEBOUNCE_SECONDS = 12


# ── Schemas ──────────────────────────────────────────────────────────────

class ContactOut(BaseModel):
    id: int
    name: str
    role: str
    unread_count: int = 0

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    content: str
    created_at: datetime
    read: bool

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    recipient_id: int
    content: str


# ── Conexões WebSocket ativas (por user_id) ─────────────────────────────
#
# Além de entregar mensagens em tempo real, o manager serve de fonte de
# PRESENÇA (quem está online = quem tem socket aberto) e empurra dois tipos
# de evento além da mensagem em si:
#   {"type": "message",  ...MessageOut}     — mensagem nova
#   {"type": "presence", "user_id", "online"} — colega entrou/saiu
#   {"type": "read",     "reader_id"}        — fulano leu suas mensagens
# Estado em memória — assume 1 processo (Render single service, sem múltiplos
# workers), mesma premissa que o WebSocket já exigia.

class DMConnectionManager:
    def __init__(self):
        self.connections: Dict[int, Set[WebSocket]] = {}
        self.user_org: Dict[int, int] = {}
        # Timers de "offline" pendentes (debounce de presença), por user_id.
        self._pending_offline: Dict[int, "asyncio.Task"] = {}

    async def connect(self, user_id: int, organization_id: int, websocket: WebSocket) -> bool:
        """Registra o socket. Retorna True se o usuário estava OFFLINE de verdade
        (1º socket E sem 'offline' pendente). Numa reconexão dentro da janela de
        debounce os colegas nunca viram o offline, então NÃO retransmite 'online'."""
        await websocket.accept()
        pending = self._pending_offline.pop(user_id, None)
        if pending is not None:
            pending.cancel()
        was_offline = not self.connections.get(user_id)
        self.connections.setdefault(user_id, set()).add(websocket)
        self.user_org[user_id] = organization_id
        return was_offline and pending is None

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Remove o socket. Se foi o último, AGENDA o 'offline' com debounce (não
        transmite na hora) — uma reconexão dentro da janela cancela o offline."""
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            del self.connections[user_id]
            # Mantém user_org até o offline confirmar: ainda conta como online.
            self._schedule_offline(user_id)

    def _schedule_offline(self, user_id: int) -> None:
        org_id = self.user_org.get(user_id)
        existing = self._pending_offline.get(user_id)
        if existing is not None:
            existing.cancel()
        self._pending_offline[user_id] = asyncio.create_task(
            self._offline_after_debounce(user_id, org_id)
        )

    async def _offline_after_debounce(self, user_id: int, org_id) -> None:
        try:
            await asyncio.sleep(OFFLINE_DEBOUNCE_SECONDS)
        except asyncio.CancelledError:
            return
        # Reconectou durante a janela? Continua online; não faz nada.
        if self.connections.get(user_id):
            self._pending_offline.pop(user_id, None)
            return
        self._pending_offline.pop(user_id, None)
        self.user_org.pop(user_id, None)
        await self.broadcast_presence(user_id, org_id, False)

    def is_online(self, user_id: int) -> bool:
        return bool(self.connections.get(user_id)) or user_id in self._pending_offline

    def online_in_org(self, organization_id: int) -> List[int]:
        ids = {uid for uid in self.connections if self.user_org.get(uid) == organization_id}
        # Usuários em janela de debounce ainda contam como online.
        for uid in self._pending_offline:
            if self.user_org.get(uid) == organization_id:
                ids.add(uid)
        return list(ids)

    def all_online(self) -> List[int]:
        return list(set(self.connections.keys()) | set(self._pending_offline.keys()))

    async def send_raw(self, user_id: int, payload: dict):
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        dead = set()
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def send_message(self, user_id: int, message: MessageOut):
        await self.send_raw(user_id, {"type": "message", **message.model_dump(mode="json")})

    async def broadcast_presence(self, user_id: int, organization_id: int, online: bool):
        payload = {"type": "presence", "user_id": user_id, "online": online}
        for uid in list(self.connections.keys()):
            if uid == user_id:
                continue
            if self.user_org.get(uid) == organization_id:
                await self.send_raw(uid, payload)


manager = DMConnectionManager()


async def _mark_read_and_notify(db: Session, reader: User, sender_id: int) -> int:
    """Marca como lidas as mensagens sender_id -> reader e avisa o remetente
    (via WS) que foram lidas, pra UI dele mostrar 'lida'. Retorna quantas."""
    updated = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.sender_id == sender_id,
            DirectMessage.recipient_id == reader.id,
            DirectMessage.read == False,  # noqa: E712
        )
        .update({"read": True}, synchronize_session=False)
    )
    db.commit()
    if updated:
        await manager.send_raw(sender_id, {"type": "read", "reader_id": reader.id})
    return updated


# ── REST ─────────────────────────────────────────────────────────────────

@router.get("/contacts", response_model=List[ContactOut])
def list_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Colegas da MESMA organização, exceto eu mesmo, já com o total de não-lidas.

    10/08 — a regra passou a ser só "mesma organização", sem filtro de papel.
    Antes acontecia isto: a conta do Valth é superadmin, e superadmin estava
    escondido como "conta de plataforma"; a secretária não via a conta dele,
    escrevia para uma segunda conta de médico que ninguém usava, e as duas
    pontas achavam que a mensagem não chegava.

    A secretária também deixou de ser limitada a médico/admin — ele pediu que
    as secretárias conversem entre si.

    O corte por organização é o que garante o isolamento pedido: quando outro
    médico entrar, ele terá organização própria e não verá — nem será visto
    por — a equipe daqui. Por isso o superadmin também é cortado pela
    organização dele aqui: sem isso, ele veria a equipe de todos os médicos.
    """
    users = (
        db.query(User)
        .filter(
            User.id != current_user.id,
            User.active == True,  # noqa: E712
            User.organization_id == current_user.organization_id,
        )
        .order_by(User.name)
        .all()
    )

    # Não-lidas por remetente: mensagens que me mandaram e ainda não li.
    rows = (
        db.query(DirectMessage.sender_id, func.count(DirectMessage.id))
        .filter(
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.read == False,  # noqa: E712
        )
        .group_by(DirectMessage.sender_id)
        .all()
    )
    unread_map = {sender_id: count for sender_id, count in rows}

    return [
        ContactOut(
            id=u.id,
            name=u.name,
            role=u.role,
            unread_count=unread_map.get(u.id, 0),
        )
        for u in users
    ]


@router.get("/presence")
def get_presence(
    current_user: User = Depends(get_current_user),
):
    """IDs dos colegas online agora (WebSocket aberto) na MESMA organização.

    10/08: o superadmin via TODAS as organizações. Com outro médico no sistema,
    ele veria o status das secretárias do colega — e o colega, o das dele.
    Presença agora é sempre dentro da própria organização.
    """
    ids = manager.online_in_org(current_user.organization_id)
    return {"online_user_ids": [i for i in ids if i != current_user.id]}


@router.post("/{other_user_id}/read")
async def mark_conversation_read(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca como lidas as mensagens que other_user_id me mandou e avisa ele."""
    await _mark_read_and_notify(db, current_user, other_user_id)
    return {"ok": True}


@router.get("/{other_user_id}", response_model=List[MessageOut])
async def get_conversation(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msgs = (
        db.query(DirectMessage)
        .filter(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.recipient_id == other_user_id),
                and_(DirectMessage.sender_id == other_user_id, DirectMessage.recipient_id == current_user.id),
            )
        )
        .order_by(DirectMessage.created_at.asc())
        .limit(200)
        .all()
    )

    # A20: carregar a conversa NÃO marca como lido. O front pré-carrega a 1ª
    # conversa no mount mesmo com o widget fechado; marcar aqui geraria recibo
    # "Lida" falso. A marcação fica só no POST /{id}/read, chamado pelo front
    # quando a aba está de fato aberta e visível.
    return msgs


@router.post("", response_model=MessageOut)
async def send_message(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.recipient_id == current_user.id:
        raise HTTPException(status_code=422, detail="Não é possível enviar mensagem para si mesmo")
    if not payload.content.strip():
        raise HTTPException(status_code=422, detail="Mensagem vazia")

    recipient = db.query(User).filter(User.id == payload.recipient_id, User.active == True).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatário não encontrado")
    # 10/08: sem exceção para superadmin — mesma razão da presença.
    if recipient.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Destinatário fora da sua organização")

    msg = DirectMessage(
        sender_id=current_user.id,
        recipient_id=payload.recipient_id,
        content=payload.content.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    out = MessageOut.model_validate(msg)
    await manager.send_message(current_user.id, out)
    await manager.send_message(payload.recipient_id, out)

    return out


# ── WebSocket (push-only; autenticação via ?token=<jwt>, igual audit.py) ──

@router.websocket("/ws")
async def messages_ws(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="token required")
        return

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        await websocket.close(code=4003, reason="invalid token")
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.active == True).first()
    finally:
        db.close()

    if not user:
        await websocket.close(code=4003, reason="forbidden")
        return

    was_offline = await manager.connect(user_id, user.organization_id, websocket)
    if was_offline:
        await manager.broadcast_presence(user_id, user.organization_id, True)
    try:
        while True:
            data = await websocket.receive_text()
            if data.strip() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error(f"Erro no WebSocket de mensagens: {type(exc).__name__}")
    finally:
        # disconnect agenda o offline com debounce internamente (S9): evita o
        # flicker offline→online em reconexões curtas.
        manager.disconnect(user_id, websocket)
