"""Integração Memed Sinapse Prescricao v3.25."""
import os
import base64
import json
import logging
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends
import httpx
from deps import get_current_user

logger = logging.getLogger("orthoclinic.memed")

router = APIRouter(prefix="/memed", tags=["Memed"])

MEMED_API_KEY  = "067aa3bf4d0ff169c40950c5ad1d65c4"
MEMED_DOCTOR_ID = 171135

# JWT hardcoded de emergência (expirado — só usado se API + MEMED_JWT falharem)
_FALLBACK_JWT = (
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9"
    ".WzE3MTEzNSwiMDY3YWEzYmY0ZDBmZjE2OWM0MDk1MGM1YWQxZDY1YzQiLCIyMDI2LTA2LTI5IiwidW5kZWZpbmVkIl0"
    ".x97mWhc348zkaiN4TUfdFBtPKHzRiezsZZNYTkD3K9E"
)

# Cache em memória: (token, data_iso) — renova automaticamente a cada dia
_cache: dict = {"token": None, "date": None}


def _jwt_date(token: str) -> str | None:
    """Extrai a data (YYYY-MM-DD) do payload JWT Memed: [doctor_id, api_key, date, slug]."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padding = "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + padding))
        if isinstance(payload, list) and len(payload) >= 3:
            return str(payload[2])
    except Exception:
        pass
    return None


def _extract_token_from_memed_response(data: dict) -> str | None:
    """Extrai o JWT da resposta JSONAPI da Memed."""
    try:
        # Formato JSONAPI: data.attributes.token  OU  data.attributes.jwt
        attrs = data.get("data", {}).get("attributes", {})
        return attrs.get("token") or attrs.get("jwt") or attrs.get("access_token") or None
    except Exception:
        return None


async def _fetch_fresh_token() -> str | None:
    """
    Busca JWT fresco da API da Memed usando a secret-key da env var MEMED_SECRET_KEY.
    GET /v1/sinapse-prescricao/usuarios/{doctor_id}?api-key=...&secret-key=...
    """
    secret_key = os.getenv("MEMED_SECRET_KEY", "").strip()
    if not secret_key:
        return None

    url = (
        f"https://api.memed.com.br/v1/sinapse-prescricao/usuarios/{MEMED_DOCTOR_ID}"
        f"?api-key={MEMED_API_KEY}&secret-key={secret_key}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"Accept": "application/vnd.api+json"})
        if resp.status_code != 200:
            logger.warning("Memed API retornou %s: %s", resp.status_code, resp.text[:200])
            return None
        token = _extract_token_from_memed_response(resp.json())
        if token:
            logger.info("JWT Memed renovado via API (doctor_id=%s)", MEMED_DOCTOR_ID)
        return token
    except Exception as exc:
        logger.warning("Erro ao chamar API Memed: %s", exc)
        return None


@router.get("/token")
async def get_memed_token(current_user=Depends(get_current_user)):
    """
    Retorna JWT Memed válido para o frontend.

    Hierarquia de fontes (melhor para pior):
    1. Cache em memória com token de hoje
    2. API Memed (MEMED_SECRET_KEY configurada no Render)
    3. Env var MEMED_JWT (token manual atualizado no Render)
    4. Fallback hardcoded (provavelmente expirado — última saída)
    """
    today = date.today().isoformat()

    # 1. Cache válido
    if _cache["token"] and _cache["date"] == today:
        return {"token": _cache["token"], "date": today, "today": today, "valid": True, "source": "cache"}

    # 2. API Memed (automático se MEMED_SECRET_KEY estiver configurada)
    fresh = await _fetch_fresh_token()
    if fresh:
        _cache["token"] = fresh
        _cache["date"] = today
        return {"token": fresh, "date": today, "today": today, "valid": True, "source": "memed_api"}

    # 3. Env var manual
    manual = os.getenv("MEMED_JWT", "").strip()
    if manual:
        jwt_date = _jwt_date(manual)
        valid = jwt_date == today
        if not valid:
            logger.warning("MEMED_JWT manual tem data %s, hoje é %s", jwt_date, today)
        return {"token": manual, "date": jwt_date, "today": today, "valid": valid, "source": "env_var"}

    # 4. Fallback hardcoded (expirado)
    jwt_date = _jwt_date(_FALLBACK_JWT)
    logger.error("Usando JWT Memed hardcoded expirado — configure MEMED_SECRET_KEY no Render")
    return {"token": _FALLBACK_JWT, "date": jwt_date, "today": today, "valid": False, "source": "fallback"}
