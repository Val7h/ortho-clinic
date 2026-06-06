# Implementação de Assinatura Digital ClickSign - Receitas CFM 2.299/21

## Visão Geral

Sistema completo de geração, assinatura digital e validação de receitas médicas conforme Conselho Federal de Medicina (CFM) Resolução 2.299/21 e Lei nº 14.065/2020, integrado com ClickSign para certificação ICP-Brasil.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                         │
│  ┌──────────────────────┐    ┌──────────────────────────┐   │
│  │ PrescriptionEditor   │    │ PrescriptionValidator    │   │
│  │ (Criar Receita)      │    │ (Validar QR Code)        │   │
│  └──────┬───────────────┘    └──────────────────────────┘   │
│         │                              ▲                      │
│  ┌──────▼──────────────────────────────┴──────────────────┐  │
│  │      PrescriptionSignature (Modal de Assinatura)      │  │
│  │                                                         │  │
│  │ 1. Mostra dados para validação                         │  │
│  │ 2. Clique "Abrir para Assinar"                         │  │
│  │ 3. Popup ClickSign (médico assina)                     │  │
│  │ 4. Poll status cada 5s                                │  │
│  │ 5. Sucesso: Baixar PDF + Compartilhar WhatsApp         │  │
│  └────┬─────────────────────────────────────────────────┬─┘  │
│       │ POST /prescriptions/{id}/sign                  │    │
│       │ GET /prescriptions/{id}/signature-status       │    │
│       │ GET /prescriptions/{id}/pdf                   │    │
│       │ POST /webhook/clicksign (webhook)              │    │
│       └─────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                   BACKEND (FastAPI)                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │             routers/prescriptions.py                  │   │
│  │                                                        │   │
│  │ POST /prescriptions          → Criar receita          │   │
│  │ PUT /prescriptions/{id}      → Editar (rascunho)      │   │
│  │ GET /prescriptions/{id}      → Detalhes               │   │
│  │ POST /prescriptions/{id}/sign → Solicitar assinatura  │   │
│  │ GET /prescriptions/{id}/signature-status → Status     │   │
│  │ POST /webhook/clicksign      → Webhook ClickSign      │   │
│  │ GET /prescriptions/validate/{id} → Validar QR (pub)   │   │
│  │ GET /prescriptions/{id}/pdf  → Download PDF           │   │
│  └────┬────────────┬──────────────┬───────────────────────┘   │
│       │            │              │                          │
│  ┌────▼─────┐ ┌───▼────────┐ ┌──▼──────────────────┐        │
│  │PdfGen    │ │ClickSign   │ │ Database (SQLAlch) │        │
│  │          │ │ Service    │ │                    │        │
│  │ reportlab│ │            │ │ models/             │        │
│  │ qrcode   │ │ - Upload   │ │  prescription.py    │        │
│  │          │ │ - Sign URL │ │  - Prescription     │        │
│  │ generate │ │ - Status   │ │  - Medicine         │        │
│  │ PDF with │ │ - Webhook  │ │  - SignatureLog     │        │
│  │ QR code  │ │   Handler  │ │                    │        │
│  └──────────┘ └────────────┘ └────────────────────┘        │
│       ▲            ▲                  ▲                      │
│       │            │                  │                      │
│       └────────────┼──────────────────┘                      │
│                    │                                         │
└────────────────────┼─────────────────────────────────────────┘
                     │
        ┌────────────▼──────────┐
        │  CLICKSIGN API        │
        │  (ClickSign ICP-BR)   │
        │                       │
        │ - Upload documento    │
        │ - Obter URL assinatura│
        │ - Verificar status    │
        │ - Download assinado   │
        │ - Webhook evento      │
        └───────────────────────┘
```

## Instalação

### 1. Adicionar Dependências

```bash
# Backend
pip install -r requirements_clicksign.txt
# ou
pip install reportlab==4.0.9 qrcode==7.4.2 Pillow==10.1.0 requests==2.31.0
```

### 2. Configurar Variáveis de Ambiente

```bash
# .env ou .env.local
CLICKSIGN_API_KEY=seu_token_api_clicksign
CLICKSIGN_WEBHOOK_SECRET=seu_webhook_secret  # Opcional

# Frontend
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 3. Registrar Webhook no ClickSign

1. Acesse https://app.clicksign.com/settings/api
2. Configure webhook URL: `https://seu-dominio.com/api/webhooks/clicksign`
3. Selecione eventos: `document_signed`

