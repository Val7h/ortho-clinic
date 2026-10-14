"""
Envio de documentos do paciente pelo WhatsApp (pedido de procedimento).

14/10/2026 (Valth): "quando a gente for pedir um procedimento eu poder enviar
direto por aqui, através do WhatsApp, para o instrumentador: o documento do
paciente, a carteirinha e os PDFs dos exames" + "como tem outros
instrumentadores ... você deve ter um seletor para quem eu vou mandar".

- /contatos-envio: lista de destinatários (instrumentadores, OPME...) da organização.
- /patients/{id}/enviar-whatsapp: manda a mensagem, os PDFs escolhidos e,
  se pedido, o cartão de contato do paciente. Sai do WhatsApp PESSOAL do
  Valth (instância EVOLUTION_INSTANCE_PESSOAL, padrão "valth-pessoal").
Só médico usa (documento clínico).
"""
import base64
import logging
import mimetypes
import os
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.organization import User
from models.patient import Patient
from models.patient_documents import PatientDocument

logger = logging.getLogger("orthoclinic.envio")
router = APIRouter(tags=["Envio de documentos"])

INSTANCIA = os.getenv("EVOLUTION_INSTANCE_PESSOAL", "valth-pessoal")

# Contatos que já existiam no WhatsApp dele em 14/10/2026 (carga inicial).
CONTATOS_INICIAIS = [
    ("Digo (Rodrigo Gonçalves)", "5581991633134", "Instrumentador — bloqueios"),
    ("Weslley", "558195660007", "Instrumentador Caruaru"),
    ("Bruno", "558182503958", "Instrumentador Caruaru"),
    ("Viviane", "558199421562", "Instrumentadora Caruaru"),
    ("João Vitor", "558386922825", "Instrumentador"),
    ("Edilson (BZ)", "558192174649", "Instrumentador"),
    ("Vera Pedro", "558386133832", "Instrumentadora"),
    ("OPME Unimed CG", "558393122285", "OPME"),
]


def _garantir_tabela(db: Session, org_id: int):
    db.execute(text("""create table if not exists contatos_envio(
        id serial primary key, organization_id int not null, nome text not null,
        telefone text not null, funcao text, criado_em timestamptz default now())"""))
    n = db.execute(text("select count(*) from contatos_envio where organization_id=:o"), {"o": org_id}).scalar()
    if not n:
        for nome, tel, funcao in CONTATOS_INICIAIS:
            db.execute(text("insert into contatos_envio(organization_id,nome,telefone,funcao) values (:o,:n,:t,:f)"),
                       {"o": org_id, "n": nome, "t": tel, "f": funcao})
    db.commit()


def _so_digitos(tel: str) -> str:
    d = re.sub(r"\D", "", tel or "")
    return ("55" + d) if len(d) in (10, 11) else d


class ContatoIn(BaseModel):
    nome: str
    telefone: str
    funcao: Optional[str] = None


