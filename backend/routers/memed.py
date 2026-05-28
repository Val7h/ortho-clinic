from fastapi import APIRouter
import os

router = APIRouter(prefix="/memed", tags=["Memed"])


@router.get("/config")
def get_memed_config():
    """
    Retorna configuração do Memed para o frontend.
    O token é necessário no cliente para carregar o SDK JavaScript.
    """
    token = os.getenv("MEMED_TOKEN", "").strip()
    sandbox = os.getenv("MEMED_SANDBOX", "true").lower() in ("true", "1", "yes")
    return {
        "enabled": bool(token),
        "token": token if token else None,
        "sandbox": sandbox,
    }
