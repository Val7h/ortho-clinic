from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from database import get_db
from models.patient import Patient
from models.documents import Prescription, ExamRequest, PhysioRequest, MedicalReport, TreatmentLeaflet
from schemas.documents import (
    PrescriptionCreate, PrescriptionOut,
    ExamRequestCreate, ExamRequestOut,
    PhysioRequestCreate, PhysioRequestOut,
    MedicalReportCreate, MedicalReportOut,
    TreatmentLeafletCreate, TreatmentLeafletOut,
)
from deps import require_doctor, get_current_user

router = APIRouter(tags=["documents"])


# ── RECEITAS ──────────────────────────────────────────────────────────────────

presc_router = APIRouter(prefix="/patients/{patient_id}/prescriptions", dependencies=[Depends(require_doctor)])

@presc_router.get("", response_model=List[PrescriptionOut])
def list_prescriptions(patient_id: int, db: Session = Depends(get_db)):
    return db.query(Prescription).filter(Prescription.patient_id == patient_id).order_by(Prescription.date.desc()).all()

@presc_router.post("", response_model=PrescriptionOut, status_code=201)
def create_prescription(patient_id: int, data: PrescriptionCreate, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    obj = Prescription(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@presc_router.get("/{doc_id}", response_model=PrescriptionOut)
def get_prescription(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(Prescription).filter(Prescription.id == doc_id, Prescription.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Receita não encontrada")
    return obj

@presc_router.delete("/{doc_id}", status_code=204)
def delete_prescription(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(Prescription).filter(Prescription.id == doc_id, Prescription.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Receita não encontrada")
    db.delete(obj)
    db.commit()


# ── SOLICITAÇÕES DE EXAME ─────────────────────────────────────────────────────

exam_router = APIRouter(prefix="/patients/{patient_id}/exams", dependencies=[Depends(require_doctor)])

@exam_router.get("", response_model=List[ExamRequestOut])
def list_exams(patient_id: int, db: Session = Depends(get_db)):
    return db.query(ExamRequest).filter(ExamRequest.patient_id == patient_id).order_by(ExamRequest.date.desc()).all()

@exam_router.post("", response_model=ExamRequestOut, status_code=201)
def create_exam(patient_id: int, data: ExamRequestCreate, db: Session = Depends(get_db)):
    # Aceita texto livre OU lista estruturada de exames (retrocompatibilidade)
    if not data.exams and not (data.free_text and data.free_text.strip()):
        raise HTTPException(422, "Informe o texto da solicitação ou ao menos um exame")
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    obj = ExamRequest(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@exam_router.get("/{doc_id}", response_model=ExamRequestOut)
def get_exam(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(ExamRequest).filter(ExamRequest.id == doc_id, ExamRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    return obj

@exam_router.delete("/{doc_id}", status_code=204)
def delete_exam(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(ExamRequest).filter(ExamRequest.id == doc_id, ExamRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    db.delete(obj)
    db.commit()


# ── FISIOTERAPIA ──────────────────────────────────────────────────────────────

physio_router = APIRouter(prefix="/patients/{patient_id}/physio", dependencies=[Depends(require_doctor)])

@physio_router.get("", response_model=List[PhysioRequestOut])
def list_physio(patient_id: int, db: Session = Depends(get_db)):
    return db.query(PhysioRequest).filter(PhysioRequest.patient_id == patient_id).order_by(PhysioRequest.date.desc()).all()

@physio_router.post("", response_model=PhysioRequestOut, status_code=201)
def create_physio(patient_id: int, data: PhysioRequestCreate, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    obj = PhysioRequest(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@physio_router.get("/{doc_id}", response_model=PhysioRequestOut)
def get_physio(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(PhysioRequest).filter(PhysioRequest.id == doc_id, PhysioRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    return obj

@physio_router.delete("/{doc_id}", status_code=204)
def delete_physio(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(PhysioRequest).filter(PhysioRequest.id == doc_id, PhysioRequest.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Solicitação não encontrada")
    db.delete(obj)
    db.commit()


# ── LAUDOS ────────────────────────────────────────────────────────────────────

report_router = APIRouter(prefix="/patients/{patient_id}/reports", dependencies=[Depends(require_doctor)])

@report_router.get("", response_model=List[MedicalReportOut])
def list_reports(patient_id: int, db: Session = Depends(get_db)):
    return db.query(MedicalReport).filter(MedicalReport.patient_id == patient_id).order_by(MedicalReport.date.desc()).all()

@report_router.post("", response_model=MedicalReportOut, status_code=201)
def create_report(patient_id: int, data: MedicalReportCreate, db: Session = Depends(get_db)):
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(404, "Paciente não encontrado")
    obj = MedicalReport(patient_id=patient_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@report_router.get("/{doc_id}", response_model=MedicalReportOut)
def get_report(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(MedicalReport).filter(MedicalReport.id == doc_id, MedicalReport.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Laudo não encontrado")
    return obj

@report_router.delete("/{doc_id}", status_code=204)
def delete_report(patient_id: int, doc_id: int, db: Session = Depends(get_db)):
    obj = db.query(MedicalReport).filter(MedicalReport.id == doc_id, MedicalReport.patient_id == patient_id).first()
    if not obj:
        raise HTTPException(404, "Laudo não encontrado")
    db.delete(obj)
    db.commit()


# ── FOLHETOS INFORMATIVOS ─────────────────────────────────────────────────────

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


# Exporta todos os roteadores
def include_all(app):
    app.include_router(presc_router)
    app.include_router(exam_router)
    app.include_router(physio_router)
    app.include_router(report_router)
    app.include_router(leaflet_router)
