"""
"Tudo de hoje" — um arquivo só com tudo o que o paciente leva (21/10/2026).

Valth: "gostei quando você juntou tudo num arquivo só para imprimir" e, no
mesmo dia, a impressora de Caruaru falhou e foi preciso mandar receita e guias
para o celular da Neide imprimir.

- GET  /patients/{id}/documents/{doc_id}/paginas  -> páginas do PDF anexado
  (guia SP/SADT) como imagem, para a tela juntar ao pacote de impressão.
- POST /patients/{id}/enviar-secretaria           -> recebe o PDF montado pela
  tela e manda à secretária da cidade do atendimento, pelo WhatsApp DA CLÍNICA
  (nunca pelo pessoal do Valth — regra dele para dado de paciente).
"""
import base64
import logging
import os
import re
from tzutil import today_br
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from deps import require_doctor
from models.organization import User
from models.patient import Patient
from models.patient_documents import PatientDocument
from routers.envio_documentos import _bytes_do_documento

logger = logging.getLogger("orthoclinic.pacote")
router = APIRouter(tags=["Pacote do dia"])

# Mesmas secretárias dos avisos do robô (whatsapp-ai/services/agenda-unidades.ts).
SECRETARIAS = {
    "caruaru": ("Neide", "5581999981901"),
    "campina": ("Poliana", "5583987905594"),
    "palmares": ("Cida", "5581992282472"),
}
# Instância da CLÍNICA em cada cidade.
INSTANCIAS = {"caruaru": "cto-caruaru", "campina": "cto-campina", "palmares": "cto-geral"}


def _cidade(nome: str) -> Optional[str]:
    n = (nome or "").lower()
    if "caruaru" in n:
        return "caruaru"
    if "campina" in n:
        return "campina"
    if "palmares" in n:
        return "palmares"
    return None


@router.get("/patients/{patient_id}/documents/{doc_id}/paginas")
def paginas_do_documento(patient_id: int, doc_id: int, db: Session = Depends(get_db), user: User = Depends(require_doctor)):
    doc = (db.query(PatientDocument)
           .join(Patient, Patient.id == PatientDocument.patient_id)
           .filter(PatientDocument.id == doc_id, PatientDocument.patient_id == patient_id,
                   Patient.organization_id == user.organization_id)
           .first())
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    conteudo = _bytes_do_documento(doc)
    if not conteudo:
        raise HTTPException(404, "Arquivo não encontrado")
    import fitz  # pymupdf
    try:
        pdf = fitz.open(stream=conteudo, filetype="pdf")
    except Exception:
        raise HTTPException(422, "O arquivo não é um PDF")
    paginas = []
    for p in pdf:
        png = p.get_pixmap(dpi=170).tobytes("png")
        paginas.append("data:image/png;base64," + base64.b64encode(png).decode())
    return {"paginas": paginas, "largura_mm": round(pdf[0].rect.width / 72 * 25.4, 1),
            "altura_mm": round(pdf[0].rect.height / 72 * 25.4, 1)}


@router.post("/patients/{patient_id}/enviar-secretaria")
async def enviar_secretaria(
    patient_id: int,
    arquivo: UploadFile = File(...),
    mensagem: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(require_doctor),
):
    paciente = db.query(Patient).filter(Patient.id == patient_id, Patient.organization_id == user.organization_id).first()
    if not paciente:
        raise HTTPException(404, "Paciente não encontrado")
    # Cidade = clínica do atendimento de hoje na sala de espera.
    r = db.execute(text(
        "select c.city from waiting_room_entries w join clinics c on c.id = w.clinic_id "
        "where w.patient_id = :p and w.entry_date = :d order by w.id desc limit 1"),
        {"p": patient_id, "d": today_br()}).fetchone()
    cidade = _cidade(r[0] if r else "")
    if not cidade:
        raise HTTPException(422, "Não sei a clínica de hoje deste paciente — não mandei nada.")
    nome_sec, numero = SECRETARIAS[cidade]
    instancia = INSTANCIAS[cidade]
    url = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
    key = os.getenv("EVOLUTION_API_KEY", "")
    if not url or not key:
        raise HTTPException(503, "WhatsApp não configurado no servidor.")
    pdf = await arquivo.read()
    if not pdf.startswith(b"%PDF"):
        raise HTTPException(422, "Arquivo inválido")
    nome_pac = (paciente.name or "PACIENTE").title()
    texto = mensagem.strip() or (
        f"{nome_sec}, a pedido do Dr. Valth: imprimir para o(a) paciente {nome_pac}. "
        f"Imprimir em tamanho real (100%).")
    arq = re.sub(r"[^A-Za-z0-9]+", "_", (paciente.name or "paciente").split()[0]) + "_documentos_de_hoje.pdf"
    async with httpx.AsyncClient(timeout=90) as cli:
        t = await cli.post(f"{url}/message/sendText/{instancia}", json={"number": numero, "text": texto}, headers={"apikey": key})
        m = await cli.post(f"{url}/message/sendMedia/{instancia}", headers={"apikey": key}, json={
            "number": numero, "mediatype": "document", "mimetype": "application/pdf",
            "fileName": arq, "media": base64.b64encode(pdf).decode()})
    ok = m.status_code < 300
    logger.info("[PACOTE] paciente %s -> %s (%s via %s): texto %s, pdf %s", patient_id, nome_sec, cidade, instancia, t.status_code, m.status_code)
    if not ok:
        raise HTTPException(502, "O WhatsApp não aceitou o arquivo.")
    return {"ok": True, "secretaria": nome_sec, "cidade": cidade}
