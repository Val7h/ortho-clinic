"""
TRAVA CENTRAL DE ISOLAMENTO MULTI-TENANT (Fase 1c).

Filtra automaticamente todo SELECT ORM pelos modelos-tenant (os que têm
organization_id), usando a conta amarrada à sessão em deps.get_current_user
(session.info["tenant_org_id"] / ["tenant_bypass"]).

Fail-safe (nunca esconder dado por engano):
 - superadmin → bypass total (vê todas as contas);
 - sessão sem org (migrações, seed, endpoints server-to-server como o
   formulário pré-consulta) → sem filtro, comportamento antigo;
 - linhas legadas com organization_id NULL são tratadas como da conta 1
   (a conta original) — visíveis só para a org 1;
 - kill-switch: TENANT_ISOLATION_ENFORCE=0 desliga o filtro na hora, sem deploy.
"""
import os

from sqlalchemy import event, or_
from sqlalchemy.orm import Session, with_loader_criteria

from models.patient import Patient
from models.clinic import Clinic, ClinicSchedule, Appointment
from models.consultation import Consultation
from models.financial import FinancialRecord
from models.anamnesis import Anamnesis
from models.documents import Prescription, ExamRequest, PhysioRequest, MedicalReport, Document
from models.media import ConsultationMedia
from models.whatsapp import WhatsAppMessage
from models.queue import ClinicQueue, PrescriptionSignature
from models.clinical_evolution import ClinicalEvolution
from models.patient_rx import PatientRx
from models.patient_documents import PatientDocument
from models.messages import DirectMessage

# ⚠️ MINA CONHECIDA: a tabela "prescriptions" tem uma SEGUNDA classe mapeada
# (models/prescription.py, usada só por routers/prescriptions.py que NÃO é montado
# no main.py — código morto em runtime). Importar as duas juntas quebra o boot
# ("Table 'prescriptions' is already defined"). Se um dia esse router for montado,
# a classe dele TAMBÉM precisa entrar nesta lista, senão fura o filtro por aquela via.

TENANT_MODELS = [
    Patient, Clinic, ClinicSchedule, Appointment,
    Consultation, FinancialRecord, Anamnesis,
    Prescription, ExamRequest, PhysioRequest, MedicalReport, Document,
    ConsultationMedia, WhatsAppMessage, ClinicQueue, PrescriptionSignature,
    ClinicalEvolution, PatientRx, PatientDocument, DirectMessage,
]

_registered = False


def _enforce_enabled() -> bool:
    return os.getenv("TENANT_ISOLATION_ENFORCE", "1").lower() not in ("0", "false", "off")


def register_tenant_guard() -> None:
    """Registra o filtro global de tenant (idempotente)."""
    global _registered
    if _registered:
        return
    _registered = True

    @event.listens_for(Session, "do_orm_execute")
    def _tenant_filter(execute_state):
        if not execute_state.is_select:
            return
        # Loads de coluna/relacionamento derivam de um objeto já autorizado.
        if execute_state.is_column_load or execute_state.is_relationship_load:
            return
        if not _enforce_enabled():
            return
        info = execute_state.session.info
        org = info.get("tenant_org_id")
        if org is None or info.get("tenant_bypass"):
            return

        for model in TENANT_MODELS:
            if org == 1:
                # conta original também enxerga linhas legadas sem org (NULL)
                crit = lambda cls, _o=org: or_(cls.organization_id == _o, cls.organization_id.is_(None))
            else:
                crit = lambda cls, _o=org: cls.organization_id == _o
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(model, crit, include_aliases=True)
            )
