from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

_secret = os.getenv("SECRET_KEY", "")
if not _secret or "dev-secret" in _secret or len(_secret) < 32:
    print("AVISO: SECRET_KEY fraca ou nao configurada no Render!")

from database import init_db, migrate_db
import models.user_settings  # noqa: F401 — garante que UserSession seja registrado antes do mapper
from routers import patients, consultations, dashboard
from routers.documents import include_all
from routers.memed import router as memed_router
from routers.whatsapp import router as whatsapp_router
from routers.financial import router as financial_router
from routers.media import router as media_router
from routers.anamnesis import router as anamnesis_router
from routers.consultations import agenda_router
from routers.clinic import router as clinic_router, public_router as clinic_public_router
from routers.auth import router as auth_router
from routers.queue import router as queue_router
from routers.analytics import router as analytics_router
from routers.push_notifications import router as push_router
from routers.patient_documents import router as patient_docs_router, public_router as patient_docs_public_router
from routers.oauth2 import router as oauth2_router, well_known_router as oauth2_well_known_router
from routers.pre_consulta import router as pre_consulta_router
from routers.patient_prescriptions import router as patient_prescriptions_router
from routers.clinical_evolutions import router as clinical_evolutions_router
from routers.prescription_templates import router as prescription_templates_router
from routers.chat import router as chat_router
from routers.messages import router as messages_router

# SSO / SAML / OIDC / MFA / SCIM (Sprint 8)
# python3-saml requer libxmlsec1 (não disponível em todos os ambientes)
_SSO_AVAILABLE = False
try:
    from routers.sso import saml_router, oidc_router, mfa_router, sso_admin
    from routers.scim import scim_router, scim_admin_router
    _SSO_AVAILABLE = True
except ImportError as _e:
    import logging as _logging
    _logging.getLogger(__name__).warning("SSO/SCIM desabilitado: %s", _e)

# Enterprise Billing with Stripe (Sprint 8)
from routers.billing import router as billing_router

# Immutable Audit Log (Sprint 8)
from routers.audit import router as audit_router
from middleware.audit_middleware import AuditContextMiddleware

# Public REST API v1 (Sprint 7)
from api.v1.router import public_api_v1_router
from api.v1.middleware import attach_public_api_middleware

app = FastAPI(
    title="OrthoClinic API",
    description="Sistema de gestão de consultório ortopédico",
    version="2.0.0",
)

# CORS: em produção (Render), configure a variável de ambiente BACKEND_CORS_ORIGINS
# com o JSON contendo a URL real do frontend, ex:
#   BACKEND_CORS_ORIGINS=["https://ortho-clinic.onrender.com"]
# O fallback abaixo inclui localhost (dev) + URL padrão do Render (produção).
_raw_origins = os.getenv(
    "BACKEND_CORS_ORIGINS",
    '["http://localhost:3000","http://localhost:3001","http://localhost:3002","http://localhost:3003","http://localhost:3004","http://localhost:3005","http://localhost:3006","http://localhost:3007","http://localhost:3008","http://127.0.0.1:3000","http://127.0.0.1:3001","http://127.0.0.1:3002","http://127.0.0.1:3003","http://127.0.0.1:3004","http://127.0.0.1:3005","http://127.0.0.1:3006","http://127.0.0.1:3007","http://127.0.0.1:3008","https://ortho-clinic.onrender.com"]',
)
try:
    import json as _json
    _cors_origins = _json.loads(_raw_origins)
except Exception:
    _cors_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public API middleware stack (RequestID, ResponseTime, RateLimit, AuditLog)
attach_public_api_middleware(app)

# Audit context middleware — injects request_id, session_id, actor_ip into request.state
app.add_middleware(AuditContextMiddleware)

