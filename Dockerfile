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

# Instalar dependências do sistema (compilação + SSL)
RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements do backend
COPY backend/requirements.txt .

# Instalar dependências Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código backend
COPY backend/ .

# Copiar o frontend buildado do estágio anterior (PARA RAIZ DO APP)
COPY --from=frontend-builder /app/frontend/.next ./.next
COPY --from=frontend-builder /app/frontend/public ./public
COPY --from=frontend-builder /app/frontend/node_modules ./node_modules
COPY --from=frontend-builder /app/frontend/package.json ./

# Port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
