from fastapi import FastAPI
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

# Rotas públicas do frontend que colidem com handlers da API (mesmos paths).
# Quando é um browser (Accept: text/html), serve o HTML shell antes dos handlers.
_FRONTEND_CONFLICT_PREFIXES = (
    "anamnese/", "confirmar/", "agendar/", "documentos/publico/",
)

@app.middleware("http")
async def serve_frontend_for_browser(request, call_next):
    path = request.url.path.lstrip("/")
    accept = request.headers.get("accept", "")
    if (
        request.method == "GET"
        and "text/html" in accept
        and any(path.startswith(p) for p in _FRONTEND_CONFLICT_PREFIXES)
        and out_dir is not None
    ):
        parts = [p for p in path.split("/") if p]
        for i in range(len(parts)):
            test = parts.copy(); test[i] = "_"
            candidate = out_dir / "/".join(test) / "index.html"
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
    init_db()
    migrate_db()
    # Seed desabilitado temporariamente - problema de argon2-cffi
    # if os.getenv("ENVIRONMENT", "development") != "production":
    #     from seed import seed
    #     seed()


@app.get("/health")
def health():
    return {"status": "ok", "app": "OrthoClinic", "version": "2.0.0"}


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

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    if full_path.startswith(("api/", "auth/", "health", "docs", "openapi")):
        return {"error": "Not found"}

    if out_dir is None:
        return {"error": "Frontend not properly built"}

    # Try exact file match (e.g. /agenda → out/agenda.html or out/agenda/index.html)
    for candidate in [
        out_dir / full_path,
        out_dir / full_path / "index.html",
        out_dir / f"{full_path}.html",
    ]:
        if candidate.is_file():
            return FileResponse(candidate)

    # Try replacing each dynamic segment with "_" placeholder to find the best shell
    parts = [p for p in full_path.split("/") if p]
    for i in range(len(parts)):
        test_parts = parts.copy()
        test_parts[i] = "_"
        test_path = "/".join(test_parts)
        candidate = out_dir / test_path / "index.html"
        if candidate.is_file():
            return FileResponse(candidate, media_type="text/html")

    # SPA fallback: serve root index.html for all unmatched routes
    root_index = out_dir / "index.html"
    if root_index.exists():
        return FileResponse(root_index, media_type="text/html")

    return {"error": "Frontend not properly built"}
