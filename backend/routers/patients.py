from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
import os, uuid
from services.storage import upload_file
from database import get_db
from models.patient import Patient
from models.consultation import Consultation
from models.organization import User
from schemas.patient import PatientCreate, PatientUpdate, PatientOut, PatientSummary
from deps import get_current_user

router = APIRouter(prefix="/patients", tags=["patients"])

UPLOAD_DIR = "uploads/photos"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _org_filter(q, current_user: User):
    """Filtra por organização, exceto para superadmin."""
    if current_user.role != "superadmin":
        q = q.filter(Patient.organization_id == current_user.organization_id)
    return q


@router.get("", response_model=List[PatientSummary])
def list_patients(
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.active == True)
    q = _org_filter(q, current_user)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(Patient.name.ilike(term), Patient.cpf.ilike(term), Patient.phone.ilike(term)))
    patients = q.order_by(Patient.name).offset(skip).limit(limit).all()

    result = []
    for p in patients:
        count = db.query(func.count(Consultation.id)).filter(Consultation.patient_id == p.id).scalar()
        summary = PatientSummary.model_validate(p)
        summary.consultation_count = count
        result.append(summary)
    return result


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    data: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.cpf:
        existing = db.query(Patient).filter(
            Patient.cpf == data.cpf,
            Patient.organization_id == current_user.organization_id,
        ).first()
        if existing:
            raise HTTPException(400, "CPF já cadastrado")
    patient = Patient(**data.model_dump(), organization_id=current_user.organization_id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    return patient


@router.put("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    data: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(patient, key, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=204)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    patient.active = False
    db.commit()


@router.post("/{patient_id}/photo")
async def upload_photo(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")
    file_bytes = await file.read()
    ext = os.path.splitext(file.filename)[1]
    fname = str(uuid.uuid4()) + ext
    patient.photo_url = upload_file(file_bytes, fname, folder="patients")
    db.commit()
    return {"photo_url": patient.photo_url}


@router.get("/{patient_id}/timeline")
def get_timeline(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models.documents import Prescription, ExamRequest, PhysioRequest, MedicalReport

    q = db.query(Patient).filter(Patient.id == patient_id)
    q = _org_filter(q, current_user)
    patient = q.first()
    if not patient:
        raise HTTPException(404, "Paciente não encontrado")

    timeline = []

    for c in patient.consultations:
        timeline.append({
            "id": c.id,
            "type": "consulta",
            "subtype": c.type,
            "date": c.date.isoformat(),
            "title": f"{'1ª Consulta' if c.type == 'primeira_consulta' else 'Retorno'}",
            "summary": c.chief_complaint or c.diagnosis or "",
            "diagnosis": c.diagnosis,
        })

    for p in patient.prescriptions:
        meds = [m.get("name", "") for m in (p.medications or [])]
        timeline.append({
            "id": p.id,
            "type": "receita",
            "date": p.date.isoformat(),
            "title": "Receita Médica",
            "summary": ", ".join(meds[:3]),
        })

    for e in patient.exam_requests:
        exams = [ex.get("name", "") for ex in (e.exams or [])]
        timeline.append({
            "id": e.id,
            "type": "exame",
            "date": e.date.isoformat(),
            "title": "Solicitação de Exames",
            "summary": ", ".join(exams[:3]),
        })

    for f in patient.physio_requests:
        timeline.append({
            "id": f.id,
            "type": "fisio",
            "date": f.date.isoformat(),
            "title": f"Fisioterapia — {f.sessions} sessões",
            "summary": f.diagnosis or "",
        })

    for r in patient.medical_reports:
        timeline.append({
            "id": r.id,
            "type": "laudo",
            "date": r.date.isoformat(),
            "title": r.title or r.report_type,
            "summary": r.purpose or "",
        })

    timeline.sort(key=lambda x: x["date"], reverse=True)
    return timeline
