"""
Schemas Pydantic para receitas médicas
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PrescriptionMedicineCreate(BaseModel):
    """Medicamento na receita"""
    name: str = Field(..., min_length=3, description="Nome genérico do medicamento")
    dose: float = Field(..., gt=0, description="Dosagem")
    unit: str = Field(..., description="Unidade (mg, ml, etc)")
    frequency: str = Field(..., description="Posologia (1x ao dia, etc)")
    route: str = Field(..., description="Via de administração")
    quantity: int = Field(..., gt=0, description="Quantidade total")
    notes: Optional[str] = None


class PrescriptionMedicineResponse(BaseModel):
    """Resposta de medicamento"""
    id: int
    name: str
    dose: float
    unit: str
    frequency: str
    route: str
    quantity: int
    notes: Optional[str]

    class Config:
        from_attributes = True


class PrescriptionCreate(BaseModel):
    """Criação de receita"""
    patient_id: int = Field(..., description="ID do paciente")
    consultation_id: Optional[int] = None
    medicines: List[PrescriptionMedicineCreate] = Field(
        ..., min_items=1, description="Lista de medicamentos"
    )
    notes: Optional[str] = None
    instructions: Optional[str] = None


class PrescriptionResponse(BaseModel):
    """Resposta básica de receita"""
    id: int
    status: str
    patient_id: int
    doctor_id: int
    created_at: datetime
    issued_at: Optional[datetime]
    signed_at: Optional[datetime]
    medicine_count: int

    class Config:
        from_attributes = True


class PrescriptionDetailResponse(BaseModel):
    """Resposta detalhada de receita"""
    id: int
    status: str
    patient: dict
    doctor: dict
    clinic: dict
    medicines: List[PrescriptionMedicineResponse]
    notes: Optional[str]
    instructions: Optional[str]
    created_at: datetime
    issued_at: Optional[datetime]
    signed_at: Optional[datetime]
    clicksign_sign_url: Optional[str]


class PrescriptionSignResponse(BaseModel):
    """Resposta ao solicitar assinatura"""
    success: bool
    prescription_id: int
    sign_url: str
    message: str


class PrescriptionValidationResponse(BaseModel):
    """Resposta de validação de receita (QR code)"""
    valid: bool
    prescription_id: int
    patient_name: str
    doctor_name: str
    doctor_crm: str
    issued_at: datetime
    signed_at: datetime
    expires_at: datetime
    medicines: List[dict]
    signature_proof_url: Optional[str]