os.makedirs("uploads/photos", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Rotas do frontend que colidem com handlers da API.
# Prefixos com "/" = qualquer sub-path (ex: "anamnese/abc").
# Sem "/" = exact ou sub-path (ex: "agenda" ou "agenda/2026-01-01").
# Quando é um browser (Accept: text/html), serve o HTML shell.
_FRONTEND_CONFLICT_PREFIXES = (
    "agenda", "anamnese/", "confirmar/", "agendar/", "documentos/publico/",
)

def _is_frontend_conflict(path: str) -> bool:
    for p in _FRONTEND_CONFLICT_PREFIXES:
        if p.endswith("/"):
            if path.startswith(p):
                return True
        else:
            if path == p or path.startswith(p + "/"):
                return True
    return False

@app.middleware("http")
async def serve_frontend_for_browser(request, call_next):
    path = request.url.path.lstrip("/")
    accept = request.headers.get("accept", "")
    if (
        request.method == "GET"
        and "text/html" in accept
        and _is_frontend_conflict(path)
        and out_dir is not None
    ):
        parts = [p for p in path.split("/") if p]
        for i in range(len(parts)):
            test = parts.copy(); test[i] = "_"
            for candidate in [out_dir / f"{'/'.join(test)}.html", out_dir / "/".join(test) / "index.html"]:
                if candidate.is_file():
                    return FileResponse(str(candidate), media_type="text/html")
        root = out_dir / "index.html"
        if root.exists():
            return FileResponse(str(root), media_type="text/html")
    return await call_next(request)

# Auth (público: /auth/login)
app.include_router(auth_router)

# Clínicas — público (/agendar/*) + protegido (/clinics/*)
app.include_router(clinic_public_router)
app.include_router(clinic_router)

# Routers protegidos
app.include_router(dashboard.router)
app.include_router(patients.router)
app.include_router(consultations.router)
app.include_router(memed_router)
app.include_router(whatsapp_router)
app.include_router(financial_router)
app.include_router(media_router)
app.include_router(anamnesis_router)
app.include_router(agenda_router)
app.include_router(queue_router)
app.include_router(analytics_router)
app.include_router(push_router)
app.include_router(patient_docs_router)
app.include_router(patient_docs_public_router)
app.include_router(patient_prescriptions_router)
app.include_router(clinical_evolutions_router)
app.include_router(prescription_templates_router)
app.include_router(chat_router)
app.include_router(messages_router)
include_all(app)

# Formulário pré-consulta público (token HMAC — sem JWT)
app.include_router(pre_consulta_router)

# OAuth2 Authorization Server (Sprint 7)
app.include_router(oauth2_router)
app.include_router(oauth2_well_known_router)

# SSO / SAML 2.0 / OIDC / MFA / SCIM 2.0 (Sprint 8)
if _SSO_AVAILABLE:
    app.include_router(saml_router)
    app.include_router(oidc_router)
    app.include_router(mfa_router)
    app.include_router(sso_admin)
    app.include_router(scim_router)
    app.include_router(scim_admin_router)

# Public REST API v1 (Sprint 7)
app.include_router(public_api_v1_router)

# Enterprise Billing (Sprint 8)
app.include_router(billing_router)

# Immutable Audit Log (Sprint 8)
app.include_router(audit_router)


@app.on_event("startup")
def startup():
    from database import SessionLocal
    from sqlalchemy import text as _text
    init_db()
    migrate_db()
    # Fase 1c: trava central de isolamento multi-tenant (filtra SELECTs por conta;
    # kill-switch TENANT_ISOLATION_ENFORCE=0 desliga sem deploy)
    from tenant_guard import register_tenant_guard
    register_tenant_guard()
    _ensure_superadmin()
    _ensure_default_clinic()
    _ensure_clinics()
    _backfill_clinic_org()
    # BUG-05: forçar inicialização do pool antes do primeiro request (warm-up)
    try:
        db = SessionLocal()
        db.execute(_text("SELECT 1"))
        db.close()
    except Exception:
        pass


def _backfill_clinic_org():
    """Garante que nenhuma clínica fique com organization_id NULL antes de o isolamento
    multi-cliente por conta entrar em vigor (senão usuário não-superadmin da única conta
    existente não enxergaria as clínicas). Idempotente: só toca em linhas NULL, e amarra
    à ÚNICA organização quando só existe uma (caso atual, single-tenant)."""
    from database import SessionLocal
    from models.organization import Organization
    from models.clinic import Clinic
    db = SessionLocal()
    try:
        orgs = db.query(Organization.id).order_by(Organization.id).all()
        # Só faz o backfill automático quando há exatamente UMA conta (não há ambiguidade
        # de "a qual conta pertence"). Com múltiplas contas, isso passa a ser tratado na
        # criação/migração explícita — nunca adivinhar dono de clínica.
        if len(orgs) != 1:
            return
        only_org_id = orgs[0][0]
        n = db.query(Clinic).filter(Clinic.organization_id.is_(None)).update(
            {Clinic.organization_id: only_org_id}, synchronize_session=False
        )
        if n:
            db.commit()
            print(f"✓ Backfill: {n} clínica(s) sem conta amarradas à org {only_org_id}")
    except Exception as e:
        print(f"[backfill_clinic_org] ignorado: {e}")
    finally:
        db.close()


def _ensure_superadmin():
    """Cria superadmin padrão se o banco estiver vazio (ex: SQLite sem disco persistente)."""
    from database import SessionLocal
    from models.organization import Organization, User
    from passlib.context import CryptContext as _CryptContext

    admin_email = os.getenv("SEED_ADMIN_EMAIL", "valthguime@gmail.com")
    admin_pass  = os.getenv("SEED_ADMIN_PASSWORD", "Ortho2026!")

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="OrthoClinic", plan="pro")
            db.add(org)
            db.commit()
            db.refresh(org)
        pw_ctx = _CryptContext(schemes=["bcrypt"], deprecated="auto")
        user = User(
            organization_id=org.id,
            name="Dr. Valth",
            email=admin_email,
            password_hash=pw_ctx.hash(admin_pass),
            role="superadmin",
        )
        db.add(user)
        db.commit()
        print(f"✓ Superadmin criado: {admin_email}")
    except Exception as e:
        print(f"! Erro ao criar superadmin: {e}")
    finally:
        db.close()


