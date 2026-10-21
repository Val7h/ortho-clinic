"""
Foto/arquivo que o paciente manda no WhatsApp DA CLÍNICA vai sozinho para o
prontuário (21/10/2026).

Valth: "da próxima vez que alguém mandar algum arquivo ou alguma foto, você
deve guardar no prontuário" — a mãe da Maria Vitória mandou pelo robô a foto
dos remédios (carbonato de lítio, que interage com anti-inflamatório) e nada
apareceu no sistema.

Quem chama: um vigia na VPS (cron a cada 5 min) lê no banco do Evolution as
mídias recebidas nas instâncias da clínica e manda a lista para cá. Aqui:
  - cada mensagem é tratada uma vez só (tabela whatsapp_midias_importadas);
  - o paciente é achado pelo telefone (DDD + 8 últimos dígitos) — só anexa se
    houver UM paciente com aquele número; zero ou vários fica como pendente,
    nunca chuta (familiar mandando pelo próprio celular cai aqui);
  - a mídia é baixada do Evolution e entra nos Documentos como exame.
Autenticação: a mesma chave do Evolution que a VPS e este servidor já têm.
"""
import base64
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.organization import User
from models.patient import Patient
from models.patient_documents import PatientDocument
from services.storage import upload_file

logger = logging.getLogger("orthoclinic.midias_wa")
router = APIRouter(tags=["Mídias do WhatsApp"])

INSTANCIAS_CLINICA = {"cto-caruaru", "cto-campina", "cto-geral"}
# Números da equipe: o que eles mandam não é de paciente.
NUMEROS_EQUIPE = {"5581999981901", "5583987905594", "5581992282472", "5583993476410"}
MIMES_OK = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
BR = timezone(timedelta(hours=-3))


class MidiaIn(BaseModel):
    message_id: str
    instancia: str
    telefone: str                 # remoteJidAlt ou remoteJid @s.whatsapp.net (só dígitos)
    tipo: str                     # imageMessage | documentMessage
    timestamp: int
    legenda: Optional[str] = None
    nome_arquivo: Optional[str] = None


class LoteIn(BaseModel):
    midias: List[MidiaIn]


def _garantir_tabela(db: Session):
    db.execute(text("""create table if not exists whatsapp_midias_importadas(
        message_id text primary key, instancia text, telefone text, patient_id int,
        document_id int, situacao text, criado_em timestamptz default now())"""))
    db.commit()


def _chave(tel: str) -> Optional[str]:
    """DDD + 8 últimos dígitos: casa número com e sem o 9 e com/sem 55."""
    d = re.sub(r"\D", "", tel or "")
    if d.startswith("55") and len(d) >= 12:
        d = d[2:]
    if len(d) < 10:
        return None
    return d[:2] + d[-8:]


def _paciente_do_telefone(db: Session, tel: str) -> List[int]:
    k = _chave(tel)
    if not k:
        return []
    ids = []
    for pid, fone in db.execute(text("select id, phone from patients where active = true and phone is not null and organization_id = 1")).fetchall():
        if _chave(fone) == k:
            ids.append(pid)
    return ids


def _baixar_midia(instancia: str, message_id: str):
    url = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
    key = os.getenv("EVOLUTION_API_KEY", "")
    r = httpx.post(f"{url}/chat/getBase64FromMediaMessage/{instancia}", headers={"apikey": key},
                   json={"message": {"key": {"id": message_id}}, "convertToMp4": False}, timeout=90)
    if r.status_code >= 300:
        return None, None
    j = r.json()
    b64 = j.get("base64")
    if not b64:
        return None, None
    return base64.b64decode(b64), (j.get("mimetype") or "").split(";")[0].strip()


@router.post("/internal/whatsapp-midias")
def importar_midias(lote: LoteIn, apikey: str = Header(""), db: Session = Depends(get_db)):
    chave = os.getenv("EVOLUTION_API_KEY", "")
    if not chave or apikey != chave:
        raise HTTPException(401, "chave inválida")
    _garantir_tabela(db)
    resumo = {"anexadas": 0, "pendentes": 0, "ja_vistas": 0, "ignoradas": 0}
    for m in lote.midias:
        if db.execute(text("select 1 from whatsapp_midias_importadas where message_id = :i"), {"i": m.message_id}).first():
            resumo["ja_vistas"] += 1
            continue
        tel = re.sub(r"\D", "", m.telefone)

        def marcar(situacao: str, pid=None, did=None):
            db.execute(text("insert into whatsapp_midias_importadas(message_id,instancia,telefone,patient_id,document_id,situacao) "
                            "values (:i,:n,:t,:p,:d,:s) on conflict do nothing"),
                       {"i": m.message_id, "n": m.instancia, "t": tel, "p": pid, "d": did, "s": situacao})
            db.commit()

        if m.instancia not in INSTANCIAS_CLINICA or tel in NUMEROS_EQUIPE or m.tipo not in ("imageMessage", "documentMessage"):
            marcar("ignorada")
            resumo["ignoradas"] += 1
            continue
        ids = _paciente_do_telefone(db, tel)
        if len(ids) != 1:
            marcar("sem_paciente" if not ids else f"varios_pacientes:{','.join(map(str, ids))}")
            resumo["pendentes"] += 1
            continue
        conteudo, mime = _baixar_midia(m.instancia, m.message_id)
        if not conteudo:
            resumo["pendentes"] += 1  # tenta de novo no próximo ciclo
            continue
        if mime not in MIMES_OK:
            marcar(f"tipo_nao_suportado:{mime}", ids[0])
            resumo["ignoradas"] += 1
            continue
        quando = datetime.fromtimestamp(m.timestamp, BR)
        titulo = f"Enviado pelo paciente no WhatsApp — {quando:%d/%m %H:%M}"
        desc = " · ".join(x for x in [(m.legenda or "").strip(), (m.nome_arquivo or "").strip()] if x) or None
        file_url = upload_file(conteudo, f"{uuid.uuid4().hex}{MIMES_OK[mime]}", folder="patient_docs")
        doc = PatientDocument(
            patient_id=ids[0], title=titulo, category="exam", description=desc,
            date=quando.date(), tags=["whatsapp"], file_url=file_url,
            file_name=m.nome_arquivo or f"whatsapp{MIMES_OK[mime]}", mime_type=mime,
            file_size_kb=len(conteudo) // 1024,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        marcar("anexada", ids[0], doc.id)
        resumo["anexadas"] += 1
        logger.info("[MIDIA-WA] %s -> paciente %s doc %s", m.message_id, ids[0], doc.id)
    return resumo


@router.get("/whatsapp-midias/pendentes")
def pendentes(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    """Mídias que chegaram de número sem paciente (ou com vários) — para conferir à mão."""
    _garantir_tabela(db)
    rows = db.execute(text("select message_id, instancia, telefone, situacao, criado_em from whatsapp_midias_importadas "
                           "where situacao <> 'anexada' and situacao <> 'ignorada' order by criado_em desc limit 100")).fetchall()
    return [{"message_id": r[0], "instancia": r[1], "telefone": r[2], "situacao": r[3], "criado_em": r[4]} for r in rows]
