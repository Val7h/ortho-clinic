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

class DMConnectionManager:
    def __init__(self):
        self.connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.connections:
            self.connections[user_id].discard(websocket)
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_to(self, user_id: int, message: MessageOut):
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        payload = message.model_dump(mode="json")
        dead = set()
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.disconnect(user_id, ws)


manager = DMConnectionManager()


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


@router.get("/{other_user_id}", response_model=List[MessageOut])
def get_conversation(
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

    unread_ids = [m.id for m in msgs if m.recipient_id == current_user.id and not m.read]
    if unread_ids:
        db.query(DirectMessage).filter(DirectMessage.id.in_(unread_ids)).update(
            {"read": True}, synchronize_session=False
        )
        db.commit()

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
    await manager.send_to(current_user.id, out)
    await manager.send_to(payload.recipient_id, out)

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

    await manager.connect(user_id, websocket)
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
        manager.disconnect(user_id, websocket)
