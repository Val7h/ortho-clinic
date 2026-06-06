"""
Examples of Queue Management API Usage
======================================

This file demonstrates how to use the queue management endpoints
for real-time waiting room management in OrthoClinic Phase 1.
"""

import requests
import json
from typing import Dict, Any

# Configuration
BASE_URL = "http://localhost:8000"
CLINIC_ID = 1
CLINIC_WEBSOCKET = f"ws://localhost:8000/api/clinic/ws/clinic/{CLINIC_ID}/queue"


# ==================== QUEUE MANAGEMENT EXAMPLES ====================

def example_call_patient():
    """Example: Call next patient to room."""
    payload = {
        "appointment_id": 123,
        "patient_id": 456,
        "room": "Sala 1",
        "clinic_id": CLINIC_ID
    }

    response = requests.post(
        f"{BASE_URL}/api/clinic/queue/call",
        json=payload
    )

    print("✓ Call Patient Response:")
    print(json.dumps(response.json(), indent=2))
    # Output:
    # {
    #   "id": 1,
    #   "clinic_id": 1,
    #   "appointment_id": 123,
    #   "patient_id": 456,
    #   "room": "Sala 1",
    #   "status": "called",
    #   "called_at": "2026-06-05T10:30:45.123Z",
    #   "called_by_user_id": null
    # }


def example_get_queue_status():
    """Example: Get current queue status."""
    response = requests.get(
        f"{BASE_URL}/api/clinic/queue/status",
        params={"clinic_id": CLINIC_ID}
    )

    print("✓ Queue Status Response:")
    status = response.json()
    print(json.dumps(status, indent=2, default=str))
    # Output:
    # {
    #   "clinic_id": 1,
    #   "current": {
    #     "id": 1,
    #     "appointment_id": 123,
    #     "patient_id": 456,
    #     "patient_name": "João Silva",
    #     "room": "Sala 1",
    #     "status": "called",
    #     "created_at": "2026-06-05T10:25:00Z",
    #     "called_at": "2026-06-05T10:30:45Z"
    #   },
    #   "next": [
    #     {
    #       "id": 2,
    #       "appointment_id": 124,
    #       "patient_id": 457,
    #       "patient_name": "Maria Santos",
    #       "room": null,
    #       "status": "pending",
    #       "created_at": "2026-06-05T10:35:00Z",
    #       "called_at": null
    #     }
    #   ],
    #   "waiting_count": 3,
    #   "last_called_at": "2026-06-05T10:30:45Z"
    # }


def example_get_queue_history():
    """Example: Get queue call history."""
    response = requests.get(
        f"{BASE_URL}/api/clinic/queue/history",
        params={
            "clinic_id": CLINIC_ID,
            "limit": 20,
            "hours": 8
        }
    )

    print("✓ Queue History Response:")
    history = response.json()
    print(json.dumps(history, indent=2, default=str))
    # Output: List of queue entries from last 8 hours


def example_update_queue_status():
    """Example: Update queue entry status."""
    queue_id = 1

    payload = {
        "status": "in_consultation",
        "room": "Sala 1"
    }

    response = requests.patch(
        f"{BASE_URL}/api/clinic/queue/{queue_id}",
        json=payload,
        params={"clinic_id": CLINIC_ID}
    )

    print("✓ Update Queue Status Response:")
    print(json.dumps(response.json(), indent=2, default=str))


# ==================== PRESCRIPTION VALIDATION EXAMPLES ====================

def example_validate_prescription():
    """Example: Validate medications for interactions."""
    payload = {
        "medicamentos": [
            {
                "drug_name": "Warfarin",
                "dosage": "5mg",
                "frequency": "1x ao dia"
            },
            {
                "drug_name": "Aspirin",
                "dosage": "100mg",
                "frequency": "1x ao dia"
            }
        ],
        "patient_id": 456
    }

    response = requests.post(
        f"{BASE_URL}/api/clinic/prescription/validate",
        json=payload
    )

    print("✓ Prescription Validation Response:")
    validation = response.json()
    print(json.dumps(validation, indent=2))
    # Output:
    # {
    #   "valid": false,
    #   "interactions": [
    #     {
    #       "severity": "high",
    #       "drug1": "Warfarin",
    #       "drug2": "Aspirin",
    #       "description": "Increased bleeding risk",
    #       "recommendation": "Monitor INR closely"
    #     }
    #   ],
    #   "warnings": [],
    #   "contraindications": []
    # }


def example_create_prescription_signature():
    """Example: Create digital signature for prescription."""
    payload = {
        "prescription_id": 789,
        "clicksign_doc_id": "doc_abc123xyz"
    }

    response = requests.post(
        f"{BASE_URL}/api/clinic/prescription/sign",
        json=payload
    )

    print("✓ Create Signature Response:")
    print(json.dumps(response.json(), indent=2, default=str))
    # Output:
    # {
    #   "id": 1,
    #   "prescription_id": 789,
    #   "clicksign_doc_id": "doc_abc123xyz",
    #   "status": "pending",
    #   "signed_at": null,
    #   "signature_proof": null,
    #   "created_at": "2026-06-05T10:40:00Z"
    # }


