# ===== ESTÁGIO 1: Build do Next.js =====
FROM node:18-slim AS frontend-builder

WORKDIR /app/frontend

# Copiar package files
COPY frontend/package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código
COPY frontend/ .

# Build do Next.js (FALHAR se houver erro!)
RUN npm run build

# ===== ESTÁGIO 2: Runtime com FastAPI =====
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

# Copiar o frontend buildado (static export → out/)
COPY --from=frontend-builder /app/frontend/out ./frontend_out

RUN mkdir -p uploads/photos data

# Port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
