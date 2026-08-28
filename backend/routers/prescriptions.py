"""
Routers para gerenciar receitas médicas digitais com assinatura ClickSign
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import json
from models.prescription import Prescription, PrescriptionMedicine, PrescriptionStatus
from models.patient import Patient
from models.user import User
from models.clinic import Clinic
from database import get_db
from deps import get_current_user
from schemas.prescription import (
    PrescriptionCreate,
    PrescriptionResponse,
    PrescriptionDetailResponse,
    PrescriptionMedicineCreate,
    PrescriptionSignResponse,
    PrescriptionValidationResponse,
)
from services.pdf_generator import PrescriptionPDFGenerator, compute_pdf_checksum
from services.clicksign_service import ClickSignService, generate_qr_code_token
from tzutil import today_br

router = APIRouter(prefix="/api/prescriptions", tags=["prescriptions"])

# ============================================================================
# CREATE & DRAFT
# ============================================================================

@router.post("", response_model=PrescriptionResponse)
async def create_prescription(
    data: PrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria uma nova receita em rascunho"""

    # Validações
    patient = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    clinic = db.query(Clinic).filter(Clinic.id == current_user.clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clínica não encontrada")

    # Criar receita
    prescription = Prescription(
        patient_id=data.patient_id,
        doctor_id=current_user.id,
        clinic_id=current_user.clinic_id,
        consultation_id=data.consultation_id,
        notes=data.notes,
        instructions=data.instructions,
        status=PrescriptionStatus.DRAFT,
        qr_code_token=generate_qr_code_token(),
    )
    db.add(prescription)
    db.flush()

    # Adicionar medicamentos
    for med_data in data.medicines:
        medicine = PrescriptionMedicine(
            prescription_id=prescription.id,
            name=med_data.name,
            dose=med_data.dose,
            unit=med_data.unit,
            frequency=med_data.frequency,
            route=med_data.route,
            quantity=med_data.quantity,
            notes=med_data.notes,
        )
        db.add(medicine)

    db.commit()
    db.refresh(prescription)

    return prescription_to_response(prescription)


@router.get("/{prescription_id}", response_model=PrescriptionDetailResponse)
async def get_prescription(
    prescription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna detalhes de uma receita"""

    prescription = db.query(Prescription).filter(
        Prescription.id == prescription_id
    ).first()

    if not prescription:
        raise HTTPException(status_code=404, detail="Receita não encontrada")

    # Validar permissão (médico, clínica ou admin)
    if prescription.doctor_id != current_user.id and \
       prescription.clinic_id != current_user.clinic_id and \
       current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Sem permissão")

    return prescription_to_detail_response(prescription)


@router.get("", response_model=List[PrescriptionResponse])
async def list_prescriptions(
    patient_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista receitas do médico/clínica"""

    query = db.query(Prescription).filter(
        Prescription.clinic_id == current_user.clinic_id
    )

    if patient_id:
        query = query.filter(Prescription.patient_id == patient_id)

    if status:
        query = query.filter(Prescription.status == status)

    prescriptions = query.offset(skip).limit(limit).all()
    return [prescription_to_response(p) for p in prescriptions]


@router.put("/{prescription_id}", response_model=PrescriptionResponse)
async def update_prescription(
    prescription_id: int,
    data: PrescriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atualiza receita em rascunho"""

    prescription = db.query(Prescription).filter(
        Prescription.id == prescription_id
    ).first()

    if not prescription:
        raise HTTPException(status_code=404, detail="Receita não encontrada")

    # Só pode editar rascunhos
    if prescription.status != PrescriptionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Receita não está em rascunho")

    # Validar permissão
    if prescription.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")

    # Atualizar
    prescription.notes = data.notes
    prescription.instructions = data.instructions
    prescription.consultation_id = data.consultation_id

    # Limpar e adicionar medicamentos
    db.query(PrescriptionMedicine).filter(
        PrescriptionMedicine.prescription_id == prescription_id
    ).delete()

    for med_data in data.medicines:
        medicine = PrescriptionMedicine(
            prescription_id=prescription.id,
            name=med_data.name,
            dose=med_data.dose,
            unit=med_data.unit,
            frequency=med_data.frequency,
            route=med_data.route,
            quantity=med_data.quantity,
            notes=med_data.notes,
        )
        db.add(medicine)

    db.commit()
    db.refresh(prescription)

    return prescription_to_response(prescription)


# ============================================================================
# SIGNATURE FLOW
# ============================================================================

@router.post("/{prescription_id}/sign", response_model=PrescriptionSignResponse)
async def request_signature(
    prescription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Inicia fluxo de assinatura
    1. Gera PDF
    2. Cria documento no ClickSign
    3. Retorna URL para assinatura
    """

    prescription = db.query(Prescription).filter(
        Prescription.id == prescription_id
    ).first()

    if not prescription:
        raise HTTPException(status_code=404, detail="Receita não encontrada")

    if prescription.status != PrescriptionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Receita deve estar em rascunho")

    if prescription.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")

    try:
        # Obter dados
        patient = prescription.patient
        doctor = prescription.doctor
        clinic = prescription.clinic
        medicines = prescription.medicines

        # Preparar dados para PDF
        patient_data = {
            "name": patient.full_name,
            "cpf": patient.cpf or "N/A",
            "rg": patient.rg or "N/A",
            "birth_date": patient.birth_date.strftime("%d/%m/%Y") if patient.birth_date else "N/A",
            "age": calculate_age(patient.birth_date) if patient.birth_date else "N/A",
            "phone": patient.phone or "N/A",
            "email": patient.email or "N/A",
        }

        doctor_data = {
            "name": doctor.full_name,
            "crm": doctor.crm or "N/A",
            "rqe": doctor.rqe or "N/A",
            "specialty": doctor.specialty or "N/A",
            "phone": doctor.phone or "N/A",
            "email": doctor.email,
        }

        clinic_data = {
            "name": clinic.name,
            "address": clinic.address or "N/A",
            "phone": clinic.phone or "N/A",
            "cnpj": clinic.cnpj or "N/A",
            "logo_url": clinic.logo_url,
        }

        medicines_list = [
            {
                "name": m.name,
                "dose": m.dose,
                "unit": m.unit,
                "frequency": m.frequency,
                "route": m.route,
                "quantity": m.quantity,
                "notes": m.notes,
            }
            for m in medicines
        ]

        # Gerar QR code URL
        qr_code_url = f"/api/prescriptions/{prescription.id}/validate?token={prescription.qr_code_token}"

        # Gerar PDF
        pdf_generator = PrescriptionPDFGenerator(clinic_logo_path=clinic.logo_url)
        pdf_bytes = pdf_generator.generate(
            prescription_id=prescription.id,
            patient_data=patient_data,
            doctor_data=doctor_data,
            clinic_data=clinic_data,
            medicines=medicines_list,
            qr_code_url=qr_code_url,
            issued_at=datetime.utcnow(),
            notes=prescription.notes,
            instructions=prescription.instructions,
        )

        # Enviar para ClickSign
        clicksign = ClickSignService()
        result = clicksign.create_signature_request(
            db=db,
            prescription=prescription,
            pdf_bytes=pdf_bytes,
            doctor_email=doctor.email,
            doctor_name=doctor.full_name,
        )

        if not result["success"]:
            raise HTTPException(status_code=500, detail=f"Erro ao criar assinatura: {result.get('error')}")

        return {
            "success": True,
            "prescription_id": prescription.id,
            "sign_url": result["sign_url"],
            "message": "Clique no link acima para assinar a receita",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{prescription_id}/signature-status")
async def get_signature_status(
    prescription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna status da assinatura"""

    prescription = db.query(Prescription).filter(
        Prescription.id == prescription_id
    ).first()

    if not prescription:
        raise HTTPException(status_code=404, detail="Receita não encontrada")

    if not prescription.clicksign_doc_id:
        return {
            "status": "not_requested",
            "message": "Assinatura não foi solicitada",
        }

    try:
        clicksign = ClickSignService()
        status_data = clicksign.get_signature_status(prescription.clicksign_doc_id)

        return {
            "status": status_data["status"],
            "signed_at": status_data.get("signed_at"),
            "signer_name": status_data.get("signer_name"),
            "prescription_id": prescription.id,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WEBHOOK
# ============================================================================

@router.post("/webhook/clicksign")
async def clicksign_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Webhook para receber notificações do ClickSign
    Quando documento é assinado, baixa PDF assinado
    """

    try:
        event_data = await request.json()

        clicksign = ClickSignService()
        result = clicksign.handle_webhook(db, event_data)

        return result

    except Exception as e:
        return {"success": False, "message": str(e)}


# ============================================================================
# VALIDATION & PUBLIC
# ============================================================================

@router.get("/validate/{prescription_id}", response_model=PrescriptionValidationResponse)
async def validate_prescription(
    prescription_id: int,
    token: str,
    db: Session = Depends(get_db),
):
    """
    Validação pública de receita (QR code)
    Farmácia/Público pode validar receita sem autenticação
    """

    prescription = db.query(Prescription).filter(
        Prescription.id == prescription_id,
        Prescription.qr_code_token == token,
    ).first()

    if not prescription:
        raise HTTPException(status_code=404, detail="Receita inválida ou expirada")

    # Verificar se está assinada
    if prescription.status != PrescriptionStatus.SIGNED:
        raise HTTPException(status_code=400, detail="Receita não foi assinada")

    # Verificar validade (30 dias)
    expiration = prescription.signed_at + timedelta(days=30)
    if datetime.utcnow() > expiration:
        prescription.status = PrescriptionStatus.EXPIRED
        db.add(prescription)
        db.commit()
        raise HTTPException(status_code=410, detail="Receita expirou")

    # Retornar dados para validação
    return {
        "valid": True,
        "prescription_id": prescription.id,
        "patient_name": prescription.patient.full_name,
        "doctor_name": prescription.doctor.full_name,
        "doctor_crm": prescription.doctor.crm,
        "issued_at": prescription.issued_at,
        "signed_at": prescription.signed_at,
        "expires_at": expiration,
        "medicines": [
            {
                "name": m.name,
                "dose": f"{m.dose} {m.unit}",
                "frequency": m.frequency,
                "route": m.route,
                "quantity": m.quantity,
            }
            for m in prescription.medicines
        ],
        "signature_proof_url": prescription.clicksign_signed_url,
    }


@router.get("/{prescription_id}/pdf")
async def download_pdf(
    prescription_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download do PDF assinado"""

    prescription = db.query(Prescription).filter(
        Prescription.id == prescription_id
    ).first()

    if not prescription:
        raise HTTPException(status_code=404, detail="Receita não encontrada")

    if prescription.status != PrescriptionStatus.SIGNED:
        raise HTTPException(status_code=400, detail="Receita não foi assinada")

    if not prescription.pdf_file:
        raise HTTPException(status_code=500, detail="PDF não disponível")

    return {
        "filename": f"receita_{prescription.id}.pdf",
        "content": prescription.pdf_file,
        "content_type": "application/pdf",
    }


# ============================================================================
# HELPERS
# ============================================================================

def prescription_to_response(prescription: Prescription):
    return {
        "id": prescription.id,
        "status": prescription.status,
        "patient_id": prescription.patient_id,
        "doctor_id": prescription.doctor_id,
        "created_at": prescription.created_at,
        "issued_at": prescription.issued_at,
        "signed_at": prescription.signed_at,
        "medicine_count": len(prescription.medicines),
    }


def prescription_to_detail_response(prescription: Prescription):
    return {
        "id": prescription.id,
        "status": prescription.status,
        "patient": {
            "name": prescription.patient.full_name,
            "cpf": prescription.patient.cpf,
            "birth_date": prescription.patient.birth_date,
        },
        "doctor": {
            "name": prescription.doctor.full_name,
            "crm": prescription.doctor.crm,
            "rqe": prescription.doctor.rqe,
        },
        "clinic": {
            "name": prescription.clinic.name,
        },
        "medicines": [
            {
                "id": m.id,
                "name": m.name,
                "dose": m.dose,
                "unit": m.unit,
                "frequency": m.frequency,
                "route": m.route,
                "quantity": m.quantity,
                "notes": m.notes,
            }
            for m in prescription.medicines
        ],
        "notes": prescription.notes,
        "instructions": prescription.instructions,
        "created_at": prescription.created_at,
        "issued_at": prescription.issued_at,
        "signed_at": prescription.signed_at,
        "clicksign_sign_url": prescription.clicksign_sign_url,
    }


def calculate_age(birth_date) -> int:
    """Calcula idade a partir de data de nascimento"""
    today = today_br()
    age = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1
    return age
