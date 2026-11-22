"""
Fila de impressão remota por clínica (03/11/2026).

Valth: o documento fica pronto na consulta (receita, pedido de exame, laudo,
encaminhamento) e sai SOZINHO na impressora da clínica. Um computador da
clínica fica com a página /impressora aberta (Chrome com --kiosk-printing):
ela consulta a fila a cada 5 s, desenha o documento com o MESMO papel que o
médico imprime e manda direto para a impressora padrão do Windows.

- POST /print-jobs              -> põe um documento salvo na fila da clínica (médico)
- GET  /print-jobs/pending      -> o que falta imprimir na clínica, do mais antigo
                                   ao mais novo, já com paciente, clínica e conteúdo
- POST /print-jobs/{id}/done    -> marca como impresso
- GET  /print-jobs/{id}/paginas -> as páginas (imagem) de um documento em PDF da fila

18/11/2026 (Valth: "a fila não imprime a guia SADT... deve ser corrigido agora"): a guia
SP/SADT é um PDF guardado nos Documentos do paciente. Entra na fila como kind "documento"
(ref_id = id do documento) e a página da clínica imprime as páginas como imagem, no
mesmo formato do "Tudo de hoje" (guia da Unimed é deitada).

A tabela é criada na primeira chamada (create table if not exists), como em
envio_documentos.py — sem migração. Log só com ids, nunca dado de paciente.
"""
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import bindparam, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from routers.entregues import marcar as marcar_entregue
from deps import get_current_user, require_doctor
from models.clinic import Clinic
from models.documents import ExamRequest, MedicalReport
from models.organization import User
from models.patient import Patient
from models.patient_documents import PatientDocument
from models.patient_rx import PatientRx

logger = logging.getLogger("orthoclinic.impressora")
router = APIRouter(tags=["Impressora da clínica"])

# Pedido na fila há mais tempo que isso não sai mais sozinho: evita que um
# computador desligado por dias, ao voltar, despeje papel velho na clínica.
HORAS_VALIDADE = 24
# 22/11 (revisão 19/11, item 6): o GET /pending RESERVA o pedido para a aba/PC que pediu
# (claimed_by = marca gerada pela página). Sem o /done, a reserva vence nesse prazo e
# outra aba/PC pode imprimir.
MINUTOS_RESERVA = 2

_tabela_ok = False


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _corte_validade() -> datetime:
    return _agora() - timedelta(hours=HORAS_VALIDADE)


def _garantir_tabela(db: Session) -> None:
    global _tabela_ok
    if _tabela_ok:
        return
    try:
        _criar_tabela(db)
    except Exception:  # dois processos criando ao mesmo tempo: o outro ganhou; tenta de novo na próxima chamada
        db.rollback()
        logger.exception("[IMPRESSORA] falhou preparar a tabela print_jobs")
        return
    _tabela_ok = True


def _criar_tabela(db: Session) -> None:
    # SQL portátil (Postgres em produção, SQLite nos testes); só o tipo do id muda.
    sqlite = db.get_bind().dialect.name == "sqlite"
    id_col = "id integer primary key autoincrement" if sqlite else "id serial primary key"
    db.execute(text(f"""create table if not exists print_jobs(
        {id_col},
        organization_id int not null,
        clinic_id int not null,
        patient_id int not null,
        kind text not null,
        ref_id int not null,
        opcoes text,
        created_at timestamptz not null default CURRENT_TIMESTAMP,
        printed_at timestamptz,
        created_by int,
        claimed_at timestamptz,
        claimed_by text)"""))
    # Tabela antiga (antes de 22/11) não tem as colunas da reserva.
    cols = {c["name"] for c in inspect(db.get_bind()).get_columns("print_jobs")} if sqlite else {
        r[0] for r in db.execute(text(
            "select column_name from information_schema.columns where table_name='print_jobs'")).fetchall()}
    if "claimed_at" not in cols:
        db.execute(text("alter table print_jobs add column claimed_at timestamptz"))
    if "claimed_by" not in cols:
        db.execute(text("alter table print_jobs add column claimed_by text"))
    db.execute(text("create index if not exists ix_print_jobs_pendentes "
                    "on print_jobs(organization_id, clinic_id, created_at) where printed_at is null"))
    if not sqlite:
        # 18/11: a tabela antiga só aceitava 4 tipos; "documento" (guia em PDF) entra também.
        db.execute(text("alter table print_jobs drop constraint if exists print_jobs_kind_check"))
    # 22/11 (revisão 19/11, item 6): trava de clique duplo NO BANCO. Antes do índice único,
    # tira da fila o que já não sai (vencido há mais de 24 h, que o /pending já ignora) e as
    # duplicatas vivas (fica a mais antiga). Mesma regra dos órfãos: sai da fila, nada imprime.
    agora = _agora()
    db.execute(text("update print_jobs set printed_at=:a where printed_at is null and created_at <= :c"),
               {"a": agora, "c": _corte_validade()})
    db.execute(text(
        "update print_jobs set printed_at=:a where printed_at is null and id not in ("
        "select min(id) from print_jobs where printed_at is null "
        "group by organization_id, clinic_id, kind, ref_id)"), {"a": agora})
    db.execute(text("create unique index if not exists ux_print_jobs_um_vivo "
                    "on print_jobs(organization_id, clinic_id, kind, ref_id) where printed_at is null"))
    db.commit()