def example_get_prescription_signatures():
    """Example: Get all signatures for prescription."""
    prescription_id = 789

    response = requests.get(
        f"{BASE_URL}/api/clinic/prescription/{prescription_id}/signatures"
    )

    print("✓ Get Signatures Response:")
    print(json.dumps(response.json(), indent=2, default=str))


# ==================== ANAMNESIS TEMPLATES EXAMPLES ====================

def example_create_anamnesis_template():
    """Example: Create anamnesis template for clinic."""
    payload = {
        "name": "Anamnese Ortopédica - Ombro",
        "specialty": "ortopedia",
        "structure": {
            "sections": [
                {
                    "id": "chief_complaint",
                    "title": "Queixa Principal",
                    "fields": [
                        {
                            "id": "location",
                            "label": "Localização da dor",
                            "type": "select",
                            "required": True,
                            "options": ["Anterior", "Lateral", "Posterior", "Superior"]
                        },
                        {
                            "id": "duration",
                            "label": "Duração dos sintomas",
                            "type": "text",
                            "required": True
                        },
                        {
                            "id": "severity",
                            "label": "Intensidade da dor (0-10)",
                            "type": "text",
                            "required": True
                        }
                    ]
                },
                {
                    "id": "history",
                    "title": "História da Doença",
                    "fields": [
                        {
                            "id": "aggravating_factors",
                            "label": "Fatores que pioram",
                            "type": "textarea",
                            "required": False
                        },
                        {
                            "id": "relieving_factors",
                            "label": "Fatores que melhoram",
                            "type": "textarea",
                            "required": False
                        }
                    ]
                }
            ],
            "tabs": None
        }
    }

    response = requests.post(
        f"{BASE_URL}/api/clinic/anamnesis-template",
        json=payload,
        params={
            "clinic_id": CLINIC_ID,
            "created_by": 1
        }
    )

    print("✓ Create Template Response:")
    print(json.dumps(response.json(), indent=2, default=str))
    # Output:
    # {
    #   "id": 1,
    #   "clinic_id": 1,
    #   "name": "Anamnese Ortopédica - Ombro",
    #   "specialty": "ortopedia",
    #   "structure": {...},
    #   "created_by": 1,
    #   "created_at": "2026-06-05T10:45:00Z",
    #   "updated_at": "2026-06-05T10:45:00Z"
    # }


def example_list_anamnesis_templates():
    """Example: List anamnesis templates."""
    response = requests.get(
        f"{BASE_URL}/api/clinic/anamnesis-templates",
        params={
            "clinic_id": CLINIC_ID,
            "specialty": "ortopedia"
        }
    )

    print("✓ List Templates Response:")
    print(json.dumps(response.json(), indent=2, default=str))


def example_get_anamnesis_template():
    """Example: Get specific template."""
    template_id = 1

    response = requests.get(
        f"{BASE_URL}/api/clinic/anamnesis-template/{template_id}"
    )

    print("✓ Get Template Response:")
    print(json.dumps(response.json(), indent=2, default=str))


def example_update_anamnesis_template():
    """Example: Update anamnesis template."""
    template_id = 1

    payload = {
        "name": "Anamnese Ortopédica - Ombro (Revisado)",
        "specialty": "ortopedia",
        "structure": None  # Keep existing if not updated
    }

    response = requests.patch(
        f"{BASE_URL}/api/clinic/anamnesis-template/{template_id}",
        json=payload
    )

    print("✓ Update Template Response:")
    print(json.dumps(response.json(), indent=2, default=str))


# ==================== WEBSOCKET EXAMPLE ====================

async def example_websocket_connection():
    """
    Example: Connect to WebSocket for real-time queue updates.

    Run with:
        python -m asyncio
        >>> import examples.queue_api_examples as ex
        >>> await ex.example_websocket_connection()
    """
    import asyncio
    import websockets
    import json

    async with websockets.connect(CLINIC_WEBSOCKET) as websocket:
        print("✓ Connected to WebSocket")

        # Receive initial status
        initial = await websocket.recv()
        print(f"Initial Status: {json.dumps(json.loads(initial), indent=2, default=str)}")

        # Keep listening for updates
        try:
            while True:
                message = await websocket.recv()
                update = json.loads(message)
                print(f"\n📢 Broadcast: {update['type']}")
                print(json.dumps(update, indent=2, default=str))

                # Send ping to keep connection alive
                await asyncio.sleep(30)
                await websocket.send(json.dumps({"type": "ping"}))

        except KeyboardInterrupt:
            print("Disconnected")


# ==================== RUN ALL EXAMPLES ====================

if __name__ == "__main__":
    print("OrthoClinic Queue API Examples")
    print("=" * 50)

    print("\n1. QUEUE MANAGEMENT")
    print("-" * 50)
    example_call_patient()
    print()
    example_get_queue_status()
    print()
    example_get_queue_history()
    print()

    print("\n2. PRESCRIPTION VALIDATION")
    print("-" * 50)
    example_validate_prescription()
    print()
    example_create_prescription_signature()
    print()

    print("\n3. ANAMNESIS TEMPLATES")
    print("-" * 50)
    example_create_anamnesis_template()
    print()
    example_list_anamnesis_templates()
    print()

    print("\n✓ Examples completed!")
    print("\nFor WebSocket example, see example_websocket_connection()")
