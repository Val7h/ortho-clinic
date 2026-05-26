from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date, datetime


class MedicationItem(BaseModel):
    name: str
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None


class PrescriptionBase(BaseModel):
    date: date
    medications: List[MedicationItem] = []
    instructions: Optional[str] = None
    validity_days: Optional[int] = 30
    consultation_id: Optional[int] = None


class PrescriptionCreate(PrescriptionBase):
    pass


class PrescriptionOut(PrescriptionBase):
    id: int
    patient_id: int
    memed_id: Optional[str] = None
    signed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ExamItem(BaseModel):
    name: str
    laterality: Optional[str] = None
    notes: Optional[str] = None


class ExamRequestBase(BaseModel):
    date: date
    exams: List[ExamItem] = []
    clinical_indication: Optional[str] = None
    urgency: Optional[str] = "eletivo"
    notes: Optional[str] = None
    consultation_id: Optional[int] = None


class ExamRequestCreate(ExamRequestBase):
    pass


class ExamRequestOut(ExamRequestBase):
    id: int
    patient_id: int
    signed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PhysioRequestBase(BaseModel):
    date: date
    diagnosis: Optional[str] = None
    cid10: Optional[str] = None
    sessions: Optional[int] = 10
    frequency: Optional[str] = None
    goals: Optional[str] = None
    precautions: Optional[str] = None
    techniques: Optional[str] = None
    notes: Optional[str] = None
    consultation_id: Optional[int] = None


class PhysioRequestCreate(PhysioRequestBase):
    pass


class PhysioRequestOut(PhysioRequestBase):
    id: int
    patient_id: int
    signed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MedicalReportBase(BaseModel):
    date: date
    report_type: str
    title: Optional[str] = None
    content: str
    purpose: Optional[str] = None
    consultation_id: Optional[int] = None


class MedicalReportCreate(MedicalReportBase):
    pass


class MedicalReportOut(MedicalReportBase):
    id: int
    patient_id: int
    signed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TreatmentLeafletBase(BaseModel):
    title: str
    category: str
    content_html: str
    tags: List[str] = []


class TreatmentLeafletCreate(TreatmentLeafletBase):
    pass


class TreatmentLeafletOut(TreatmentLeafletBase):
    id: int
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
