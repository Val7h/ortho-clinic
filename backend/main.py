from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

_secret = os.getenv("SECRET_KEY", "")
if not _secret or "dev-secret" in _secret or len(_secret) < 32:
    print("AVISO: SECRET_KEY fraca ou nao configurada no Render!")

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
from routers.queue import router as queue_router

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
app.include_router(queue_router)
include_all(app)


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


# ===== SERVE NEXT.JS FRONTEND =====
# Montar arquivos estáticos do Next.js
from pathlib import Path
from fastapi.responses import FileResponse

# Em Docker: /app/main.py → /app = raiz do app
# Em local: backend/main.py → backend = parent, frontend = sibling
app_dir = Path(__file__).parent  # /app (em Docker) ou backend/ (local)
nextjs_dir = app_dir / ".next"   # /app/.next (Docker) ou backend/.next (local)
public_dir = app_dir / "public"  # /app/public (Docker) ou backend/public (local)

# Se não encontrar em app_dir, tenta no parent (para compatibilidade local)
if not nextjs_dir.exists() and (app_dir.parent / "frontend" / ".next").exists():
    nextjs_dir = app_dir.parent / "frontend" / ".next"
    public_dir = app_dir.parent / "frontend" / "public"

nextjs_static = nextjs_dir / "static"

if nextjs_static.exists():
    app.mount("/_next/static", StaticFiles(directory=nextjs_static), name="nextjs-static")

if public_dir.exists():
    app.mount("/public", StaticFiles(directory=public_dir), name="public")

# Rota catch-all: serve o Next.js para qualquer rota não reconhecida
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # Se for requisição da API, deixa passar (já tratada pelos routers acima)
    if full_path.startswith("api/") or full_path.startswith("auth/"):
        return {"error": "Not found"}

    # Serve o index.html padrão do Next.js
    # Next.js 13+ app router coloca output em .next/server/
    possible_files = [
        nextjs_dir / "server" / "app.js",
        nextjs_dir / "server" / "app-page.js",
        nextjs_dir / "standalone" / "main.js",
    ]

    for file_path in possible_files:
        if file_path.exists():
            return FileResponse(file_path)

    # Último recurso: retorna erro
    return {"error": "Frontend not properly built"}