@router.get("/contatos-envio")
def listar_contatos(db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    _garantir_tabela(db, user.organization_id)
    rows = db.execute(text("select id,nome,telefone,funcao from contatos_envio where organization_id=:o order by nome"),
                      {"o": user.organization_id}).fetchall()
    return [{"id": r[0], "nome": r[1], "telefone": r[2], "funcao": r[3]} for r in rows]


@router.post("/contatos-envio", status_code=201)
def criar_contato(data: ContatoIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    _garantir_tabela(db, user.organization_id)
    tel = _so_digitos(data.telefone)
    if len(tel) < 12:
        raise HTTPException(422, "Telefone incompleto — use DDD + número.")
    r = db.execute(text("insert into contatos_envio(organization_id,nome,telefone,funcao) values (:o,:n,:t,:f) returning id"),
                   {"o": user.organization_id, "n": data.nome.strip(), "t": tel, "f": (data.funcao or "").strip() or None})
    db.commit()
    return {"id": r.scalar(), "nome": data.nome.strip(), "telefone": tel, "funcao": data.funcao}


@router.delete("/contatos-envio/{contato_id}", status_code=204)
def apagar_contato(contato_id: int, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    _garantir_tabela(db, user.organization_id)
    db.execute(text("delete from contatos_envio where id=:i and organization_id=:o"), {"i": contato_id, "o": user.organization_id})
    db.commit()


class EnvioIn(BaseModel):
    contato_id: int
    mensagem: str
    document_ids: List[int] = []
    enviar_contato_paciente: bool = True


def _evo(rota: str, payload: dict) -> bool:
    url = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
    key = os.getenv("EVOLUTION_API_KEY", "")
    if not url or not key:
        raise HTTPException(503, "WhatsApp não configurado no servidor.")
    r = httpx.post(f"{url}/{rota}/{INSTANCIA}", json=payload, headers={"apikey": key}, timeout=90)
    return r.status_code < 300 and '"key"' in r.text


def _bytes_do_documento(doc: PatientDocument) -> Optional[bytes]:
    from services.storage import ler_do_banco
    u = (doc.file_url or "").split("?")[0]
    if u.startswith("/uploads/"):
        achado = ler_do_banco(u[len("/uploads/"):])
        if achado:
            return achado[0]
        caminho = u.lstrip("/")
        if os.path.isfile(caminho):
            return open(caminho, "rb").read()
        return None
    if u.startswith("http"):
        r = httpx.get(u, timeout=60)
        return r.content if r.status_code == 200 else None
    return None


@router.post("/patients/{patient_id}/enviar-whatsapp")
def enviar_whatsapp(patient_id: int, data: EnvioIn, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    _garantir_tabela(db, user.organization_id)
    c = db.execute(text("select nome,telefone from contatos_envio where id=:i and organization_id=:o"),
                   {"i": data.contato_id, "o": user.organization_id}).fetchone()
    if not c:
        raise HTTPException(404, "Contato não encontrado.")
    nome_dest, numero = c[0], c[1]
    paciente = db.query(Patient).filter(Patient.id == patient_id, Patient.organization_id == user.organization_id).first()
    if not paciente:
        raise HTTPException(404, "Paciente não encontrado.")

    resultado = {"destinatario": nome_dest, "mensagem": False, "documentos": [], "contato_paciente": None}
    if data.mensagem.strip():
        resultado["mensagem"] = _evo("message/sendText", {"number": numero, "text": data.mensagem.strip()})
        if not resultado["mensagem"]:
            raise HTTPException(502, "O WhatsApp não aceitou a mensagem — nada foi enviado.")

    for doc_id in data.document_ids:
        doc = db.query(PatientDocument).filter(PatientDocument.id == doc_id, PatientDocument.patient_id == patient_id).first()
        if not doc:
            resultado["documentos"].append({"id": doc_id, "ok": False, "erro": "não encontrado"})
            continue
        conteudo = _bytes_do_documento(doc)
        if not conteudo:
            resultado["documentos"].append({"id": doc_id, "titulo": doc.title, "ok": False, "erro": "arquivo não encontrado"})
            continue
        nome_arq = os.path.basename((doc.file_url or "").split("?")[0]) or f"documento_{doc_id}.pdf"
        mime = mimetypes.guess_type(nome_arq)[0] or "application/pdf"
        tipo = "image" if mime.startswith("image/") else "document"
        primeiro = (paciente.name or "PACIENTE").split()[0].upper()
        ok = _evo("message/sendMedia", {
            "number": numero, "mediatype": tipo, "mimetype": mime,
            "fileName": f"{primeiro}_{(doc.title or 'documento')[:60]}".replace("/", "-").replace(" ", "_") + os.path.splitext(nome_arq)[1],
            "caption": doc.title or "", "media": base64.b64encode(conteudo).decode(),
        })
        resultado["documentos"].append({"id": doc_id, "titulo": doc.title, "ok": ok})

    if data.enviar_contato_paciente and paciente.phone:
        tel = _so_digitos(paciente.phone)
        resultado["contato_paciente"] = _evo("message/sendContact", {
            "number": numero,
            "contact": [{"fullName": (paciente.name or "").title(), "wuid": tel, "phoneNumber": "+" + tel}],
        })
    logger.info("[ENVIO] paciente %s -> %s: %d documento(s)", patient_id, nome_dest, len(data.document_ids))
    return resultado
