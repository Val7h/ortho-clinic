"""Autenticação JWT e gerenciamento de usuários / organizações."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import os

from database import get_db
from models.organization import User, Organization
from deps import get_current_user, require_admin, require_superadmin

router = APIRouter(prefix="/auth", tags=["Auth"])

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production-32chars")
ALGORITHM = "HS256"
TOKEN_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    organization_id: int
    active: bool
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "secretary"
    organization_id: Optional[int] = None  # superadmin pode definir


class UserUpdate(BaseModel):
    name: str
    email: str
    role: str
    password: Optional[str] = None  # None = não muda


class OrgOut(BaseModel):
    id: int
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    plan: str
    active: bool
    model_config = {"from_attributes": True}


class OrgCreate(BaseModel):
    name: str
    city: Optional[str] = None
    state: Optional[str] = None
    plan: str = "basic"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_token(user: User) -> str:
    exp = datetime.utcnow() + timedelta(days=TOKEN_DAYS)
    return jwt.encode(
        {"sub": str(user.id), "org": user.organization_id, "role": user.role, "exp": exp},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


# ── Auth endpoints ────────────────────────────────────────────────────────────

@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.strip().lower(), User.active == True).first()
    if not user or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(401, "Email ou senha incorretos")
    return {
        "access_token": _make_token(user),
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    data: ChangePasswordIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not pwd_context.verify(data.current_password, current_user.password_hash):
        raise HTTPException(400, "Senha atual incorreta")
    current_user.password_hash = pwd_context.hash(data.new_password)
    db.commit()


# ── User management (admin+) ──────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if current_user.role != "superadmin":
        q = q.filter(User.organization_id == current_user.organization_id)
    return q.order_by(User.name).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    data: UserCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    email = data.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Email já cadastrado")

    # superadmin pode especificar org; admin só cria na própria org
    org_id = (
        data.organization_id
        if current_user.role == "superadmin" and data.organization_id
        else current_user.organization_id
    )

    user = User(
        organization_id=org_id,
        name=data.name,
        email=email,
        password_hash=pwd_context.hash(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if current_user.role != "superadmin" and user.organization_id != current_user.organization_id:
        raise HTTPException(403, "Sem permissão")
    user.name = data.name
    user.email = data.email.strip().lower()
    user.role = data.role
    if data.password:
        user.password_hash = pwd_context.hash(data.password)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if current_user.role != "superadmin" and user.organization_id != current_user.organization_id:
        raise HTTPException(403, "Sem permissão")
    if user.id == current_user.id:
        raise HTTPException(400, "Não é possível desativar sua própria conta")
    user.active = False
    db.commit()


# ── Organization management (superadmin only) ─────────────────────────────────

@router.get("/organizations", response_model=list[OrgOut])
def list_orgs(
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return db.query(Organization).order_by(Organization.name).all()


@router.post("/organizations", response_model=OrgOut, status_code=201)
def create_org(
    data: OrgCreate,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    org = Organization(**data.model_dump())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.put("/organizations/{org_id}", response_model=OrgOut)
def update_org(
    org_id: int,
    data: OrgCreate,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organização não encontrada")
    for k, v in data.model_dump().items():
        setattr(org, k, v)
    db.commit()
    db.refresh(org)
    return org