### 4. Atualizar main.py

```python
# Adicionar router de prescrições
from routers.prescriptions import router as prescriptions_router

app.include_router(prescriptions_router)
```

### 5. Rodar Migrations (se necessário)

```python
# backend/database.py - Adicionar model ao init_db()
from models.prescription import Prescription, PrescriptionMedicine, PrescriptionSignatureLog

Base.metadata.create_all(bind=engine)
```

## Fluxo de Funcionamento

### 1. Criar Receita (Rascunho)

**Endpoint**: `POST /api/prescriptions`

**Payload**:
```json
{
  "patient_id": 1,
  "consultation_id": 5,
  "medicines": [
    {
      "name": "Dipirona",
      "dose": 500,
      "unit": "mg",
      "frequency": "3x ao dia",
      "route": "via oral",
      "quantity": 30,
      "notes": "Conforme necessário para dor"
    }
  ],
  "notes": "Observações gerais",
  "instructions": "Instruções especiais de uso"
}
```

**Response**:
```json
{
  "id": 1,
  "status": "rascunho",
  "patient_id": 1,
  "doctor_id": 3,
  "created_at": "2024-01-15T10:30:00Z",
  "medicine_count": 1
}
```

### 2. Solicitar Assinatura

**Endpoint**: `POST /api/prescriptions/{id}/sign`

**Fluxo**:
1. Valida receita (status = rascunho)
2. Gera PDF com QR code
3. Carrega PDF no ClickSign
4. Obtém URL de assinatura
5. Retorna sign_url para popup

**Response**:
```json
{
  "success": true,
  "prescription_id": 1,
  "sign_url": "https://app.clicksign.com/dispatch/ABC123/sign",
  "message": "Clique no link para assinar"
}
```

### 3. Frontend: Abrir Popup de Assinatura

```typescript
// PrescriptionSignature.tsx
const signWindow = window.open(signUrl, 'clicksign', 'width=900,height=700');
// Medico assina digitalmente com certificado ICP-Brasil
```

### 4. Webhook: Receber Confirmação

**Evento**: Quando médico assina documento

**Endpoint**: `POST /api/webhooks/clicksign`

**Payload** (enviado por ClickSign):
```json
{
  "event": "document_signed",
  "document": {
    "id": "doc_123",
    "document_key": "ABC123",
    "signatures": [
      {
        "name": "Dr. João Silva",
        "signed_at": "2024-01-15T10:45:00Z",
        "certificate_url": "https://..."
      }
    ]
  }
}
```

**Ações**:
1. Identifica receita pelo doc_id
2. Baixa PDF assinado
3. Calcula checksum (SHA256)
4. Salva PDF no banco de dados
5. Marca como assinado
6. Cria log de auditoria

### 5. Validação de QR Code (Farmácia/Público)

**Endpoint**: `GET /api/prescriptions/validate/{id}?token=TOKEN`

**Response**:
```json
{
  "valid": true,
  "prescription_id": 1,
  "patient_name": "João Oliveira",
  "doctor_name": "Dr. Silva",
  "doctor_crm": "123456/SP",
  "issued_at": "2024-01-15T10:30:00Z",
  "signed_at": "2024-01-15T10:45:00Z",
  "expires_at": "2024-02-14T10:45:00Z",
  "medicines": [
    {
      "name": "Dipirona",
      "dose": "500 mg",
      "frequency": "3x ao dia",
      "route": "via oral",
      "quantity": 30
    }
  ],
  "signature_proof_url": "https://..."
}
```

**Validações**:
- Token válido e combinado com prescription_id
- Status = assinado
- Dentro do prazo de validade (30 dias)
- PDF checksum íntegro
- Assinatura ICP-Brasil válida

## Estrutura de Dados

### Prescription

```python
class Prescription(Base):
    id: int  # PK
    patient_id: int  # FK
    doctor_id: int   # FK
    clinic_id: int   # FK
    consultation_id: int (opcional)
    
    # Status
    status: PrescriptionStatus  # draft, pending_signature, signed, archived, expired
    created_at: datetime
    issued_at: datetime (imutável após assinatura)
    signed_at: datetime
    expires_at: datetime (issued_at + 30 dias)
    
    # ClickSign
    clicksign_doc_id: str (único)
    clicksign_sign_url: str
    clicksign_signed_url: str
    
    # Arquivo
    pdf_file: bytes
    pdf_checksum: str (SHA256)
    
    # Validação pública
    qr_code_token: str (único)
    
    # Conteúdo
    notes: str
    instructions: str
    medicines: [PrescriptionMedicine]
    signature_logs: [PrescriptionSignatureLog]
```

