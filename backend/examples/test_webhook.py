"""
Script para testar webhook do ClickSign localmente
Simula um evento de documento assinado
"""
import requests
import json
from datetime import datetime

# ============================================================================
# CONFIGURAÇÃO
# ============================================================================

WEBHOOK_URL = "http://localhost:8000/api/webhooks/clicksign"

# ============================================================================
# SIMULAR EVENTO DE ASSINATURA
# ============================================================================

def test_document_signed_webhook():
    """
    Simula webhook quando documento é assinado no ClickSign
    """

    # Estrutura de evento do ClickSign
    event_payload = {
        "event": "document_signed",
        "id": "evt_123456",  # ID do evento
        "timestamp": datetime.utcnow().isoformat(),
        "document": {
            "id": "doc_123456",  # ID do documento (deve existir no banco)
            "document_key": "ABC123XYZ",
            "original_filename": "receita_1.pdf",
            "status": "signed",
            "created_at": "2024-01-15T10:30:00Z",
            "updated_at": "2024-01-15T10:45:00Z",
            "signatures": [
                {
                    "id": "sig_123456",
                    "name": "Dr. João Silva",
                    "email": "doctor@test.com",
                    "act": "sign",
                    "signed_at": "2024-01-15T10:45:00Z",
                    "certificate_url": "https://app.clicksign.com/certs/sig_123456.pdf",
                    "certificate_id": "123456789",
                }
            ],
            "downsampled_url": "https://...",
            "original_url": "https://...",
            "urls": {
                "download": "https://...",
                "sign": "https://app.clicksign.com/dispatch/ABC123XYZ/sign",
            }
        }
    }

    print("=" * 70)
    print("TESTE: Webhook ClickSign - Documento Assinado")
    print("=" * 70)

    print("\n📤 Enviando evento para webhook...")
    print(f"URL: {WEBHOOK_URL}")
    print(f"\nPayload:")
    print(json.dumps(event_payload, indent=2, ensure_ascii=False))

    try:
        response = requests.post(
            WEBHOOK_URL,
            json=event_payload,
            headers={"Content-Type": "application/json"}
        )

        print(f"\n✓ Resposta recebida (Status: {response.status_code})")
        print(f"Conteúdo: {response.text}")

        if response.status_code == 200:
            result = response.json()
            print(f"\n✓ Webhook processado com sucesso!")
            print(f"  Prescription ID: {result.get('prescription_id')}")
            print(f"  Mensagem: {result.get('message')}")
        else:
            print(f"\n✗ Erro ao processar webhook")

    except requests.exceptions.ConnectionError:
        print("\n✗ Erro: Não conseguiu conectar ao servidor")
        print("  Certifique-se que o backend está rodando em http://localhost:8000")
    except Exception as e:
        print(f"\n✗ Erro: {e}")

    print("\n" + "=" * 70)


# ============================================================================
# SIMULAR WEBHOOK COM DOCUMENTO NÃO ENCONTRADO
# ============================================================================

def test_webhook_document_not_found():
    """
    Testa cenário onde documento não existe no banco
    """

    event_payload = {
        "event": "document_signed",
        "document": {
            "id": "doc_inexistente_12345",
            "signatures": [{"name": "Dr. Test"}]
        }
    }

    print("\n\n" + "=" * 70)
    print("TESTE: Webhook - Documento Não Encontrado")
    print("=" * 70)

    print("\n📤 Enviando evento com documento inexistente...")

    try:
        response = requests.post(
            WEBHOOK_URL,
            json=event_payload,
            headers={"Content-Type": "application/json"}
        )

        print(f"\n✓ Resposta: {response.status_code}")
        print(f"Detalhes: {response.text}")

    except Exception as e:
        print(f"\n✗ Erro: {e}")

    print("\n" + "=" * 70)


# ============================================================================
# SIMULAR MÚLTIPLOS EVENTOS
# ============================================================================

def test_multiple_events():
    """
    Testa sequência de eventos
    """

    events = [
        {
            "event": "document_created",
            "document": {"id": "doc_123", "status": "pending"}
        },
        {
            "event": "document_signed",
            "document": {
                "id": "doc_123",
                "status": "signed",
                "signatures": [
                    {
                        "name": "Dr. Silva",
                        "signed_at": datetime.utcnow().isoformat(),
                        "certificate_url": "https://..."
                    }
                ]
            }
        },
    ]

    print("\n\n" + "=" * 70)
    print("TESTE: Múltiplos Eventos")
    print("=" * 70)

    for i, event in enumerate(events, 1):
        print(f"\n[{i}] Enviando evento: {event['event']}")

        try:
            response = requests.post(
                WEBHOOK_URL,
                json=event,
                headers={"Content-Type": "application/json"}
            )

            print(f"    Status: {response.status_code}")
            print(f"    Resposta: {response.text[:100]}")

        except Exception as e:
            print(f"    Erro: {e}")

    print("\n" + "=" * 70)


