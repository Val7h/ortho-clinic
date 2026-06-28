from pydantic import BaseModel, Field
from typing import Optional
from datetime import date as _date, datetime


class ConsultationBase(BaseModel):
    date: datetime = Field(default_factory=datetime.now)
    type: Optional[str] = "retorno"
    chief_complaint: Optional[str] = None
    history_of_illness: Optional[str] = None
    pain_scale: Optional[int] = None
    pain_location: Optional[str] = None
    symptom_duration: Optional[str] = None
    aggravating_factors: Optional[str] = None
    relieving_factors: Optional[str] = None
    previous_treatments: Optional[str] = None
    physical_exam: Optional[str] = None
    vital_signs: Optional[str] = None
    range_of_motion: Optional[str] = None
    special_tests: Optional[str] = None
    imaging_findings: Optional[str] = None
    diagnosis: Optional[str] = None
    cid10: Optional[str] = None
    treatment_plan: Optional[str] = None
    evolution: Optional[str] = None
    procedure_performed: Optional[str] = None
    next_appointment: Optional[_date] = None
    next_appointment_notes: Optional[str] = None
    doctor_private_notes: Optional[str] = None
    teleconsult_url: Optional[str] = None


class ConsultationCreate(ConsultationBase):
    pass


class ConsultationUpdate(ConsultationBase):
    date: Optional[datetime] = None


class ConsultationOut(ConsultationBase):
    id: int
    patient_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