def _mesma_org(org_do_registro: Optional[int], user: User) -> bool:
    # Linha legada com organization_id NULL é da conta 1 (mesma regra do tenant_guard).
    return (org_do_registro or 1) == (user.organization_id or 1)


def _clinica(db: Session, clinic_id: int, user: User) -> Clinic:
    c = db.query(Clinic).filter(Clinic.id == clinic_id).first()
    if not c or not _mesma_org(c.organization_id, user):
        raise HTTPException(404, "Clínica não encontrada")
    return c


_MODELO = {"receita": PatientRx, "exame": ExamRequest, "laudo": MedicalReport, "encaminhamento": MedicalReport,
           "documento": PatientDocument}


def _registro(db: Session, kind: str, ref_id: int, user: User):
    modelo = _MODELO.get(kind)
    if modelo is None:
        return None
    r = db.query(modelo).filter(modelo.id == ref_id).first()
    if not r or not _mesma_org(r.organization_id, user):
        return None
    # Só PDF guardado no servidor vai para a impressora (guia SP/SADT); foto e link de fora não.
    if kind == "documento" and "pdf" not in (r.mime_type or "").lower():
        return None
    return r


def _iso(v: Any) -> Optional[str]:
    return v.isoformat() if v is not None and hasattr(v, "isoformat") else (str(v) if v is not None else None)


def _documento(kind: str, r) -> dict:
    if kind == "receita":
        return {"date": _iso(r.date), "prescription_type": r.prescription_type or "simples",
                "medications": r.medications or [], "instructions": r.instructions or "",
                "patient_address": r.patient_address, "patient_phone": r.patient_phone}
    if kind == "exame":
        return {"date": _iso(r.date), "free_text": r.free_text or "", "exams": r.exams or []}
    if kind == "documento":
        return {"date": _iso(r.date), "title": r.title or ""}
    return {"date": _iso(r.date), "report_type": r.report_type, "title": r.title or "", "content": r.content or ""}


def _paciente(p: Patient) -> dict:
    # Os mesmos nomes de campo que a tela da consulta recebe do /patients/{id}.
    return {"id": p.id, "name": p.name, "birthdate": _iso(p.birthdate), "cpf": p.cpf, "phone": p.phone,
            "address_street": p.address_street, "address_city": p.address_city, "address_state": p.address_state,
            "insurance": p.insurance, "cids": p.cids or []}


def _clinica_dict(c: Clinic) -> dict:
    return {"id": c.id, "name": c.name, "city": c.city, "state": c.state, "address": c.address, "phone": c.phone}


class PrintJobIn(BaseModel):
    kind: Literal["receita", "exame", "laudo", "encaminhamento", "documento"]
    ref_id: int
    clinic_id: int
    # Preferências de papel do médico (tamanho da letra da receita/pedido),
    # que ficam no navegador dele — vão junto para sair igual na clínica.
    opcoes: Optional[dict] = None


