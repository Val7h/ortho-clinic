"""Integração Memed Sinapse Prescricao v3.25."""
import os
import base64
import json
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from deps import get_current_user

logger = logging.getLogger("orthoclinic.memed")

router = APIRouter(prefix="/memed", tags=["Memed"])

# Token obtido no portal parceiro Memed (doctor_id=171135).
# Para renovar: acesse o portal Memed, gere novo JWT e atualize MEMED_JWT no Render.
_FALLBACK_JWT = (
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9"
    ".WzE3MTEzNSwiMDY3YWEzYmY0ZDBmZjE2OWM0MDk1MGM1YWQxZDY1YzQiLCIyMDI2LTA2LTI5IiwidW5kZWZpbmVkIl0"
    ".x97mWhc348zkaiN4TUfdFBtPKHzRiezsZZNYTkD3K9E"
)


def _jwt_date(token: str) -> str | None:
    """Extrai a data (YYYY-MM-DD) embutida no payload do JWT Memed."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padding = "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + padding))
        # Payload é lista: [doctor_id, api_key, "YYYY-MM-DD", slug]
        if isinstance(payload, list) and len(payload) >= 3:
            return str(payload[2])
    except Exception:
        pass
    return None


@router.get("/token")
def get_memed_token(current_user=Depends(get_current_user)):
    """
    Retorna JWT do Memed para o frontend.
    Lê MEMED_JWT da env var (Render) — se ausente, usa fallback hardcoded.
    """
    token = os.getenv("MEMED_JWT", _FALLBACK_JWT).strip()
    jwt_date = _jwt_date(token)
    today = date.today().isoformat()

    if jwt_date and jwt_date != today:
        logger.warning("MEMED_JWT tem data %s, hoje é %s — token possivelmente expirado", jwt_date, today)

    return {
        "token": token,
        "date": jwt_date,
        "today": today,
        "valid": jwt_date == today if jwt_date else None,
    }
