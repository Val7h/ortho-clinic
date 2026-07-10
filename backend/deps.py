"""Dependências de autenticação e autorização compartilhadas."""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
import os

from database import get_db
from models.organization import User

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production-32chars")
ALGORITHM = "HS256"

_security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Token não informado")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    user = db.query(User).filter(User.id == user_id, User.active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    # Fase 1c: amarra a conta do usuário NESTA sessão de banco — a trava central
    # (tenant_guard) lê session.info e filtra todo SELECT pelos modelos-tenant.
    # superadmin (dono do SaaS) tem bypass e enxerga todas as contas.
    db.info["tenant_org_id"] = user.organization_id
    db.info["tenant_bypass"] = (user.role == "superadmin")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return current_user


def require_doctor(current_user: User = Depends(get_current_user)) -> User:
    """Doctor, admin e superadmin têm acesso clínico. Secretary não."""
    if current_user.role not in ("doctor", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a médicos")
    return current_user


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao superadmin")
    return current_user