# ============================================================================
# INSTRUÇÕES PARA TESTE REAL COM CLICKSIGN
# ============================================================================

def print_instructions():
    """
    Imprime instruções para testar com ClickSign real
    """

    instructions = """

╔═══════════════════════════════════════════════════════════════════════════╗
║               TESTE COM CLICKSIGN REAL                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝

1. CONFIGURAR WEBHOOK EM PRODUÇÃO/STAGING:

   a) Acesse: https://app.clicksign.com/settings/api

   b) Configure a URL do webhook:
      Desenvolvimento (com ngrok):
        ngrok http 8000
        Webhook: https://xxxx-xxx-xx.ngrok.io/api/webhooks/clicksign

      Produção:
        Webhook: https://seu-dominio.com/api/webhooks/clicksign

   c) Marque os eventos: "document_signed"

   d) Salve

2. TESTAR CRIANDO RECEITA REAL:

   python examples/prescription_example.py

   Isso vai:
   - Criar receita
   - Solicitar assinatura (envia PDF para ClickSign)
   - Retornar URL de assinatura

3. ASSINAR DOCUMENTALMENTE:

   - Abra o link retornado em seu navegador
   - Faça login no ClickSign
   - Assine com seu certificado digital
   - ClickSign envará webhook automaticamente para seu servidor

4. VERIFICAR SE WEBHOOK FOI PROCESSADO:

   - Receita deve estar marcada como "assinado"
   - PDF deve estar salvo no banco de dados
   - Log de assinatura deve estar preenchido

   Verificar no banco:
   SELECT * FROM prescriptions WHERE id = 1;
   SELECT * FROM prescription_signature_logs ORDER BY timestamp DESC;

╔═══════════════════════════════════════════════════════════════════════════╗
║               DEBUG LOCAL COM NGROK                                       ║
╚═══════════════════════════════════════════════════════════════════════════╝

# Terminal 1: Rodar ngrok
ngrok http 8000

# Terminal 2: Rodar backend
cd backend
python -m uvicorn main:app --reload

# Terminal 3: Executar teste
python examples/prescription_example.py

# Terminal 4: Monitorar requests ngrok
Veja em http://localhost:4040

╔═══════════════════════════════════════════════════════════════════════════╗
║               ESTRUTURA DO WEBHOOK DO CLICKSIGN                          ║
╚═══════════════════════════════════════════════════════════════════════════╝

Quando um documento é assinado, ClickSign envia POST para seu webhook:

POST /api/webhooks/clicksign

{
  "event": "document_signed",
  "id": "evt_abc123",
  "timestamp": "2024-01-15T10:45:00Z",
  "document": {
    "id": "doc_123456",          # <- Use para encontrar Prescription
    "document_key": "ABC123",
    "status": "signed",
    "signatures": [
      {
        "id": "sig_123",
        "name": "Dr. João Silva",
        "email": "doctor@test.com",
        "signed_at": "2024-01-15T10:45:00Z",
        "certificate_url": "https://..."
      }
    ]
  }
}

Seu backend deve:
1. Validar doc_id = Prescription.clicksign_doc_id
2. Se encontrado:
   - Baixar PDF assinado
   - Calcular checksum
   - Marcar como "signed"
   - Salvar PDF no banco
   - Criar log
3. Retornar 200 OK com {"success": true, ...}

╔═══════════════════════════════════════════════════════════════════════════╗
║               VERIFICAÇÃO PÓS-ASSINATURA                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝

1. Verificar status:
   curl -H "Authorization: Bearer TOKEN" \\
        http://localhost:8000/api/prescriptions/1/signature-status

2. Validar QR code:
   curl http://localhost:8000/api/prescriptions/validate/1?token=ABC123XYZ

3. Baixar PDF:
   curl -H "Authorization: Bearer TOKEN" \\
        http://localhost:8000/api/prescriptions/1/pdf > receita.pdf

    """
    print(instructions)


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import sys

    print("""
╔═══════════════════════════════════════════════════════════════════════════╗
║               TESTE DE WEBHOOK CLICKSIGN                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝

Uso:
  python test_webhook.py [opção]

Opções:
  1 - Teste webhook (documento assinado) [padrão]
  2 - Teste documento não encontrado
  3 - Teste múltiplos eventos
  4 - Ver instruções de teste real

Exemplo:
  python test_webhook.py 1

    """)

    if len(sys.argv) > 1:
        option = sys.argv[1]
    else:
        option = "1"

    if option == "1":
        test_document_signed_webhook()
    elif option == "2":
        test_webhook_document_not_found()
    elif option == "3":
        test_multiple_events()
    elif option == "4":
        print_instructions()
    else:
        print(f"Opção '{option}' inválida")
        test_document_signed_webhook()