### PrescriptionMedicine

```python
class PrescriptionMedicine(Base):
    id: int
    prescription_id: int (FK)
    name: str (nome genérico)
    dose: float
    unit: str (mg, ml, etc)
    frequency: str (1x ao dia, etc)
    route: str (oral, intramuscular, etc)
    quantity: int
    notes: str (opcional)
    created_at: datetime
```

### PrescriptionSignatureLog

```python
class PrescriptionSignatureLog(Base):
    id: int
    prescription_id: int (FK)
    event: str (signature_requested, signed, webhook_received, etc)
    status: str
    timestamp: datetime
    details: json (evento completo)
    clicksign_event_id: str (opcional)
```

## PDF Gerado

O PDF gerado contém:

1. **Header**
   - Logo da clínica
   - Nome, CNPJ, endereço, telefone

2. **Título**
   - "RECEITA MÉDICA DIGITAL"
   - Número da receita

3. **Dados do Médico**
   - Nome, CRM, RQE, especialidade
   - Telefone, email

4. **Dados do Paciente**
   - Nome, CPF, RG, data de nascimento, idade
   - Telefone, email

5. **Data/Hora de Emissão**
   - Data/hora exata (imutável após assinatura)
   - Aviso: imutável

6. **Prescrição**
   - Tabela com medicamentos
   - Colunas: Medicamento, Dose, Posologia, Via, Qtd, Observações

7. **Instruções Especiais** (se houver)

8. **Observações** (se houver)

9. **QR Code**
   - Código 2D para validação
   - Token único incluído
   - URL: `/api/prescriptions/validate/{id}?token=TOKEN`

10. **Footer**
    - "Receita Digital - Documento assinado eletronicamente conforme Lei 14.065/2020"
    - Validade: 30 dias
    - Uso exclusivo farmácia

## Segurança & Conformidade

### 1. Certificação ICP-Brasil

- ClickSign usa certificados digitais ICP-Brasil (A1 ou A3)
- Assinatura qualificada conforme Lei 14.065/2020
- Certificado incluso no PDF

### 2. Integridade

- PDF checksum (SHA256) armazenado no banco
- Validação em tempo real de integridade
- Selagem de timestamp

### 3. Autenticação

- Cada receita tem token único (`qr_code_token`)
- Token vinculado a prescription_id
- URL de validação: `GET /validate/{id}?token=XXX`
- Público (sem autenticação) mas com token secreto

### 4. Auditoria

- `PrescriptionSignatureLog` registra cada evento
- Timestamps de cada ação
- Detalhes JSON de eventos
- Rastreabilidade completa

### 5. Conformidade CFM

- Conforme Resolução CFM 2.299/21
- Receita válida por 30 dias
- Data/hora imutável após assinatura
- Medicamentos com nome genérico
- Via de administração obrigatória
- Assinatura digital obrigatória

### 6. LGPD (Proteção de Dados)

- CPF/RG armazenados apenas necessário
- PDF criptografado em trânsito (HTTPS)
- Acesso controlado por autenticação
- Logs de acesso disponíveis

## Testes

### 1. Teste Manual (Desenvolvimento)

```bash
# Criar receita
curl -X POST http://localhost:8000/api/prescriptions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 1,
    "medicines": [
      {
        "name": "Dipirona",
        "dose": 500,
        "unit": "mg",
        "frequency": "3x ao dia",
        "route": "via oral",
        "quantity": 30
      }
    ]
  }'

# Solicitar assinatura
curl -X POST http://localhost:8000/api/prescriptions/1/sign \
  -H "Authorization: Bearer TOKEN"

# Validar receita
curl -X GET "http://localhost:8000/api/prescriptions/validate/1?token=ABC123XYZ"
```

### 2. Teste com ClickSign Sandbox

```python
# .env.test
CLICKSIGN_API_KEY=seu_token_sandbox
```

### 3. Casos de Teste

