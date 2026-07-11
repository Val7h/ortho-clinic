# ===== Runtime com FastAPI (frontend NÃO builda aqui) =====
# O frontend é buildado LOCALMENTE (npm run build) e o resultado (frontend/out)
# é commitado no repo. O Render NÃO roda mais `npm run build` — o build do Next
# estourava a memória no plano free (512MB) e travava/falhava os deploys.
# Regra do fluxo: SEMPRE `cd frontend && npm run build` + commitar frontend/out
# antes de dar push, senão a produção sobe com o frontend velho.
FROM python:3.11-slim

WORKDIR /app

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev \
    libxml2-dev libxmlsec1-dev libxmlsec1-openssl pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements do backend
COPY backend/requirements.txt .

# Instalar dependências Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código backend
COPY backend/ .

# Copiar o frontend JÁ BUILDADO e commitado (static export → out/)
COPY frontend/out ./frontend_out

RUN mkdir -p uploads/photos data

# Port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start FastAPI
# --workers 1: presença/lida/push do chat (DMConnectionManager) vivem em memória
# e assumem 1 processo. Com >1 worker, sockets/presença ficam intermitentes.
# Escalar horizontal exige pub-sub compartilhado (Redis/Upstash) antes de subir isto.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
