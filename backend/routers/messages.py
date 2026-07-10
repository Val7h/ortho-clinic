"""
Mensagem direta 1-para-1 entre colegas da mesma organização
(ex.: médico <-> secretária). Entrega em tempo real via WebSocket;
escrita sempre via REST (POST), que persiste e depois empurra pro
socket de quem estiver conectado — evita duplicar validação/auth
dentro do loop do WebSocket.
"""
import logging
from datetime import datetime
from typing import Dict, List, Set

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from deps import get_current_user, SECRET_KEY, ALGORITHM
from models.organization import User
from models.messages import DirectMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/messages", tags=["messages"])


# ── Schemas ──────────────────────────────────────────────────────────────

class ContactOut(BaseModel):
    id: int
    name: str
    role: str

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

    async def connect(self, user_id: int, organization_id: int, websocket: WebSocket) -> bool:
        """Registra o socket. Retorna True se o usuário estava OFFLINE (1º socket)."""
        await websocket.accept()
        was_offline = not self.connections.get(user_id)
        self.connections.setdefault(user_id, set()).add(websocket)
        self.user_org[user_id] = organization_id
        return was_offline

    def disconnect(self, user_id: int, websocket: WebSocket) -> bool:
        """Remove o socket. Retorna True se o usuário ficou OFFLINE (último socket)."""
        sockets = self.connections.get(user_id)
        if not sockets:
            return False
        sockets.discard(websocket)
        if not sockets:
            del self.connections[user_id]
            self.user_org.pop(user_id, None)
            return True
        return False

    def is_online(self, user_id: int) -> bool:
        return bool(self.connections.get(user_id))

    def online_in_org(self, organization_id: int) -> List[int]:
        return [uid for uid in self.connections if self.user_org.get(uid) == organization_id]

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
    """Colegas com quem dá pra conversar: mesma organização, exceto eu mesmo."""
    q = db.query(User).filter(User.id != current_user.id, User.active == True)
    if current_user.role != "superadmin":
        q = q.filter(User.organization_id == current_user.organization_id)
    return q.order_by(User.name).all()


@router.get("/presence")
def get_presence(
    current_user: User = Depends(get_current_user),
):
    """IDs dos colegas online agora (com WebSocket aberto) na mesma organização."""
    if current_user.role == "superadmin":
        ids = list(manager.connections.keys())
    else:
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

    # Abrir a conversa = ler o que o colega mandou → marca lido e avisa ele.
    await _mark_read_and_notify(db, current_user, other_user_id)

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
    if current_user.role != "superadmin" and recipient.organization_id != current_user.organization_id:
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
        went_offline = manager.disconnect(user_id, websocket)
        if went_offline:
            await manager.broadcast_presence(user_id, user.organization_id, False)