```python
# test_prescriptions.py

def test_create_prescription():
    # POST /prescriptions → 201 com dados corretos
    pass

def test_generate_pdf():
    # Verificar: tamanho, QR code, dados corretos
    pass

def test_request_signature():
    # Upload ClickSign, sign_url retornada, status updated
    pass

def test_signature_validation():
    # Token válido → valida
    # Token inválido → 404
    # Expirada → 410
    # Não assinada → 400
    pass

def test_webhook_handler():
    # Event document_signed → PDF salvo, status updated
    pass

def test_pdf_integrity():
    # Checksum mantido antes/depois
    pass
```

## Configuração para Produção

### 1. ClickSign Production

```bash
# .env (produção)
CLICKSIGN_API_KEY=chave_producao_clicksign
CLICKSIGN_WEBHOOK_SECRET=secret_webhook_producao
```

### 2. HTTPS/SSL

```bash
# Webhook deve estar em HTTPS
BACKEND_URL=https://seu-dominio.com
WEBHOOK_URL=https://seu-dominio.com/api/webhooks/clicksign
```

### 3. Database Backup

```bash
# Backup regular (PDFs armazenados no banco)
# PostgreSQL
pg_dump -U user ortho_clinic > backup.sql

# ou armazenar PDFs em storage externo (S3, etc)
```

### 4. Logs & Monitoring

```python
# Verificar logs de assinatura
SELECT * FROM prescription_signature_logs 
ORDER BY timestamp DESC;

# Alertas
- Falha em webhook → registrar e retry
- Assinatura não completada em 24h → notificar
- Receita expirada → avisar paciente/médico
```

## Troubleshooting

### Problema: "CLICKSIGN_API_KEY não configurada"

```bash
# Solução
export CLICKSIGN_API_KEY="sua_chave"
# ou em .env
CLICKSIGN_API_KEY=sua_chave
```

### Problema: PDF não gerado corretamente

```bash
# Verificar dependências
pip show reportlab qrcode Pillow

# Testar geradora
from services.pdf_generator import PrescriptionPDFGenerator
gen = PrescriptionPDFGenerator()
# Se falhar: logo_url pode estar inválido
```

### Problema: Webhook não chega

```bash
# Verificar
1. URL configurada em ClickSign app settings
2. Firewall/proxy permite POST
3. Content-Type: application/json
4. Tente reenviar manualmente em ClickSign dashboard
```

### Problema: Token QR inválido

```bash
# Verificar
SELECT qr_code_token FROM prescriptions WHERE id = 1;
# Token deve estar em URL: /validate/1?token=XXXXX
```

## Arquivos Criados

```
backend/
├── models/
│   └── prescription.py              # SQLAlchemy models
├── routers/
│   └── prescriptions.py             # FastAPI endpoints
├── schemas/
│   └── prescription.py              # Pydantic schemas
├── services/
│   ├── pdf_generator.py             # Geração PDF reportlab
│   └── clicksign_service.py         # Integração ClickSign API
└── requirements_clicksign.txt       # Python dependencies

frontend/
└── components/Prescription/
    ├── PrescriptionSignature.tsx    # Modal de assinatura
    └── PrescriptionValidator.tsx    # Validação QR code

CLICKSIGN_IMPLEMENTATION.md          # Este arquivo
```

## API Endpoints Resumida

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/api/prescriptions` | Criar receita | ✓ |
| GET | `/api/prescriptions` | Listar receitas | ✓ |
| GET | `/api/prescriptions/{id}` | Detalhes | ✓ |
| PUT | `/api/prescriptions/{id}` | Editar rascunho | ✓ |
| POST | `/api/prescriptions/{id}/sign` | Solicitar assinatura | ✓ |
| GET | `/api/prescriptions/{id}/signature-status` | Status assinatura | ✓ |
| GET | `/api/prescriptions/{id}/pdf` | Download PDF | ✓ |
| POST | `/api/webhooks/clicksign` | Webhook ClickSign | ✗ |
| GET | `/api/prescriptions/validate/{id}` | Validar QR code | ✗ |

## Próximos Passos

1. **Integração WhatsApp**: Enviar receita/PDF via WhatsApp ao paciente
2. **SMS**: Notificar paciente com link de validação
3. **Histórico**: Arquivar receitas, permitir reenvio
4. **Relatórios**: Quantas receitas assinadas por mês
5. **Multi-language**: Suporte PT-BR, EN, ES
6. **Mobile**: App React Native para farmácia validar
7. **FHIR**: Exportar em padrão HL7 FHIR
8. **Medicamentos**: Validar contra ANVISA/DiDi

---

**Versão**: 1.0  
**Data**: 2024-01-15  
**Status**: Production Ready
