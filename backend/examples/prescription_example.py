"""
Exemplo de uso da API de receitas médicas com ClickSign
"""
import requests
import json
from datetime import datetime

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "seu_token_jwt_aqui"

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
}


# ============================================================================
# 1. CRIAR RECEITA (RASCUNHO)
# ============================================================================

def create_prescription():
    """Cria uma nova receita em rascunho"""

    prescription_data = {
        "patient_id": 1,  # ID do paciente na clínica
        "consultation_id": 5,  # Opcional: vinculada a consulta
        "medicines": [
            {
                "name": "Dipirona",
                "dose": 500.0,
                "unit": "mg",
                "frequency": "3x ao dia",
                "route": "via oral",
                "quantity": 30,
                "notes": "Conforme necessário para febre ou dor",
            },
            {
                "name": "Ibuprofeno",
                "dose": 400.0,
                "unit": "mg",
                "frequency": "2x ao dia",
                "route": "via oral",
                "quantity": 20,
                "notes": "Não usar em conjunto com dipirona",
            },
        ],
        "notes": "Paciente apresentou dor nas costas",
        "instructions": "Tomar sempre com água e alimento. Não exceder dose recomendada.",
    }

    response = requests.post(
        f"{BASE_URL}/api/prescriptions",
        headers=headers,
        json=prescription_data,
    )

    response.raise_for_status()
    prescription = response.json()

    print("✓ Receita criada com sucesso!")
    print(f"  ID: {prescription['id']}")
    print(f"  Status: {prescription['status']}")
    print(f"  Medicamentos: {prescription['medicine_count']}")

    return prescription["id"]


# ============================================================================
# 2. OBTER DETALHES DA RECEITA
# ============================================================================

def get_prescription_details(prescription_id: int):
    """Obtém detalhes completos da receita"""

    response = requests.get(
        f"{BASE_URL}/api/prescriptions/{prescription_id}",
        headers=headers,
    )

    response.raise_for_status()
    prescription = response.json()

    print("\n✓ Detalhes da receita:")
    print(f"  Paciente: {prescription['patient']['name']}")
    print(f"  CPF: {prescription['patient']['cpf']}")
    print(f"  Médico: {prescription['doctor']['name']}")
    print(f"  CRM: {prescription['doctor']['crm']}")
    print(f"\n  Medicamentos:")
    for med in prescription['medicines']:
        print(f"    - {med['name']}: {med['dose']} {med['unit']}")
        print(f"      {med['frequency']} | {med['route']} | Qtd: {med['quantity']}")

    return prescription


# ============================================================================
# 3. SOLICITAR ASSINATURA
# ============================================================================

def request_signature(prescription_id: int):
    """Inicia fluxo de assinatura no ClickSign"""

    response = requests.post(
        f"{BASE_URL}/api/prescriptions/{prescription_id}/sign",
        headers=headers,
    )

    response.raise_for_status()
    result = response.json()

    if result["success"]:
        print(f"\n✓ Assinatura solicitada com sucesso!")
        print(f"  URL para assinatura: {result['sign_url']}")
        print(f"  Abra em seu navegador para assinar digitalmente")
        return result["sign_url"]
    else:
        print(f"\n✗ Erro ao solicitar assinatura: {result.get('error')}")
        return None


# ============================================================================
# 4. VERIFICAR STATUS DA ASSINATURA
# ============================================================================

def check_signature_status(prescription_id: int):
    """Verifica o status da assinatura"""

    response = requests.get(
        f"{BASE_URL}/api/prescriptions/{prescription_id}/signature-status",
        headers=headers,
    )

    response.raise_for_status()
    status = response.json()

    print(f"\n✓ Status da assinatura:")
    print(f"  Status: {status['status']}")

    if status["status"] == "signed":
        print(f"  Assinado por: {status['signer_name']}")
        print(f"  Data: {status['signed_at']}")
    elif status["status"] == "pending":
        print(f"  Aguardando assinatura...")
    else:
        print(f"  Detalhes: {status}")

    return status


# ============================================================================
# 5. DOWNLOAD PDF
# ============================================================================

def download_pdf(prescription_id: int):
    """Baixa o PDF da receita assinada"""

    response = requests.get(
        f"{BASE_URL}/api/prescriptions/{prescription_id}/pdf",
        headers=headers,
    )

    response.raise_for_status()

    filename = f"receita_{prescription_id}.pdf"
    with open(filename, "wb") as f:
        f.write(response.content)

    print(f"\n✓ PDF baixado: {filename}")


