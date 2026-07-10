from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime


class PatientBase(BaseModel):
    name: str
    birthdate: Optional[date] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    civil_status: Optional[str] = None
    occupation: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    surgeries_history: Optional[str] = None
    family_history: Optional[str] = None
    insurance: Optional[str] = None
    insurance_number: Optional[str] = None
    insurance_plan: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    emergency_relation: Optional[str] = None
    referral_source: Optional[str] = None
    referring_doctor: Optional[str] = None
    notes: Optional[str] = None


class PatientCreate(PatientBase):
    pass


class PatientUpdate(PatientBase):
    name: Optional[str] = None


class PatientOut(PatientBase):
    id: int
    active: bool
    photo_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    # A19-back: aviso SOFT de possível homônimo no cadastro (não bloqueia).
    # Preenchido só no POST de criação; None nos demais retornos.
    warning: Optional[str] = None

    model_config = {"from_attributes": True}


class PatientSummary(BaseModel):
    id: int
    name: str
    # A17-back: cpf/phone/birthdate no resumo p/ o front buscar por CPF/telefone.
    # Contrato com o front: estes 3 campos sempre presentes na listagem.
    cpf: Optional[str] = None
    phone: Optional[str] = None
    birthdate: Optional[date] = None
    insurance: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime
    consultation_count: Optional[int] = 0

    model_config = {"from_attributes": True}
