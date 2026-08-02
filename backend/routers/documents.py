import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from database import get_db
from models.patient import Patient
from models.organization import User
from models.documents import ExamRequest, PhysioRequest, MedicalReport, TreatmentLeaflet
from schemas.documents import (
    ExamRequestCreate, ExamRequestOut,
    PhysioRequestCreate, PhysioRequestOut,
    MedicalReportCreate, MedicalReportOut,
    TreatmentLeafletCreate, TreatmentLeafletOut,
)
from deps import require_doctor, get_current_user

router = APIRouter(tags=["documents"])


def _get_patient_or_404(db: Session, patient_id: int, current_user: User) -> Patient:
    """Carrega o paciente garantindo isolamento por organização (fix IDOR A2).

    Retorna 404 se o paciente não existir OU pertencer a outra organização —
    evitando que um médico de uma clínica leia/crie/altere/apague documentos
    de paciente de outra clínica apenas mudando o id na URL. O 404 (em vez de
    403) evita vazar a existência de registros de terceiros. Superadmin vê tudo.
    """
    q = db.query(Patient).filter(Patient.id == patient_id)
    if current_user.role != "superadmin":
        q = q.filter(Patient.organization_id == current_user.organization_id)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    return patient


# ── RECEITAS ──────────────────────────────────────────────────────────────────
# O presc_router que vivia aqui foi REMOVIDO (auditoria 02/08): registrava o
# mesmo prefixo /patients/{id}/prescriptions de routers/patient_prescriptions.py
# (registrado antes em main.py) e ficava 100% sombreado — dois modelos de dados
# distintos disputando a mesma URL. Quem atende a rota é patient_prescriptions.


# ── SOLICITAÇÕES DE EXAME ─────────────────────────────────────────────────────

exam_router = APIRouter(prefix="/patients/{patient_id}/exams", dependencies=[Depends(require_doctor)])