# ============================================================================
# 6. VALIDAR RECEITA (QR CODE) - SEM AUTENTICAÇÃO
# ============================================================================

def validate_prescription(prescription_id: int, token: str):
    """
    Valida receita para farmácia/público
    Não requer autenticação
    """

    response = requests.get(
        f"{BASE_URL}/api/prescriptions/validate/{prescription_id}",
        params={"token": token},
    )

    if response.status_code == 404:
        print(f"\n✗ Receita inválida ou expirada")
        return

    response.raise_for_status()
    validation = response.json()

    print(f"\n✓ Receita Válida!")
    print(f"  Paciente: {validation['patient_name']}")
    print(f"  Médico: {validation['doctor_name']} (CRM: {validation['doctor_crm']})")
    print(f"  Emitida: {validation['issued_at']}")
    print(f"  Assinada: {validation['signed_at']}")
    print(f"  Válida até: {validation['expires_at']}")
    print(f"\n  Medicamentos:")
    for med in validation["medicines"]:
        print(f"    - {med['name']}: {med['dose']}")
        print(f"      {med['frequency']} | {med['route']} | Qtd: {med['quantity']}")

    return validation


# ============================================================================
# 7. COMPARTILHAR VIA WHATSAPP
# ============================================================================

def share_via_whatsapp(prescription_id: int, patient_phone: str):
    """
    Compartilha receita via WhatsApp
    Usa API WhatsApp Business (Evolution/Baileys)
    """

    message = f"""
Olá!

Sua receita médica nº {prescription_id} está pronta e assinada digitalmente.

Para validar e usar na farmácia, acesse:
https://clinica.com/validar/{prescription_id}

Qualquer dúvida, entre em contato conosco.

Atenciosamente,
Clínica OrthoClinic
    """.strip()

    # Isso seria integrado com seu sistema WhatsApp existente
    print(f"\n✓ Mensagem WhatsApp pronta para enviar:")
    print(f"  Número: {patient_phone}")
    print(f"  Mensagem:\n{message}")

    # Exemplo com Evolution/Baileys:
    # response = requests.post(
    #     "http://localhost:3001/message/sendText",
    #     json={
    #         "number": patient_phone,
    #         "text": message,
    #     }
    # )


# ============================================================================
# EXEMPLO DE USO COMPLETO
# ============================================================================

def main():
    """Fluxo completo de criação e assinatura de receita"""

    print("=" * 60)
    print("EXEMPLO: Fluxo Completo de Receita Médica Digital")
    print("=" * 60)

    # 1. Criar receita
    print("\n[1] Criando receita...")
    prescription_id = create_prescription()

    # 2. Obter detalhes
    print("\n[2] Carregando detalhes...")
    prescription = get_prescription_details(prescription_id)

    # 3. Solicitar assinatura
    print("\n[3] Solicitando assinatura no ClickSign...")
    sign_url = request_signature(prescription_id)

    # 4. Simular espera por assinatura
    print("\n[4] Aguardando assinatura do médico...")
    print("    (No exemplo real, o médico clicaria no link do ClickSign)")
    print("    (Simulando webhook de assinatura completada...)")

    # Nota: Em produção, o webhook seria acionado automaticamente
    # Por enquanto, vamos pular para o passo 5

    # 5. Verificar status
    print("\n[5] Verificando status da assinatura...")
    # import time
    # time.sleep(5)  # Esperar webhook processar
    status = check_signature_status(prescription_id)

    # 6. Se assinada, baixar PDF
    if status.get("status") == "signed":
        print("\n[6] Baixando PDF assinado...")
        download_pdf(prescription_id)

        # 7. Compartilhar com paciente
        print("\n[7] Compartilhando com paciente...")
        share_via_whatsapp(prescription_id, "+5511999999999")

    # 8. Exemplo de validação (como seria vista na farmácia)
    print("\n[8] Simulando validação em farmácia...")
    qr_token = prescription.get("qr_code_token", "abc123xyz")
    validate_prescription(prescription_id, qr_token)

    print("\n" + "=" * 60)
    print("✓ Fluxo concluído com sucesso!")
    print("=" * 60)


if __name__ == "__main__":
    main()