@router.post("/print-jobs", status_code=201)
def criar_job(data: PrintJobIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    _garantir_tabela(db)
    _clinica(db, data.clinic_id, user)
    r = _registro(db, data.kind, data.ref_id, user)
    if r is None:
        raise HTTPException(404, "Documento não encontrado — salve antes de mandar para a impressora.")
    org = user.organization_id or 1
    chave = {"o": org, "c": data.clinic_id, "k": data.kind, "r": data.ref_id}
    # O mesmo documento vencido (mais de 24 h, nunca saiu) sai da fila antes, para o índice único
    # deixar entrar o pedido novo.
    db.execute(text(
        "update print_jobs set printed_at=:a where organization_id=:o and clinic_id=:c and kind=:k "
        "and ref_id=:r and printed_at is null and created_at <= :corte"),
        {**chave, "a": _agora(), "corte": _corte_validade()})

    def _ja_na_fila():
        return db.execute(text(
            "select id from print_jobs where organization_id=:o and clinic_id=:c and kind=:k and ref_id=:r "
            "and printed_at is null order by id limit 1"), chave).scalar()

    # Clique duplo não imprime duas vezes: o mesmo documento ainda na fila da mesma clínica volta o que já existe.
    ja = _ja_na_fila()
    if ja:
        db.commit()
        return {"id": ja, "ja_estava_na_fila": True}
    try:
        novo = db.execute(text(
            "insert into print_jobs(organization_id,clinic_id,patient_id,kind,ref_id,opcoes,created_by) "
            "values (:o,:c,:p,:k,:r,:op,:u) returning id"),
            {**chave, "p": r.patient_id, "op": json.dumps(data.opcoes) if data.opcoes else None,
             "u": user.id}).scalar()
        db.commit()
    except IntegrityError:
        # 22/11: dois cliques ao mesmo tempo — o índice único do banco barrou o segundo.
        db.rollback()
        ja = _ja_na_fila()
        if not ja:
            raise
        return {"id": ja, "ja_estava_na_fila": True}
    logger.info("[IMPRESSORA] job %s criado: clinica %s, %s %s", novo, data.clinic_id, data.kind, data.ref_id)
    return {"id": novo, "ja_estava_na_fila": False}


@router.get("/print-jobs/pending")
def pendentes(clinic_id: int = Query(...), marca: Optional[str] = Query(None, max_length=64),
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """22/11 (revisão 19/11, item 6): cada pedido devolvido fica RESERVADO para quem pediu (marca da
    aba/PC). Outra aba ou outro PC só o recebe se a reserva vencer (2 min sem /done). Página antiga,
    sem marca, reserva com a marca do login (como antes: ela mesma continua vendo o pedido)."""
    _garantir_tabela(db)
    clinica = _clinica(db, clinic_id, user)
    org = user.organization_id or 1
    m = re.sub(r"[^A-Za-z0-9_.:-]", "", marca or "")[:64] or f"usuario:{user.id}"
    agora = _agora()
    vence = agora - timedelta(minutes=MINUTOS_RESERVA)
    livre = "(claimed_at is null or claimed_at <= :vence or claimed_by = :m)"
    rows = db.execute(text(
        "select id, patient_id, kind, ref_id, opcoes, created_at from print_jobs "
        "where organization_id=:o and clinic_id=:c and printed_at is null "
        f"and created_at > :corte and {livre} order by created_at, id limit 50"),
        {"o": org, "c": clinic_id, "corte": _corte_validade(), "vence": vence, "m": m}).fetchall()
    # Reserva um a um: o update só pega se ainda estiver livre (duas abas ao mesmo tempo: uma ganha).
    reservados = []
    for row in rows:
        res = db.execute(text(
            f"update print_jobs set claimed_at=:a, claimed_by=:m where id=:i and organization_id=:o "
            f"and printed_at is null and {livre}"),
            {"a": agora, "m": m, "i": row[0], "o": org, "vence": vence})
        if res.rowcount == 1:
            reservados.append(row)
    db.commit()
    saida, orfaos = [], []
    for job_id, patient_id, kind, ref_id, opcoes, criado in reservados:
        r = _registro(db, kind, ref_id, user)
        p = db.query(Patient).filter(Patient.id == patient_id).first() if r is not None else None
        if r is None or p is None or not _mesma_org(p.organization_id, user):
            orfaos.append(job_id)  # documento apagado depois de ir para a fila
            continue
        try:
            op = json.loads(opcoes) if opcoes else {}
        except ValueError:
            op = {}
        saida.append({"id": job_id, "kind": kind, "ref_id": ref_id, "created_at": _iso(criado),
                      "opcoes": op, "clinic": _clinica_dict(clinica), "patient": _paciente(p),
                      "documento": _documento(kind, r)})
    if orfaos:
        # Sai da fila para não travar a clínica; nada é impresso.
        db.execute(text("update print_jobs set printed_at=:a where id in :ids and organization_id=:o")
                   .bindparams(bindparam("ids", expanding=True)),
                   {"a": _agora(), "ids": orfaos, "o": org})
        db.commit()
        logger.info("[IMPRESSORA] %d job(s) sem documento retirados da fila: %s", len(orfaos), orfaos)
    return {"clinic": _clinica_dict(clinica), "jobs": saida}


@router.post("/print-jobs/{job_id}/done")
def marcar_impresso(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _garantir_tabela(db)
    r = db.execute(text(
        "update print_jobs set printed_at=coalesce(printed_at, :a) "
        "where id=:i and organization_id=:o returning id, patient_id, kind, ref_id"),
        {"a": _agora(), "i": job_id, "o": user.organization_id or 1}).first()
    if not r:
        db.commit()
        raise HTTPException(404, "Pedido de impressão não encontrado")
    # 19/11: saiu na impressora da clínica = entregue (versão oficial, não se apaga)
    db.commit()
    try:
        marcar_entregue(db, user, r[1], "laudo" if r[2] == "encaminhamento" else r[2], r[3], "impressora da clinica")
        db.commit()
    except Exception:  # a marca nunca derruba o "impresso" (senão a clínica reimprime)
        db.rollback()
        logger.exception("[ENTREGUE] falhou marcar job %s", job_id)
    logger.info("[IMPRESSORA] job %s impresso", job_id)
    return {"ok": True}


@router.get("/print-jobs/{job_id}/paginas")
def paginas_do_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Páginas (PNG) do PDF de um pedido "documento" da fila — a página da clínica imprime como imagem."""
    _garantir_tabela(db)
    linha = db.execute(text(
        # 19/11 (revisão): só pedido ainda VIVO na fila (até 24 h e não impresso há mais de 1 h). Antes, qualquer
        # login baixava a guia inteira de qualquer pedido antigo, pelo número.
        "select kind, ref_id from print_jobs where id=:i and organization_id=:o "
        "and created_at > :corte "
        "and (printed_at is null or printed_at > :uma_hora)"),
        {"i": job_id, "o": user.organization_id or 1, "corte": _corte_validade(),
         "uma_hora": _agora() - timedelta(hours=1)}).fetchone()
    if not linha or linha[0] != "documento":
        raise HTTPException(404, "Pedido de impressão não encontrado")
    doc = _registro(db, "documento", linha[1], user)
    if doc is None:
        raise HTTPException(404, "Documento não encontrado")
    import base64
    from routers.envio_documentos import _bytes_do_documento
    conteudo = _bytes_do_documento(doc)
    if not conteudo:
        raise HTTPException(404, "Arquivo não encontrado")
    import fitz  # pymupdf
    try:
        pdf = fitz.open(stream=conteudo, filetype="pdf")
    except Exception:
        raise HTTPException(422, "O arquivo não é um PDF")
    if pdf.page_count == 0 or pdf.page_count > 12:
        raise HTTPException(422, "PDF vazio ou grande demais para a impressora da clínica")
    paginas = ["data:image/png;base64," + base64.b64encode(p.get_pixmap(dpi=170).tobytes("png")).decode() for p in pdf]
    return {"paginas": paginas, "largura_mm": round(pdf[0].rect.width / 72 * 25.4, 1),
            "altura_mm": round(pdf[0].rect.height / 72 * 25.4, 1)}