def _ensure_default_clinic():
    """Cria ou corrige a clínica padrão e seus horários."""
    from database import SessionLocal
    from models.clinic import Clinic, ClinicSchedule

    CLINIC_NAME = os.getenv("SEED_CLINIC_NAME", "Dr. Valth Guimarães")
    CLINIC_SLUG = os.getenv("SEED_CLINIC_SLUG", "dr-valth")
    SLOT_MIN    = int(os.getenv("SEED_SLOT_DURATION", "12"))  # 5 consultas/hora

    db = SessionLocal()
    try:
        clinic = db.query(Clinic).first()
        if clinic:
            # Corrige nome/slug/cor se estiver desatualizado
            changed = False
            if clinic.name != CLINIC_NAME:
                clinic.name = CLINIC_NAME; changed = True
            if clinic.slug != CLINIC_SLUG:
                clinic.slug = CLINIC_SLUG; changed = True
            if changed:
                db.commit()
                print(f"✓ Clínica atualizada: {CLINIC_NAME}")
            # Corrige slot_duration em todos os horários
            for s in db.query(ClinicSchedule).filter_by(clinic_id=clinic.id).all():
                if s.slot_duration != SLOT_MIN:
                    s.slot_duration = SLOT_MIN
            db.commit()
            print(f"✓ Horários: slot={SLOT_MIN}min")
            return
        clinic = Clinic(
            name=os.getenv("SEED_CLINIC_NAME", "Dr. Valth Guimarães"),
            slug=os.getenv("SEED_CLINIC_SLUG", "dr-valth"),
            city=os.getenv("SEED_CLINIC_CITY", "São Paulo"),
            state=os.getenv("SEED_CLINIC_STATE", "SP"),
            address=os.getenv("SEED_CLINIC_ADDRESS", ""),
            color="#0F2D5E",
            active=True,
        )
        db.add(clinic)
        db.commit()
        db.refresh(clinic)
        # Seg–Sex 08:00–18:00, 5 consultas/hora = 12 min por slot
        for dow in range(5):
            db.add(ClinicSchedule(
                clinic_id=clinic.id,
                day_of_week=dow,
                start_time="08:00",
                end_time="18:00",
                schedule_type="appointment",
                slot_duration=12,
                active=True,
            ))
        db.commit()
        print(f"✓ Clínica padrão criada: {clinic.name} (slug={clinic.slug})")
    except Exception as e:
        print(f"! Erro ao criar clínica padrão: {e}")
    finally:
        db.close()


def _ensure_clinics():
    """Cria as 3 clínicas padrão do Dr. Valth se ainda não existirem."""
    from database import SessionLocal
    from models.clinic import Clinic

    CLINICS = [
        {"name": "Dr. Valth - Caruaru",       "slug": "caruaru",       "city": "Caruaru",       "state": "PE", "color": "#0F2D5E"},
        {"name": "Dr. Valth - Campina Grande", "slug": "campina-grande","city": "Campina Grande","state": "PB", "color": "#0F2D5E"},
        {"name": "Dr. Valth - Palmares",       "slug": "palmares",      "city": "Palmares",      "state": "PE", "color": "#0F2D5E"},
    ]

    db = SessionLocal()
    try:
        for c in CLINICS:
            existing = db.query(Clinic).filter(Clinic.slug == c["slug"]).first()
            if not existing:
                clinic = Clinic(
                    name=c["name"],
                    slug=c["slug"],
                    city=c["city"],
                    state=c["state"],
                    address="",
                    color=c["color"],
                    active=True,
                )
                db.add(clinic)
                db.commit()
                print(f"✓ Clínica criada: {c['name']}")
            else:
                print(f"✓ Clínica já existe: {c['name']}")
    except Exception as e:
        print(f"! Erro ao criar clínicas: {e}")
    finally:
        db.close()


