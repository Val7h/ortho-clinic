from fastapi import APIRouter, Depends
from deps import get_current_user

router = APIRouter(prefix="/memed", tags=["Memed"])

MEMED_API_KEY = "067aa3bf4d0ff169c40950c5ad1d65c4"
MEMED_DOCTOR_ID = 171135


@router.get("/config")
def get_memed_config(current_user=Depends(get_current_user)):
    """
    Retorna configuração do Memed para o frontend.
    Endpoint autenticado — apenas usuários com JWT válido acessam.
    """
    return {
        "api_key": MEMED_API_KEY,
        "doctor_id": MEMED_DOCTOR_ID,
    }
