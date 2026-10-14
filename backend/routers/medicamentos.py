"""
Base de medicamentos do Brasil. Prefixo: /medicamentos

13/10/2026 (Valth): "Antigamente eu trabalhava em farmácia e tinha um fichário
com todos os nomes comerciais" — a base vem da lista de preços da CMED (Anvisa,
26 mil apresentações) cruzada com o Anexo I da Portaria 344 (RDC 1.036/2026).
O app usa os TERMOS para decidir sozinho o tipo de receita quando ele escreve a
marca (Adorlan, Nusira, Insit, Cymbi...). Carga e atualização mensal:
ortho-clinic-backup/cmed/ (montar_base.py, termos.py, carregar_banco.py).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.organization import User

router = APIRouter(prefix="/medicamentos", tags=["medicamentos"])


@router.get("/termos")
def termos_controlados(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Marca ou princípio -> tipo de receita (só os que NÃO são receita simples)."""
    try:
        rows = db.execute(text("select termo, tipo, notificacao, principio from medicamento_termos")).fetchall()
    except Exception:
        return []
    return [{"termo": r[0], "tipo": r[1], "notificacao": r[2], "principio": r[3]} for r in rows]


@router.get("/busca")
def buscar(q: str = Query(..., min_length=3), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Procura por marca ou princípio ativo (até 40 apresentações)."""
    termo = f"%{q.strip().lower()}%"
    rows = db.execute(text(
        "select produto, substancia, apresentacao, laboratorio, tipo_receita, notificacao, lista344, pmc_pe "
        "from medicamentos where lower(produto) like :t or lower(substancia) like :t "
        "order by produto, apresentacao limit 40"), {"t": termo}).fetchall()
    return [dict(zip(["produto", "substancia", "apresentacao", "laboratorio", "tipo_receita",
                      "notificacao", "lista344", "preco_maximo_pe"], r)) for r in rows]
