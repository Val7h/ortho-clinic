"""Rotas do emissor unico de documentos (27/11/2026, P3). Regras em services/emissor.py.

Duas portas, como o Escriba:
- login de medico (a sessao no PC entra com o login do medico; secretaria recebe 403);
- chave da ponte do PC (X-Escriba-Ponte), em /emissor/ponte/*.
O paciente tem de ser da conta de quem pede.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor, require_superadmin
from models.organization import User
from models.patient import Patient
from routers.escriba import exigir_ponte
from services import emissor as E

router = APIRouter(prefix="/emissor", tags=["emissor"])


class ReservaIn(BaseModel):
    patient_id: int
    tipo: str                         # receita | exame | fisio | encaminhamento | atestado | justificativa
    itens: List[str] = []             # texto cru de cada item (o servidor calcula a chave); vazio = tira do conteudo
    conteudo: Optional[str] = None    # texto do documento (receita: os remedios saem daqui)
    origem: Optional[str] = None      # pedido/botao de origem
    dono: Optional[str] = None        # sessao | atendente | escriba | tela
    troca: bool = False               # decisao 1 (27/11): troca so com a ordem "troca"/"nova" ou esta marca
    ordem: Optional[str] = None       # a ordem dita/escrita; "troca"/"nova" nela vale como troca=True
    parcial: bool = False             # reserva so os novos (padrao: tudo ou nada)
    guia: bool = False                # guia SP/SADT: prazo de 6 min e no maximo 5 linhas


class TokenIn(BaseModel):
    token: str
    motivo: str = ""


class LiberarIn(BaseModel):
    motivo: str = ""


def _org_do_paciente(db: Session, pid: int, org: Optional[int], superadmin: bool = False) -> int:
    p = db.query(Patient).filter(Patient.id == pid).first()
    if not p or (not superadmin and (p.organization_id or 1) != org):
        raise HTTPException(404, "Paciente não encontrado")
    return p.organization_id or 1


def _org(u: User) -> int:
    return getattr(u, "organization_id", None) or 1


def _reservar(db: Session, body: ReservaIn, org: int, dono_padrao: str) -> dict:
    return E.reservar(db, org, body.patient_id, body.tipo, body.itens, body.conteudo, origem=body.origem,
                      dono=body.dono or dono_padrao, troca=E.pediu_troca(body.troca, body.ordem),
                      parcial=body.parcial, guia=body.guia)


# ── login de medico ──
@router.post("/reservar")
def reservar(body: ReservaIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    org = _org_do_paciente(db, body.patient_id, _org(u), u.role == "superadmin")
    return _reservar(db, body, org, "sessao")


@router.post("/lotes/{lote}/falhou")
def lote_falhou(lote: str, body: TokenIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    return E.falhou(db, _org(u), lote, body.token, body.motivo[:60])


@router.post("/lotes/{lote}/liberar")
def lote_liberar(lote: str, body: Optional[LiberarIn] = None, db: Session = Depends(get_db),
                 u: User = Depends(require_doctor)):
    """O PC morreu e perdeu o token: o MEDICO (mesma conta) libera a reserva presa. Fica "falhou", com quem liberou."""
    return E.falhou(db, _org(u), lote, None, ((body.motivo if body else "") or "")[:60], liberado_por=u.id)


@router.post("/lotes/{lote}/renovar")
def lote_renovar(lote: str, body: TokenIn, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    return E.renovar(db, _org(u), lote, body.token)


@router.get("/paciente/{patient_id}/hoje")
def paciente_hoje(patient_id: int, db: Session = Depends(get_db), u: User = Depends(require_doctor)):
    org = _org_do_paciente(db, patient_id, _org(u), u.role == "superadmin")
    return E.hoje(db, org, patient_id)


# ── ponte do PC ──
@router.post("/ponte/reservar")
def ponte_reservar(body: ReservaIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    return _reservar(db, body, _org_do_paciente(db, body.patient_id, org), "escriba")


@router.post("/ponte/lotes/{lote}/falhou")
def ponte_lote_falhou(lote: str, body: TokenIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    return E.falhou(db, org, lote, body.token, body.motivo[:60])


@router.post("/ponte/lotes/{lote}/renovar")
def ponte_lote_renovar(lote: str, body: TokenIn, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    return E.renovar(db, org, lote, body.token)


@router.get("/ponte/paciente/{patient_id}/hoje")
def ponte_paciente_hoje(patient_id: int, db: Session = Depends(get_db), org: int = Depends(exigir_ponte)):
    return E.hoje(db, _org_do_paciente(db, patient_id, org), patient_id)


# ── P6 (27/11): so MEDIR as chamadas de IA do site (nao muda quando nem quantas vezes a IA e chamada) ──
ia_router = APIRouter(prefix="/ia", tags=["ia"])


@ia_router.get("/contagem")
def ia_contagem(u: User = Depends(require_superadmin)):
    """Numeros do dia por rota + chamadas por sessao (mediana e p90). Sem texto de paciente, sem identificador.
    So superadmin: o contador e do processo inteiro (todas as contas)."""
    from services.ia_limits import contagem
    return contagem()
