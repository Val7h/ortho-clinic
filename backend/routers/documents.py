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
report_router = APIRouter(
    prefix="/patients/{patient_id}/reports",
    # 28/09 (Valth): login de secretária conseguia criar/editar/excluir laudo,
    # atestado e encaminhamento — documento médico-legal é exclusivo do médico.
    dependencies=[Depends(require_doctor)],
)

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
def view_leaflet_public(
    leaflet_id: int, nome: str = "", clinica: str = "", cidade: str = "", uf: str = "", fone: str = "",
    db: Session = Depends(get_db),
):
    """`?nome=Maria` personaliza o folheto com o nome do paciente (02/08).

    07/10 (Valth): o folheto impresso saía SEM o papel timbrado dele e com o
    CRM da Paraíba até em Caruaru. Agora sai com o mesmo timbrado dos demais
    documentos (logo, nome, CREMEPE/CRM-PB conforme o estado, clínica e
    telefone — SEM a cidade no alto) e fecha com cidade/data e assinatura.
    `?clinica=&cidade=&uf=&fone=` vêm da clínica em que ele está atendendo."""
    import html as _html
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    obj = db.query(TreatmentLeaflet).filter(
        TreatmentLeaflet.id == leaflet_id, TreatmentLeaflet.active == True
    ).first()
    if not obj:
        raise HTTPException(404, "Folheto não encontrado")
    nome_seguro = _html.escape(nome.strip())[:80]
    linha_nome = (
        f'<p class="paciente">Preparado para <b>{nome_seguro}</b></p>' if nome_seguro else ""
    )
    e = lambda s, n=80: _html.escape((s or "").strip())[:n]
    clinica_s, cidade_s, uf_s, fone_s = e(clinica), e(cidade), e(uf, 2).upper(), e(fone, 30)
    # sem clínica informada (link antigo enviado por WhatsApp) mostra os dois registros
    reg_curto = {"PE": "CREMEPE 16.551", "PB": "CRM-PB 6326"}.get(uf_s, "CREMEPE 16.551 · CRM-PB 6326")
    registro = f"{reg_curto} · TEOT 15090"
    linha_clinica = " · ".join(x for x in (clinica_s, fone_s) if x)
    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
             "setembro", "outubro", "novembro", "dezembro"]
    hoje = _dt.now(_tz.utc) - _td(hours=3)
    data_ext = f"{'1º' if hoje.day == 1 else hoje.day} de {meses[hoje.month - 1]} de {hoje.year}"
    local = f"{cidade_s} – {uf_s}, " if cidade_s else ""
    logo = (
        '<svg width="46" height="46" viewBox="0 0 100 100" style="display:block;margin:0 auto">'
        '<circle cx="50" cy="50" r="44" fill="none" stroke="#142A4D" stroke-width="7"/>'
        '<circle cx="50" cy="50" r="33" fill="none" stroke="#3FB3A0" stroke-width="6"/>'
        '<circle cx="50" cy="50" r="23" fill="none" stroke="#142A4D" stroke-width="3.5"/>'
        '<circle cx="6" cy="50" r="4.5" fill="#142A4D"/><circle cx="94" cy="50" r="4.5" fill="#142A4D"/>'
        '<path d="M42 30 h16 v12 h12 v16 h-12 v12 h-16 v-12 h-12 v-16 h12 z" fill="#3FB3A0"/></svg>'
    )
    timbrado = f"""<div class="timbrado">{logo}
<p class="wm"><span style="color:#142A4D">ORTHO</span><span style="color:#3FB3A0">MEDIC</span></p>
<p class="dr">Dr. Valth Menezes Guimarães</p>
<p class="esp">Ortopedia e Traumatologia</p>
<p class="reg">{registro}</p>
{f'<p class="cli">{linha_clinica}</p>' if linha_clinica else ''}
</div><div class="filete1"></div><div class="filete2"></div>"""
    fecho = f"""<div class="fecho"><p class="local">{local}{data_ext}.</p>
<div class="ass"><div class="linha"><p class="n">Dr. Valth Menezes Guimarães</p>
<p class="t">Ortopedista e Traumatologista</p><p class="r">{reg_curto}</p></div></div></div>"""
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
  .timbrado {{ text-align:center; padding-bottom:10px; }}
  .timbrado p {{ margin:0; }}
  .timbrado .wm {{ font-size:12px; font-weight:700; letter-spacing:4px; margin:6px 0 8px; }}
  .timbrado .dr {{ font-size:18px; font-weight:700; letter-spacing:1px; color:#0F2D5E; }}
  .timbrado .esp {{ font-size:10px; text-transform:uppercase; letter-spacing:3px; color:#555; margin-top:3px; }}
  .timbrado .reg {{ font-size:9.5px; color:#777; letter-spacing:.5px; margin-top:3px; }}
  .timbrado .cli {{ font-size:9px; color:#999; margin-top:4px; }}
  .filete1 {{ border-top:2.5px solid #142A4D; margin-bottom:2px; }}
  .filete2 {{ border-top:1px solid #3FB3A0; margin-bottom:18px; }}
  .fecho {{ page-break-inside:avoid; break-inside:avoid; }}
  .fecho .local {{ font-size:12.5px; text-align:right; font-style:italic; margin:30px 0 44px; }}
  .fecho .ass {{ display:flex; justify-content:center; }}
  .fecho .linha {{ text-align:center; width:310px; border-top:1px solid #1a1a1a; padding-top:9px; }}
  .fecho .linha p {{ margin:0; }}
  .fecho .n {{ font-size:13.5px; font-weight:700; letter-spacing:.5px; }}
  .fecho .t {{ font-size:10.5px; color:#444; text-transform:uppercase; letter-spacing:1.5px; margin-top:2px; }}
  .fecho .r {{ font-size:10.5px; color:#444; letter-spacing:.5px; margin-top:2px; }}
  @page {{ margin: 14mm; }}
  @media print {{ body {{ background: #fff; }} .wrap {{ padding: 0; max-width: none; }} }}
</style></head><body><div class="wrap">
{timbrado}
<header><h1>{obj.title}</h1>
<p>Material informativo — Ortopedia e Traumatologia</p>
{linha_nome}</header>
<div class="content">{obj.content_html}</div>
<footer>Este material é educativo e não substitui a avaliação médica individual.</footer>
{fecho}
</div></body></html>""")


# Exporta todos os roteadores
def include_all(app):
    app.include_router(exam_router)
    app.include_router(physio_router)
    app.include_router(report_router)
    app.include_router(leaflet_router)
    app.include_router(public_leaflet_router)