@app.get("/health")
def health():
    # Diagnóstico de banco: confirma em qual engine a produção está rodando e se
    # está acessível AGORA — sem vazar credencial (só dialeto + classificação do
    # host, nunca a connection string). Persistência dos dados depende disso:
    #  - "sqlite" em produção = disco efêmero do Render = dados somem no deploy (RUIM)
    #  - "postgresql" + host neon/render = banco gerenciado persistente (BOM)
    from sqlalchemy import text as _text
    from database import engine  # não importado no topo — sem isto o handler quebra (NameError) e o Render reprova o deploy no health check
    db_engine = engine.dialect.name  # "sqlite" | "postgresql"
    host = (engine.url.host or "").lower()
    if "neon" in host:
        db_host_kind = "neon"
    elif "render" in host:
        db_host_kind = "render"
    elif db_engine == "sqlite":
        db_host_kind = "local-file (EFÊMERO)"
    elif host in ("", "localhost", "127.0.0.1"):
        db_host_kind = "local"
    else:
        db_host_kind = "outro"
    try:
        with engine.connect() as conn:
            conn.execute(_text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok",
        "app": "OrthoClinic",
        "version": "2.0.0",
        "db_engine": db_engine,
        "db_host_kind": db_host_kind,
        "db_ok": db_ok,
        "db_persistent": db_engine == "postgresql" and db_ok,
    }


# ===== SERVE NEXT.JS FRONTEND (static export) =====
from pathlib import Path
from fastapi.responses import FileResponse

app_dir = Path(__file__).parent  # /app (Docker) or backend/ (local)

# Docker: Dockerfile copies frontend/out → /app/frontend_out
# Local dev: frontend/out built locally
_out_candidates = [
    app_dir / "frontend_out",                   # Docker path
    app_dir.parent / "frontend" / "out",         # local dev path
]
out_dir: Path | None = next((p for p in _out_candidates if p.is_dir()), None)

if out_dir:
    # Serve /_next/static/ and public assets from within out/
    _next_static = out_dir / "_next" / "static"
    if _next_static.exists():
        app.mount("/_next/static", StaticFiles(directory=_next_static), name="nextjs-static")
    app.mount("/static", StaticFiles(directory=out_dir, html=True), name="nextjs-out")

# Uploads de exames do formulário pré-consulta
_uploads_exames = app_dir / "uploads" / "exames"
_uploads_exames.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/exames", StaticFiles(directory=_uploads_exames), name="uploads-exames")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str, request: Request):
    if full_path.startswith(("api/", "auth/", "health", "docs", "openapi")):
        return {"error": "Not found"}

    # Formulário pré-consulta: fonte única é o build do Next (out/pre-consulta.html),
    # resolvido pelos candidatos genéricos abaixo. Havia cópias estáticas antigas
    # (backend/static e out/pre-consulta/index.html) que ganhavam a prioridade e
    # serviam versão desatualizada do formulário — removidas em 01/08/2026.

    if out_dir is None:
        return {"error": "Frontend not properly built"}

    # Next.js RSC payload requests: *.txt?_rsc=... or ?_rsc= on any path.
    # The static export generates _.txt (and _.html) for dynamic routes like [id].
    # We serve the matching _ placeholder .txt so client-side navigation works.
    # For unknown paths, return 404 — this causes Next.js to do a hard navigation
    # instead of rendering the wrong component tree (e.g. the dashboard root).
    is_rsc = full_path.endswith(".txt") or "_rsc" in request.query_params
    if is_rsc:
        rsc_base = full_path[:-4] if full_path.endswith(".txt") else full_path
        parts = [p for p in rsc_base.split("/") if p]
        for i in range(len(parts)):
            test = parts.copy()
            test[i] = "_"
            test_path = "/".join(test)
            # Static export generates out/pacientes/_.txt (not out/pacientes/_/index.txt)
            for candidate in [
                out_dir / f"{test_path}.txt",
                out_dir / test_path / "index.txt",
            ]:
                if candidate.is_file():
                    return FileResponse(candidate, media_type="text/x-component")
        from fastapi.responses import Response
        return Response(status_code=404)

    # Try exact file match (e.g. /agenda → out/agenda.html or out/agenda/index.html)
    for candidate in [
        out_dir / full_path,
        out_dir / full_path / "index.html",
        out_dir / f"{full_path}.html",
    ]:
        if candidate.is_file():
            return FileResponse(candidate)

    # Try replacing each dynamic segment with "_" placeholder.
    # Static export generates out/pacientes/_.html for /pacientes/[id]
    # and out/pacientes/_/consulta.html for /pacientes/[id]/consulta.
    parts = [p for p in full_path.split("/") if p]
    for i in range(len(parts)):
        test_parts = parts.copy()
        test_parts[i] = "_"
        test_path = "/".join(test_parts)
        for candidate in [
            out_dir / f"{test_path}.html",
            out_dir / test_path / "index.html",
        ]:
            if candidate.is_file():
                return FileResponse(candidate, media_type="text/html")

    # SPA fallback: serve root index.html for all unmatched routes
    root_index = out_dir / "index.html"
    if root_index.exists():
        return FileResponse(root_index, media_type="text/html")

    return {"error": "Frontend not properly built"}
