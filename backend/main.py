from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from database import init_db, migrate_db
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

app = FastAPI(
    title="OrthoClinic API",
    description="Sistema de gestão de consultório ortopédico",
    version="2.0.0",
)

_raw_origins = os.getenv(
    "BACKEND_CORS_ORIGINS",
    '["http://localhost:3000","http://localhost:3001","http://localhost:3002"]',
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

os.makedirs("uploads/photos", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
include_all(app)


@app.on_event("startup")
def startup():
    init_db()
    migrate_db()
    from seed import seed
    seed()


@app.get("/health")
def health():
    return {"status": "ok", "app": "OrthoClinic", "version": "2.0.0"}
