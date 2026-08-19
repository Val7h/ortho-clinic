"""
Unificar pacientes duplicados.

Nasceu de um caso real (19/08): o Alexandre César tinha DOIS cadastros — o
formulário de pré-consulta respondido (com exames e alergia a dipirona) num, e
o agendamento do dia no outro. O médico abria a ficha pelo painel e caía no
cadastro VAZIO. A Micheline tinha o mesmo problema.

Regras:
- Nada é apagado. Os filhos (consultas, receitas, laudos, anamneses, financeiro,
  fila, lembretes...) são MOVIDOS para o cadastro que fica; o duplicado é
  desativado, não excluído. Se der errado, os dados continuam lá.
- O cadastro que FICA manda: campo preenchido nele nunca é sobrescrito. Só os
  buracos são preenchidos com o que havia no duplicado.
- A varredura das tabelas é automática: qualquer modelo com `patient_id` entra,
  inclusive os que forem criados no futuro.
"""
import logging
import unicodedata
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from database import Base, get_db
from deps import get_current_user, require_doctor
from models.organization import User
from models.patient import Patient

logger = logging.getLogger("orthoclinic.merge")
router = APIRouter(prefix="/patients", tags=["patients"])

# Campos do paciente que valem a pena herdar do duplicado quando o que fica
# está com o campo vazio.
CAMPOS_HERDAVEIS = [
    "birthdate", "cpf", "rg", "phone", "phone2", "email", "gender",
    "civil_status", "occupation", "address_street", "address_city",
    "address_state", "address_zip", "address_number", "address_complement",
    "address_neighborhood", "blood_type", "allergies", "alergias",
    "chronic_conditions", "current_medications", "surgeries_history",
    "family_history", "insurance", "insurance_number", "insurance_plan",
    "emergency_contact", "emergency_phone", "emergency_relation",
    "referral_source", "referring_doctor", "photo_url",
]


def _modelos_com_paciente():
    """Todo modelo mapeado que tenha coluna patient_id."""
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if "patient_id" in {c.key for c in mapper.columns}:
            yield cls


class UnificarIn(BaseModel):
    duplicado_id: int


class UnificarOut(BaseModel):
    ficou_id: int
    duplicado_id: int
    registros_movidos: dict
    campos_herdados: List[str]
    total_movido: int


@router.post("/{destino_id}/unificar", response_model=UnificarOut)
def unificar(
    destino_id: int,
    data: UnificarIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    if destino_id == data.duplicado_id:
        raise HTTPException(422, "São o mesmo cadastro")

    def buscar(pid: int) -> Patient:
        p = db.query(Patient).filter(Patient.id == pid).first()
        if not p:
            raise HTTPException(404, f"Paciente {pid} não encontrado")
        if current_user.role != "superadmin" and p.organization_id != current_user.organization_id:
            raise HTTPException(403, "Paciente de outra conta")
        return p

    destino = buscar(destino_id)
    duplicado = buscar(data.duplicado_id)

    if destino.organization_id != duplicado.organization_id:
        raise HTTPException(409, "Os dois cadastros são de contas diferentes")

    # 1. move os filhos
    movidos: dict = {}
    for cls in _modelos_com_paciente():
        tabela = sa_inspect(cls).local_table.name
        n = (
            db.query(cls)
            .filter(cls.patient_id == duplicado.id)
            .update({"patient_id": destino.id}, synchronize_session=False)
        )
        if n:
            movidos[tabela] = n

    # 2. preenche só os buracos do que fica
    herdados = []
    for campo in CAMPOS_HERDAVEIS:
        if not hasattr(destino, campo):
            continue
        atual = getattr(destino, campo, None)
        vindo = getattr(duplicado, campo, None)
        vazio = atual is None or (isinstance(atual, str) and not atual.strip())
        tem = vindo is not None and (not isinstance(vindo, str) or vindo.strip())
        if vazio and tem:
            setattr(destino, campo, vindo)
            herdados.append(campo)

    # 3. o duplicado sai de cena sem ser apagado
    duplicado.active = False
    marca = f"[UNIFICADO em {destino.id}] "
    duplicado.notes = marca + (duplicado.notes or "")
    if duplicado.cpf:
        # libera o CPF: a unicidade e (organization_id, cpf) e o cadastro que
        # fica precisa poder ficar com ele.
        if not destino.cpf:
            destino.cpf = duplicado.cpf
        duplicado.cpf = None

    db.commit()
    db.refresh(destino)

    total = sum(movidos.values())
    logger.info("Pacientes unificados: %s <- %s (%s registros)", destino.id, duplicado.id, total)
    return UnificarOut(
        ficou_id=destino.id,
        duplicado_id=duplicado.id,
        registros_movidos=movidos,
        campos_herdados=herdados,
        total_movido=total,
    )


class DuplicadoOut(BaseModel):
    motivo: str
    pacientes: List[dict]


@router.get("/duplicados/possiveis", response_model=List[DuplicadoOut])
def possiveis_duplicados(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agrupa cadastros ativos que parecem a mesma pessoa: mesmo CPF, mesmo
    telefone (só os dígitos) ou mesmo nome + mesma data de nascimento."""
    q = db.query(Patient).filter(Patient.active == True)  # noqa: E712
    if current_user.role != "superadmin":
        q = q.filter(Patient.organization_id == current_user.organization_id)
    pacientes = q.all()

    def so_digitos(t):
        return "".join(c for c in (t or "") if c.isdigit())

    def nome_chave(t):
        """Sem acento, sem caixa, sem espaco duplicado.

        Sem isto a deteccao perdia justamente o caso que a motivou: o mesmo
        Alexandre estava como "Alexandre César" num cadastro e "ALEXANDRE
        CESAR" no outro — para o computador, dois nomes diferentes.
        """
        base = unicodedata.normalize("NFD", (t or "").strip().lower())
        base = "".join(c for c in base if unicodedata.category(c) != "Mn")
        return " ".join(base.split())

    grupos: dict = {}
    for p in pacientes:
        chaves = []
        if p.cpf and so_digitos(p.cpf):
            chaves.append(("CPF igual", so_digitos(p.cpf)))
        tel = so_digitos(p.phone)
        if len(tel) >= 8:
            chaves.append(("telefone igual", tel[-8:]))
        if p.name and p.birthdate:
            chaves.append(("nome e nascimento iguais",
                           f"{nome_chave(p.name)}|{p.birthdate}"))
        for motivo, chave in chaves:
            grupos.setdefault((motivo, chave), set()).add(p.id)

    vistos = set()
    saida = []
    for (motivo, _chave), ids in grupos.items():
        if len(ids) < 2:
            continue
        assinatura = tuple(sorted(ids))
        if assinatura in vistos:
            continue
        vistos.add(assinatura)
        detalhes = []
        for pid in sorted(ids):
            p = next(x for x in pacientes if x.id == pid)
            detalhes.append({
                "id": p.id, "nome": p.name, "cpf": p.cpf,
                "telefone": p.phone,
                "nascimento": p.birthdate.isoformat() if p.birthdate else None,
                "criado_em": p.created_at.isoformat() if p.created_at else None,
            })
        saida.append(DuplicadoOut(motivo=motivo, pacientes=detalhes))
    return saida
