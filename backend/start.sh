#!/bin/bash
# --workers 1: chat (DMConnectionManager) mantém presença/lida/push em memória,
# assume 1 processo. Só subir com pub-sub compartilhado (Redis/Upstash).
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
