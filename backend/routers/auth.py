"""Autenticação JWT e gerenciamento de usuários / organizações."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel

logger = logging.getLogger("orthoclinic.auth")

from database import get_db
from models.organization import User, Organization
from deps import get_current_user, require_admin, require_superadmin, SECRET_KEY, ALGORITHM
from services.audit_service import AuditLogService

router = APIRouter(prefix="/auth", tags=["Auth"])

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
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    forwarded = request.headers.get("X-Forwarded-For", "")
    actor_ip  = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    # Truncate UA to the column limit to avoid DataError on PostgreSQL
    actor_ua  = (request.headers.get("User-Agent") or "")[:1000] or None
    request_id = getattr(request.state, "request_id", None)

    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email, User.active == True).first()

    if not user or not pwd_context.verify(data.password, user.password_hash):
        org_id   = user.organization_id if user else None
        actor_id = user.id if user else None
        # Audit is best-effort — a schema mismatch or FK issue must not block auth
        if org_id is not None:
            try:
                AuditLogService.record(
                    db=db,
                    organization_id=org_id,
                    actor_id=actor_id,
                    actor_ip=actor_ip,
                    actor_user_agent=actor_ua,
                    action="user.login_failed",
                    resource_type="user",
                    resource_id=email,
                    metadata={"email": email, "reason": "bad_credentials"},
                    request_id=request_id,
                )
                db.commit()
            except Exception as _audit_exc:
                logger.warning("Audit (login_failed) non-fatal: %s", _audit_exc)
                db.rollback()
        raise HTTPException(401, "Email ou senha incorretos")

    token = _make_token(user)
    try:
        AuditLogService.record(
            db=db,
            organization_id=user.organization_id,
            actor_id=user.id,
            actor_ip=actor_ip,
            actor_user_agent=actor_ua,
            action="user.login",
            resource_type="user",
            resource_id=str(user.id),
            metadata={"email": email},
            request_id=request_id,
        )
        db.commit()
    except Exception as _audit_exc:
        logger.warning("Audit (login) non-fatal: %s", _audit_exc)
        db.rollback()

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    data: ChangePasswordIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not pwd_context.verify(data.current_password, current_user.password_hash):
        raise HTTPException(400, "Senha atual incorreta")
    current_user.password_hash = pwd_context.hash(data.new_password)
    AuditLogService.from_request(
        db=db,
        request=request,
        current_user=current_user,
        action="password.changed",
        resource_type="user",
        resource_id=str(current_user.id),
    )
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
    request: Request,
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
    db.flush()   # get user.id before audit
    AuditLogService.from_request(
        db=db,
        request=request,
        current_user=current_user,
        action="user.invited",
        resource_type="user",
        resource_id=str(user.id),
        after_state={"name": user.name, "email": email, "role": user.role, "organization_id": org_id},
    )
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    if current_user.role != "superadmin" and user.organization_id != current_user.organization_id:
        raise HTTPException(403, "Sem permissão")

    before = {"name": user.name, "email": user.email, "role": user.role}
    old_role = user.role

    user.name  = data.name
    user.email = data.email.strip().lower()
    user.role  = data.role
    if data.password:
        user.password_hash = pwd_context.hash(data.password)

    # Determine which specific audit action to use
    audit_action = "user.role_changed" if old_role != data.role else "user.invited"

    AuditLogService.from_request(
        db=db,
        request=request,
        current_user=current_user,
        action=audit_action,
        resource_type="user",
        resource_id=str(user_id),
        before_state=before,
        after_state={"name": user.name, "email": user.email, "role": user.role},
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def deactivate_user(
    user_id: int,
    request: Request,
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
    AuditLogService.from_request(
        db=db,
        request=request,
        current_user=current_user,
        action="user.deactivated",
        resource_type="user",
        resource_id=str(user_id),
        before_state={"active": True, "email": user.email},
        after_state={"active": False},
    )
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


@router.post("/admin-reset-password")
def admin_reset_password(
    data: dict,
    db: Session = Depends(get_db),
):
    """Reset de emergência — só funciona se ADMIN_RESET_SECRET estiver configurada no Render."""
    import os as _os
    secret = _os.getenv("ADMIN_RESET_SECRET", "")
    if not secret or data.get("secret") != secret:
        raise HTTPException(403, "Proibido")
    email = data.get("email", "").strip().lower()
    new_pw = data.get("new_password", "")
    if not email or not new_pw:
        raise HTTPException(400, "email e new_password obrigatórios")
    user = db.query(User).filter(User.email == email).first()
    created = False
    if not user:
        # Cria org e usuário superadmin se não existir
        from models.organization import Organization
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="OrthoClinic", plan="pro")
            db.add(org)
            db.commit()
            db.refresh(org)
        user = User(
            organization_id=org.id,
            name=data.get("name", email.split("@")[0]),
            email=email,
            password_hash=pwd_context.hash(new_pw),
            role="superadmin",
        )
        db.add(user)
        created = True
    else:
        user.password_hash = pwd_context.hash(new_pw)
    db.commit()
    return {"ok": True, "email": email, "created": created}


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
