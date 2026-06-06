"""
Integração com ClickSign para assinatura digital de receitas
Documentação: https://app.clicksign.com/api
"""
import os
import requests
import json
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from models.prescription import Prescription, PrescriptionSignatureLog
import secrets


class ClickSignService:
    """Gerencia integração com ClickSign"""

    def __init__(self):
        self.api_key = os.getenv("CLICKSIGN_API_KEY")
        self.base_url = "https://app.clicksign.com/api/v1"
        if not self.api_key:
            raise ValueError("CLICKSIGN_API_KEY não configurada")

    def create_signature_request(
        self,
        db: Session,
        prescription: Prescription,
        pdf_bytes: bytes,
        doctor_email: str,
        doctor_name: str,
    ) -> Dict[str, Any]:
        """
        Cria um documento no ClickSign e retorna URL de assinatura

        Args:
            db: Sessão do banco de dados
            prescription: Objeto da receita
            pdf_bytes: Bytes do PDF
            doctor_email: Email do médico
            doctor_name: Nome do médico

        Returns:
            {
                "success": bool,
                "doc_id": str,
                "sign_url": str,
                "error": str (se houver)
            }
        """
        try:
            # 1. Upload do documento
            files = {
                'document[archive][original]': ('prescription.pdf', pdf_bytes, 'application/pdf'),
            }
            data = {
                'document[filename]': f'receita_{prescription.id}.pdf',
            }

            upload_response = requests.post(
                f"{self.base_url}/documents",
                files=files,
                data=data,
                headers={'Authorization': self.api_key}
            )
            upload_response.raise_for_status()
            doc_data = upload_response.json()

            if 'document' not in doc_data:
                raise Exception(f"Resposta inesperada: {doc_data}")

            doc_id = doc_data['document']['id']
            document_key = doc_data['document']['document_key']

            # 2. Criar lista de signatários
            signers = [
                {
                    "email": doctor_email,
                    "act": "sign",
                    "name": doctor_name,
                }
            ]

            # 3. Criar solicitação de assinatura
            signature_data = {
                'list[signers_attributes][][email]': [doctor_email],
                'list[signers_attributes][][act]': ['sign'],
                'list[signers_attributes][][name]': [doctor_name],
                'list[notify_on_sign]': True,
            }

            list_response = requests.post(
                f"{self.base_url}/lists",
                data=signature_data,
                headers={'Authorization': self.api_key}
            )
            list_response.raise_for_status()
            list_data = list_response.json()
            list_id = list_data['list']['id']

            # 4. Obter URL de assinatura
            sign_url = f"https://app.clicksign.com/dispatch/{document_key}/sign"

            # 5. Atualizar prescrição
            prescription.clicksign_doc_id = doc_id
            prescription.clicksign_sign_url = sign_url
            prescription.status = "aguardando_assinatura"
            prescription.issued_at = datetime.utcnow()  # Marca data de emissão
            db.add(prescription)

            # 6. Log
            log = PrescriptionSignatureLog(
                prescription_id=prescription.id,
                event="signature_requested",
                status="success",
                details=json.dumps({
                    "doc_id": doc_id,
                    "list_id": list_id,
                    "document_key": document_key,
                })
            )
            db.add(log)
            db.commit()

            return {
                "success": True,
                "doc_id": doc_id,
                "sign_url": sign_url,
            }

        except requests.exceptions.RequestException as e:
            # Log de erro
            if 'prescription' in locals():
                log = PrescriptionSignatureLog(
                    prescription_id=prescription.id,
                    event="signature_request_failed",
                    status="error",
                    details=json.dumps({"error": str(e)})
                )
                db.add(log)
                db.commit()

            return {
                "success": False,
                "doc_id": None,
                "sign_url": None,
                "error": str(e)
            }
        except Exception as e:
            return {
                "success": False,
                "doc_id": None,
                "sign_url": None,
                "error": str(e)
            }

    def get_signature_status(self, doc_id: str) -> Dict[str, Any]:
        """
        Obtém status de um documento no ClickSign

        Returns:
            {
                "status": "pending" | "signed" | "rejected",
                "signed_at": datetime (se assinado),
                "signature_url": str (se assinado),
                "signer_name": str (se assinado),
                "raw_data": dict
            }
        """
        try:
            response = requests.get(
                f"{self.base_url}/documents/{doc_id}",
                headers={'Authorization': self.api_key}
            )
            response.raise_for_status()
            doc_data = response.json()['document']

            status = "pending"
            signed_at = None
            signature_url = None
            signer_name = None

            # Verificar assinaturas
            if 'signatures' in doc_data:
                for sig in doc_data['signatures']:
                    if sig.get('signed_at'):
                        status = "signed"
                        signed_at = sig.get('signed_at')
                        signature_url = sig.get('certificate_url')
                        signer_name = sig.get('name')
                        break

            return {
                "status": status,
                "signed_at": signed_at,
                "signature_url": signature_url,
                "signer_name": signer_name,
                "raw_data": doc_data
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "raw_data": None
            }

    def get_signed_document(self, doc_id: str) -> Optional[bytes]:
        """
        Baixa documento assinado

        Returns:
            bytes do PDF assinado ou None se erro
        """
        try:
            response = requests.get(
                f"{self.base_url}/documents/{doc_id}/download",
                headers={'Authorization': self.api_key}
            )
            response.raise_for_status()
            return response.content
        except Exception as e:
            print(f"Erro ao baixar documento {doc_id}: {e}")
            return None

    def handle_webhook(
        self,
        db: Session,
        event_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Processa webhook do ClickSign quando documento é assinado

        Event structure:
        {
            "event": "document_signed",
            "document": {
                "id": "...",
                "document_key": "...",
                "original_filename": "...",
                "signatures": [...]
            }
        }

        Returns:
            {"success": bool, "message": str, "prescription_id": int}
        """
        try:
            event_type = event_data.get('event')
            doc_data = event_data.get('document', {})
            doc_id = doc_data.get('id')

            # Encontrar prescrição
            prescription = db.query(Prescription).filter(
                Prescription.clicksign_doc_id == doc_id
            ).first()

            if not prescription:
                return {
                    "success": False,
                    "message": f"Prescrição não encontrada para doc_id {doc_id}"
                }

            # Log do evento
            log = PrescriptionSignatureLog(
                prescription_id=prescription.id,
                event="webhook_received",
                status=event_type,
                details=json.dumps(event_data),
                clicksign_event_id=event_data.get('id')
            )
            db.add(log)

            # Se assinado, baixar PDF
            if event_type == "document_signed":
                signed_pdf = self.get_signed_document(doc_id)

                if signed_pdf:
                    from services.pdf_generator import compute_pdf_checksum

                    prescription.pdf_file = signed_pdf
                    prescription.pdf_checksum = compute_pdf_checksum(signed_pdf)
                    prescription.status = "assinado"
                    prescription.signed_at = datetime.utcnow()

                    # Extrair dados de assinatura
                    signatures = doc_data.get('signatures', [])
                    if signatures:
                        sig = signatures[0]
                        prescription.clicksign_signed_url = sig.get('certificate_url')

                    log.status = "signed"
                    log.details = json.dumps({
                        "signer": signatures[0].get('name') if signatures else None,
                        "signed_at": signatures[0].get('signed_at') if signatures else None,
                    })

                db.add(prescription)
                db.add(log)
                db.commit()

                return {
                    "success": True,
                    "message": f"Prescrição {prescription.id} assinada com sucesso",
                    "prescription_id": prescription.id
                }

            return {
                "success": False,
                "message": f"Evento não tratado: {event_type}"
            }

        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }


def generate_qr_code_token() -> str:
    """Gera token único para QR code"""
    return secrets.token_urlsafe(32)
