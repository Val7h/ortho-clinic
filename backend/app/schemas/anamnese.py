"""
Schemas Pydantic para validação de dados de Anamnese
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============ ENUMS ============

class TemplateType(str, Enum):
    FIRST_CONSULTATION = "first_consultation"
    FOLLOW_UP = "follow_up"


class AnamneseStatus(str, Enum):
    DRAFT = "draft"
    COMPLETED = "completed"
    SIGNED = "signed"


class AlcoholConsumption(str, Enum):
    NONE = "none"
    OCCASIONAL = "occasional"
    REGULAR = "regular"


class SleepQuality(str, Enum):
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class TreatmentAdherence(str, Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


# ============ MEDICAÇÃO ============

class MedicacaoBase(BaseModel):
    id: str
    nome: str
    dosagem: str
    via: str
    fabricante: str
    posologia: Optional[str] = None
    duracao: Optional[str] = None


class MedicacaoResponse(MedicacaoBase):
    interacoes: Optional[List[Dict[str, Any]]] = []
    temContraindicacao: Optional[bool] = False

    class Config:
        json_schema_extra = {
            "example": {
                "id": "med_001",
                "nome": "Dipirona",
                "dosagem": "500mg",
                "via": "oral",
                "fabricante": "Genérico",
                "posologia": "1 comprimido a cada 8h",
                "duracao": "7 dias",
                "interacoes": [],
                "temContraindicacao": False,
            }
        }


# ============ PRIMEIRA CONSULTA ============

class AnamneseFirstConsultationDataBase(BaseModel):
    # TAB 1: Queixa Principal
    chief_complaint: str = Field(..., min_length=1, description="Motivo da consulta")
    pain_location: str = Field(
        default="", description="Localização da dor (Ombro, Cotovelo, etc)"
    )
    symptom_duration: str = Field(default="", description="Há quanto tempo (ex: 2 semanas)")
    pain_intensity: int = Field(default=5, ge=0, le=10, description="Intensidade de 0-10")
    aggravating_factors: str = Field(default="", description="O que piora")
    relieving_factors: str = Field(default="", description="O que melhora")

    # TAB 2: Histórico
    previous_traumas: str = Field(default="", description="Traumas anteriores")
    previous_surgeries: str = Field(default="", description="Cirurgias anteriores")
    previous_physiotherapy: str = Field(
        default="", description="Fisioterapia anterior"
    )
    previous_treatments: str = Field(default="", description="Outros tratamentos")
    current_medications: List[MedicacaoResponse] = Field(
        default=[], description="Medicações atuais"
    )

    # TAB 3: Hábitos e Risco
    profession: str = Field(default="", description="Profissão")
    physical_activities: str = Field(default="", description="Atividades físicas")
    sedentarism: int = Field(default=5, ge=1, le=10, description="Nível de sedentarismo")
    smoking: bool = Field(default=False, description="É fumante?")
    alcohol_consumption: AlcoholConsumption = Field(
        default="none", description="Consumo de álcool"
    )
    sleep_quality: SleepQuality = Field(default="good", description="Qualidade do sono")

    # TAB 4: Exame Físico
    range_of_motion: str = Field(default="", description="Amplitude de movimento")
    specific_tests: str = Field(default="", description="Testes específicos realizados")
    inflammation: bool = Field(default=False, description="Presença de inflamação")
    deformities: str = Field(default="", description="Deformidades/assimetrias")

    class Config:
        json_schema_extra = {
            "example": {
                "chief_complaint": "Dor no ombro direito ao movimentar",
                "pain_location": "Ombro",
                "symptom_duration": "2 semanas",
                "pain_intensity": 7,
                "aggravating_factors": "Levantamento de peso, abdução",
                "relieving_factors": "Repouso, gelo",
                "previous_traumas": "",
                "previous_surgeries": "",
                "previous_physiotherapy": "",
                "previous_treatments": "",
                "current_medications": [],
                "profession": "Vendedor",
                "physical_activities": "Musculação",
                "sedentarism": 3,
                "smoking": False,
                "alcohol_consumption": "occasional",
                "sleep_quality": "good",
                "range_of_motion": "Limitada em abdução",
                "specific_tests": "Teste de Neer positivo",
                "inflammation": True,
                "deformities": "Sem deformidades",
            }
        }


class AnamneseFirstConsultationCreate(AnamneseFirstConsultationDataBase):
    pass


# ============ RETORNO ============

class AnamneseFollowUpDataBase(BaseModel):
    last_consultation_date: Optional[str] = None
    pain_intensity_last: int = Field(ge=0, le=10, description="Dor na última consulta")
    pain_intensity_current: int = Field(ge=0, le=10, description="Dor atual")
    evolution_summary: str = Field(..., min_length=1, description="Evolução do paciente")
    new_symptoms: str = Field(default="", description="Novos sintomas")
    treatment_adherence: TreatmentAdherence = Field(
        default="good", description="Adesão ao tratamento"
    )
    treatment_response: str = Field(default="", description="Resposta ao tratamento")
    current_limitations: str = Field(default="", description="Limitações atuais")
    next_steps: str = Field(default="", description="Próximos passos")
    additional_observations: str = Field(
        default="", description="Observações adicionais"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "last_consultation_date": "2025-01-15",
                "pain_intensity_last": 8,
                "pain_intensity_current": 4,
                "evolution_summary": "Paciente evoluiu bem com o tratamento. Dor reduzida significativamente.",
                "new_symptoms": "Nenhum",
                "treatment_adherence": "good",
                "treatment_response": "Respondeu bem ao repouso e gelo",
                "current_limitations": "Ainda com dificuldade em levantar peso",
                "next_steps": "Continuar fisioterapia 2x por semana",
                "additional_observations": "Paciente aderente e motivado",
            }
        }


class AnamneseFollowUpCreate(AnamneseFollowUpDataBase):
    pass


# ============ CREATE/UPDATE ============

class AnamneseCreate(BaseModel):
    patient_id: int = Field(..., description="ID do paciente")
    template_type: TemplateType = Field(..., description="Tipo de anamnese")
    status: AnamneseStatus = Field(default="draft", description="Status da anamnese")
    dados: Dict[str, Any] = Field(..., description="Dados estruturados da anamnese")

    @validator("dados")
    def validate_dados(cls, v, values):
        """Validar estrutura de dados de acordo com template_type"""
        if "template_type" in values:
            template_type = values["template_type"]
            required_fields = (
                [
                    "chief_complaint",
                    "pain_intensity",
                    "sleep_quality",
                    "alcohol_consumption",
                ]
                if template_type == "first_consultation"
                else ["evolution_summary", "pain_intensity_current", "pain_intensity_last"]
            )

            missing = [f for f in required_fields if f not in v]
            if missing:
                raise ValueError(f"Campos obrigatórios ausentes: {missing}")

        return v


class AnamneseUpdate(BaseModel):
    status: Optional[AnamneseStatus] = None
    dados: Optional[Dict[str, Any]] = None


# ============ RESPONSES ============

class AnamneseListResponse(BaseModel):
    id: int
    patient_id: int
    template_type: TemplateType
    status: AnamneseStatus
    created_at: datetime

    class Config:
        from_attributes = True


class AnamneseResponse(BaseModel):
    id: int
    patient_id: int
    template_type: TemplateType
    status: AnamneseStatus
    dados: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "patient_id": 123,
                "template_type": "first_consultation",
                "status": "completed",
                "dados": {
                    "chief_complaint": "Dor no ombro",
                    "pain_intensity": 7,
                },
                "created_at": "2025-01-20T10:30:00",
                "updated_at": "2025-01-20T10:30:00",
                "created_by": 456,
            }
        }


# ============ STATS ============

class AnamneseStats(BaseModel):
    total: int
    first_consultations: int
    follow_ups: int
    completed: int
    drafts: int
    signed: int
    last_anamnese_date: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "total": 5,
                "first_consultations": 1,
                "follow_ups": 4,
                "completed": 4,
                "drafts": 1,
                "signed": 0,
                "last_anamnese_date": "2025-01-20T10:30:00",
            }
        }