@exam_router.get("", response_model=List[ExamRequestOut])
def list_exams(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    return db.query(ExamRequest).filter(ExamRequest.patient_id == patient_id).order_by(ExamRequest.date.desc()).all()

@exam_router.post("", response_model=ExamRequestOut, status_code=201)
def create_exam(patient_id: int, data: ExamRequestCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Aceita texto livre OU lista estruturada de exames (retrocompatibilidade)
    if not data.exams and not (data.free_text and data.free_text.strip()):
        raise HTTPException(422, "Informe o texto da solicitação ou ao menos um exame")
    _get_patient_or_404(db, patient_id, current_user)
    obj = ExamRequest(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@exam_router.get("/{doc_id}", response_model=ExamRequestOut)
def get_exam(patient_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = db.query(ExamRequest).filter(ExamRequest.id == doc_id, ExamRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    return obj

@exam_router.delete("/{doc_id}", status_code=204)
def delete_exam(patient_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = db.query(ExamRequest).filter(ExamRequest.id == doc_id, ExamRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    db.delete(obj)
    db.commit()


# ── FISIOTERAPIA ──────────────────────────────────────────────────────────────

physio_router = APIRouter(prefix="/patients/{patient_id}/physio", dependencies=[Depends(require_doctor)])

@physio_router.get("", response_model=List[PhysioRequestOut])
def list_physio(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    return db.query(PhysioRequest).filter(PhysioRequest.patient_id == patient_id).order_by(PhysioRequest.date.desc()).all()

@physio_router.post("", response_model=PhysioRequestOut, status_code=201)
def create_physio(patient_id: int, data: PhysioRequestCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = PhysioRequest(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@physio_router.get("/{doc_id}", response_model=PhysioRequestOut)
def get_physio(patient_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = db.query(PhysioRequest).filter(PhysioRequest.id == doc_id, PhysioRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    return obj

@physio_router.delete("/{doc_id}", status_code=204)
def delete_physio(patient_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = db.query(PhysioRequest).filter(PhysioRequest.id == doc_id, PhysioRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    db.delete(obj)
    db.commit()


# ── LAUDOS ────────────────────────────────────────────────────────────────────

# LEITURA liberada p/ qualquer usuário autenticado da organização (decisão do
# Valth 02/08: secretária PODE reimprimir laudo/atestado já gerado pra entregar
# no balcão). Criação/exclusão continuam exclusivas do médico (require_doctor
# por endpoint).
report_router = APIRouter(prefix="/patients/{patient_id}/reports", dependencies=[Depends(get_current_user)])

@report_router.get("", response_model=List[MedicalReportOut])
def list_reports(patient_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    return db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id).order_by(MedicalReport.date.desc()).all()

@report_router.post("", response_model=MedicalReportOut, status_code=201)
def create_report(patient_id: int, data: MedicalReportCreate, db: Session = Depends(get_db), current_user: User = Depends(require_doctor)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = MedicalReport(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@report_router.get("/{doc_id}", response_model=MedicalReportOut)
def get_report(patient_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = db.query(MedicalReport).filter(MedicalReport.id == doc_id, MedicalReport.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Laudo não encontrado")
    return obj

@report_router.delete("/{doc_id}", status_code=204)
def delete_report(patient_id: int, doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_doctor)):
    _get_patient_or_404(db, patient_id, current_user)
    obj = db.query(MedicalReport).filter(MedicalReport.id == doc_id, MedicalReport.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Laudo não encontrado")
    db.delete(obj)
    db.commit()


# ── FOLHETOS INFORMATIVOS ─────────────────────────────────────────────────────
# Folhetos são modelos genéricos (não vinculados a paciente), protegidos apenas
# por autenticação (get_current_user). Não expõem dados clínicos de pacientes.

leaflet_router = APIRouter(prefix="/leaflets", dependencies=[Depends(get_current_user)])

@leaflet_router.get("", response_model=List[TreatmentLeafletOut])
def list_leaflets(db: Session = Depends(get_db)):
    return db.query(TreatmentLeaflet).filter(TreatmentLeaflet.active == True).order_by(TreatmentLeaflet.category).all()

@leaflet_router.post("", response_model=TreatmentLeafletOut, status_code=201)
def create_leaflet(data: TreatmentLeafletCreate, db: Session = Depends(get_db)):
    obj = TreatmentLeaflet(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@leaflet_router.get("/{leaflet_id}", response_model=TreatmentLeafletOut)
def get_leaflet(leaflet_id: int, db: Session = Depends(get_db)):
    obj = db.query(TreatmentLeaflet).filter(TreatmentLeaflet.id == leaflet_id).first()
    if not obj:
        raise HTTPException(404, "Folheto não encontrado")
    return obj

@leaflet_router.delete("/{leaflet_id}", status_code=204)
def delete_leaflet(leaflet_id: int, db: Session = Depends(get_db)):
    obj = db.query(TreatmentLeaflet).filter(TreatmentLeaflet.id == leaflet_id).first()
    if not obj:
        raise HTTPException(404, "Folheto não encontrado")
    obj.active = False
    db.commit()


_UPLOAD_MAX_BYTES = 8 * 1024 * 1024  # 8 MB
_UPLOAD_MIMES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


@leaflet_router.post("/upload", response_model=TreatmentLeafletOut, status_code=201)
async def upload_leaflet(
    title: str = Form(...),
    category: str = Form("Geral"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload de folheto em ARQUIVO (PDF/imagem) — o botão da tela /folhetos
    chamava esta rota, que não existia (auditoria 02/08).

    O arquivo vira um data-URI embutido em content_html, então listagem,
    visualização, impressão e exclusão funcionam sem mudar modelo nem tela.
    """
    mime = (file.content_type or "").lower()
    if mime not in _UPLOAD_MIMES:
        raise HTTPException(415, "Formato não suportado — envie PDF, PNG, JPG ou WEBP")
    raw = await file.read()
    if len(raw) > _UPLOAD_MAX_BYTES:
        raise HTTPException(413, "Arquivo muito grande (máximo 8 MB)")
    if not raw:
        raise HTTPException(422, "Arquivo vazio")
    b64 = base64.b64encode(raw).decode()
    if mime == "application/pdf":
        html = (
            f'<embed src="data:{mime};base64,{b64}" type="{mime}" '
            'style="width:100%;min-height:75vh;border:0"/>'
        )
    else:
        html = f'<img src="data:{mime};base64,{b64}" style="max-width:100%" alt=""/>'
    obj = TreatmentLeaflet(title=title.strip(), category=category.strip() or "Geral", content_html=html, tags=[])
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


# ── Folheto PÚBLICO (link enviado ao paciente por WhatsApp — 02/08) ───────────
# Material educativo não é dado sensível; o link abre no navegador do paciente.

public_leaflet_router = APIRouter()


@public_leaflet_router.get("/folheto-publico/{leaflet_id}", response_class=HTMLResponse)
def view_leaflet_public(leaflet_id: int, nome: str = "", db: Session = Depends(get_db)):
    """`?nome=Maria` personaliza o folheto com o nome do paciente (02/08)."""
    import html as _html

    obj = db.query(TreatmentLeaflet).filter(
        TreatmentLeaflet.id == leaflet_id, TreatmentLeaflet.active == True
    ).first()
    if not obj:
        raise HTTPException(404, "Folheto não encontrado")
    nome_seguro = _html.escape(nome.strip())[:80]
    linha_nome = (
        f'<p class="paciente">Preparado para <b>{nome_seguro}</b></p>' if nome_seguro else ""
    )
    return HTMLResponse(f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{obj.title}</title>
<style>
  body {{ margin:0; font-family: Georgia, serif; background:#f5f5f0; color:#1e293b; }}
  .wrap {{ max-width: 720px; margin: 0 auto; padding: 24px 18px 48px; }}
  header {{ border-bottom: 3px double #142A4D; padding-bottom: 12px; margin-bottom: 20px; }}
  header h1 {{ font-size: 22px; margin: 0; color: #142A4D; }}
  header p {{ margin: 4px 0 0; font-size: 13px; color: #64748b; }}
  header p.paciente {{ font-size: 14px; color: #1e293b; margin-top: 8px; }}
  .content img, .content embed {{ max-width: 100%; }}
  footer {{ margin-top: 32px; font-size: 12px; color: #94a3b8; text-align: center; }}
  @media print {{ body {{ background: #fff; }} .wrap {{ padding: 0; max-width: none; }} }}
</style></head><body><div class="wrap">
<header><h1>{obj.title}</h1>
<p>Material informativo — Dr. Valth Menezes Guimarães · Ortopedia e Traumatologia · CRM-PB 6326</p>
{linha_nome}</header>
<div class="content">{obj.content_html}</div>
<footer>Este material é educativo e não substitui a avaliação médica individual.</footer>
</div></body></html>""")


# Exporta todos os roteadores
def include_all(app):
    app.include_router(exam_router)
    app.include_router(physio_router)
    app.include_router(report_router)
    app.include_router(leaflet_router)
    app.include_router(public_leaflet_router)
