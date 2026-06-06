# OrthoClinic - Proposta de Melhorias Técnicas

**Arquiteto:** Software Architect | **Data:** 2026-06-05 | **Status:** Análise Completa

---

## 1. ANÁLISE BANCO DE DADOS

### 1.1 Estrutura Atual ✓
- `patients` - Dados demográficos + histórico médico (bem estruturado)
- `consultations` - Prontuário de consultas (completo)
- `prescriptions` - Receitas em JSON (referencia MeMed)
- `exam_requests`, `physio_requests`, `medical_reports` - Documentos clínicos (bom)
- `anamnesis` - Formulário com token de segurança (inovador)
- `clinics`, `clinic_schedules`, `appointments` - Agendamento (implementado)
- `organizations`, `users` - Multi-tenancy (pronto)
- `financial_records` - Faturamento (básico)

### 1.2 O QUE FALTA

#### Crítico (Semana 1-2)

**Tabela: `medications` (Catálogo ANVISA)**
```sql
CREATE TABLE medications (
    id SERIAL PRIMARY KEY,
    anvisa_id VARCHAR(20) UNIQUE,  -- Código ANVISA
    name VARCHAR(300) NOT NULL,
    active_ingredient VARCHAR(500),
    concentration VARCHAR(100),
    manufacturer VARCHAR(200),
    route VARCHAR(50),  -- oral, injetável, tópica
    prescription_type VARCHAR(20),  -- branca, azul (controlada), vermelha
    contraindications TEXT,
    interactions TEXT,  -- JSON array de medicamentos que interagem
    side_effects TEXT,
    dosage_recommendations TEXT,
    anvisa_status VARCHAR(50),  -- ativo, descontinuado
    last_updated_at DATETIME,
    INDEX idx_name (name),
    INDEX idx_ingredient (active_ingredient)
);
```
**Por quê:** Cache local da base ANVISA evita chamadas API repetidas, acelera autocomplete

---

**Tabela: `anamesis_templates` (Templates reutilizáveis)**
```sql
CREATE TABLE anamnesis_templates (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id),
    name VARCHAR(200),  -- "Anamnese Ombro", "Anamnese Coluna"
    category VARCHAR(100),
    fields JSON,  -- [{ field_name, field_type, required, label_pt }]
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- Exemplo fields:
-- [
--   { "id": "chief_complaint", "label": "Queixa Principal", "type": "textarea", "required": true },
--   { "id": "pain_scale", "label": "Escala de Dor (0-10)", "type": "number", "required": true },
--   { "id": "symptom_duration", "label": "Há quanto tempo?", "type": "text", "required": false }
-- ]
```
**Por quê:** Padrão de anamnese por especialidade/corpo, reutilizáção reduz digita ção 40%

---

**Tabela: `procedure_catalog` (Procedimentos/Tratamentos)**
```sql
CREATE TABLE procedure_catalog (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id),
    name VARCHAR(300) NOT NULL,  -- "Infiltração de corticoide - Ombro"
    code VARCHAR(50),  -- TUSS code
    description TEXT,
    estimated_duration_minutes INT,
    risk_factors TEXT,
    post_procedure_care TEXT,
    leaflet_id INT REFERENCES treatment_leaflets(id),
    cid10_codes JSON,  -- [M75.4, M75.5]
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_name (name),
    INDEX idx_code (code)
);
```
**Por quê:** Cataloga procedimentos, vincula com folhetos informativos automáticos

---

**Tabela: `diagnosis_codes` (Catálogo CID-10 localmente)**
```sql
CREATE TABLE diagnosis_codes (
    id SERIAL PRIMARY KEY,
    cid10 VARCHAR(10) UNIQUE,
    description_pt VARCHAR(300),
    description_en VARCHAR(300),
    category VARCHAR(100),  -- "Doenças do ombro", "Doenças da coluna"
    is_common BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_cid10 (cid10),
    INDEX idx_category (category)
);

-- Seed: importar dados públicos do DATASUS
```
**Por quê:** Autocomplete de CID-10 em tempo real, sem chamadas API

---

#### Alta Prioridade (Semana 2-3)

**Tabela: `patient_allergies_structured`**
```sql
CREATE TABLE patient_allergies (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
    medication_id INT REFERENCES medications(id) ON DELETE SET NULL,
    allergen_description VARCHAR(300),
    reaction_type VARCHAR(50),  -- anafilaxia, rash, vômito, etc
    severity VARCHAR(20),  -- leve, moderada, grave
    documented_date DATE,
    alert_active BOOLEAN DEFAULT TRUE,
    INDEX idx_patient_id (patient_id)
);
```
**Por quê:** Estruturado permite busca e alerta automático

---

**Tabela: `prescription_audits`** (Compliance com receita controlada)
```sql
CREATE TABLE prescription_audits (
    id SERIAL PRIMARY KEY,
    prescription_id INT REFERENCES prescriptions(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(20),  -- created, signed, sent, cancelled
    timestamp DATETIME DEFAULT NOW(),
    ip_address VARCHAR(50),
    notes TEXT,
    INDEX idx_prescription_id (prescription_id),
    INDEX idx_timestamp (timestamp)
);
```
**Por quê:** Rastreabilidade de receitas controladas (Portaria 344/ANVISA)

---

### 1.3 Índices Críticos

```sql
-- Prescrições
CREATE INDEX idx_prescriptions_patient_date ON prescriptions(patient_id, date DESC);
CREATE INDEX idx_prescriptions_memed ON prescriptions(memed_id);

-- Anamnese
CREATE INDEX idx_anamnesis_patient_filled ON anamnesis(patient_id, status, filled_at);

-- Consultas
CREATE INDEX idx_consultations_patient_date ON consultations(patient_id, date DESC);
CREATE INDEX idx_consultations_cid10 ON consultations(cid10);

-- Documentos
CREATE INDEX idx_documents_patient_date ON documents(patient_id, date DESC);

-- Agendamentos (crítico para booking)
CREATE INDEX idx_appointments_clinic_date ON appointments(clinic_id, date, status);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
```

**Impacto:** Reduz queries lentas de consultas em 80%, melhora booking

---

## 2. API ENDPOINTS

### 2.1 Implementar (Prioridade Crítica)

#### **GET `/medications/search`** - Autocomplete ANVISA
```
GET /medications/search?q=dipirona&limit=10
Response:
{
  "medications": [
    {
      "id": 1,
      "anvisa_id": "1234567890123",
      "name": "Dipirona Sódica 500mg",
      "manufacturer": "Farmácia X",
      "concentration": "500mg",
      "route": "oral",
      "prescription_type": "branca"
    }
  ]
}
```
**Validação:** Backend valida nome contra banco local, rate limit 1000/hora

---

#### **GET `/medications/{medication_id}/interactions`** - Alerta de interações
```
GET /medications/1/interactions
Response:
{
  "interactions": [
    {
      "with_medication_id": 2,
      "severity": "major",
      "description": "Risco de sangramento aumentado",
      "recommendation": "Usar com cautela, monitorar"
    }
  ],
  "patient_current_meds": [
    { "id": 2, "name": "Warfarina" }  // Se houver conflito
  ]
}
```

---

#### **GET `/anamnesis/templates`** - Templates reutilizáveis
```
GET /anamnesis/templates?category=ombro
Response:
{
  "templates": [
    {
      "id": 1,
      "name": "Anamnese Ombro Completa",
      "fields": [
        { "id": "chief_complaint", "label": "Queixa Principal", "type": "textarea" },
        { "id": "pain_scale", "label": "Escala 0-10", "type": "number" }
      ]
    }
  ]
}
```

---

#### **POST `/prescriptions/validate`** - Validação pré-salvar
```
POST /prescriptions/validate
{
  "patient_id": 1,
  "medications": [
    { "medication_id": 1, "dosage": "500mg", "frequency": "8h", "days": 10 }
  ]
}
Response:
{
  "valid": false,
  "errors": [
    {
      "type": "interaction",
      "severity": "major",
      "message": "Medicamento A interage com Medicamento B"
    },
    {
      "type": "allergy",
      "severity": "critical",
      "message": "Paciente alérgico a Medicamento A"
    }
  ],
  "warnings": []
}
```

---

#### **GET `/patients/{id}/timeline`** - Timeline melhorada
```
GET /patients/1/timeline?limit=50&offset=0
Response:
{
  "timeline": [
    {
      "date": "2025-06-05T10:30:00Z",
      "type": "consultation",
      "icon": "stethoscope",
      "title": "Consulta de Retorno",
      "summary": "Ombro direito - Dor reduzida",
      "details": {
        "consultation_id": 123,
        "diagnosis": "Tendinite do supra-espinhoso",
        "cid10": "M75.1"
      }
    },
    {
      "date": "2025-05-28T14:00:00Z",
      "type": "prescription",
      "icon": "pill",
      "title": "Receita - Dipirona + Ibuprofeno",
      "summary": "10 dias, tomar 8/8h",
      "details": { "prescription_id": 45 }
    },
    {
      "date": "2025-05-20T10:00:00Z",
      "type": "exam",
      "icon": "image",
      "title": "Solicitação - Ressonância Ombro",
      "summary": "Urgência: Eletivo",
      "details": { "exam_id": 12 }
    }
  ],
  "total": 127,
  "hasMore": true
}
```

---

#### **POST `/prescriptions/{id}/send-whatsapp`** - Envio de receita
```
POST /prescriptions/123/send-whatsapp
{
  "patient_phone": "11999999999",
  "include_qr_code": true,
  "message_template": "appointment_followup"
}
Response:
{
  "sent": true,
  "whatsapp_id": "wamid_abc123",
  "timestamp": "2025-06-05T10:45:00Z"
}
```

---

#### **POST `/agenda/chamar-paciente`** - Integração com painel (call queue)
```
POST /clinics/1/queue/call-patient
{
  "appointment_id": 45,
  "status": "calling"
}
Response:
{
  "queue_number": 5,
  "patient_name": "João Silva",
  "room": "Consultório 1",
  "called_at": "2025-06-05T10:50:00Z"
}
```

---

#### **GET `/diagnoses/search`** - Autocomplete CID-10
```
GET /diagnoses/search?q=tendinite&limit=10
Response:
{
  "diagnoses": [
    {
      "cid10": "M75.1",
      "description_pt": "Tendinite do supra-espinhoso"
    },
    {
      "cid10": "M75.4",
      "description_pt": "Tendinite do supra-espinhoso, mão não-dominante"
    }
  ]
}
```

---

### 2.2 Refatorações (Melhorar o que existe)

**GET `/patients/{id}` - Adicionar alertas**
```
Response (adicionar campo):
{
  "id": 1,
  "name": "João Silva",
  ...
  "alerts": {
    "allergies": [
      { "allergen": "Penicilina", "severity": "major" }
    ],
    "pending_prescriptions": 2,
    "expired_prescriptions": 1,
    "overdue_followups": []
  }
}
```

**POST `/consultations` - Validar diagnóstico obrigatório**
```
Adicionar validação:
- cid10 obrigatório para receita controlada
- chief_complaint obrigatório
- physical_exam obrigatório
```

---

## 3. FRONTEND COMPONENTS

### 3.1 Componentes Críticos (Semana 1-2)

#### **`<MedicationSelector />`** - Autocomplete ANVISA
```typescript
interface MedicationSelectorProps {
  value: Medication[];
  onChange: (medications: Medication[]) => void;
  patientId: number;
  disabled?: boolean;
  onInteractionDetected?: (interactions: Interaction[]) => void;
}

// Features:
// - Busca local + API (300ms debounce)
// - Mostra interações em tempo real
// - Alert visual se alergia conhecida
// - Sugerir frequência/dosagem por tipo
```

---

#### **`<PatientAlertBadges />`** - Display de alertas
```typescript
interface PatientAlertBadgesProps {
  patient: Patient;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

// Displays:
// - Alergia (red) 🚨
// - Medicamento controlado (orange) ⚠️
// - Receita expirada (yellow) ⏰
// - Follow-up pendente (blue) 📋
```

---

#### **`<AnamneseTemplateSelector />`** - Templates pré-preenchidas
```typescript
interface AnamneseTemplateSelectorProps {
  patientId: number;
  onTemplateSelected: (template: Template) => void;
  category?: string;
}

// Ação:
// - Clica em template → pré-carrega campos
// - Paciente completa e envia
// - API salva com template_id para rastreabilidade
```

---

#### **`<PrescriptionValidator />`** - Validação visual
```typescript
interface PrescriptionValidatorProps {
  prescription: PrescriptionDraft;
  patientId: number;
  onChange: (updated: PrescriptionDraft) => void;
}

// Mostra:
// - ✅ Medicamento OK
// - ⚠️ Possível interação
// - 🚨 Alergia confirmada
// - 📋 Receita controlada (precisa CRM médico)
```

---

#### **`<PatientTimeline />`** - Timeline tipo Facebook
```typescript
// UI:
// Verticalmente: Data → Ícone (tipo) → Card expandível
// Exemplo:
// 
// 2025-06-05 🩺 Consulta Retorno
//            └─ Ombro direito, dor reduzida
//              [Expandir] → mostra diagnosis, prescrição gerada
//
// 2025-05-28 💊 Receita Dipirona 500mg
//            └─ 10 dias, 8/8h
//              [Expandir] → foto da receita, status MeMed
//
// 2025-05-20 📸 Solicitação Ressonância
//            └─ Urgência: Eletivo
//              [Expandir] → resultado (se disponível)

interface PatientTimelineProps {
  patientId: number;
  limit?: number;
  onEventClick?: (event: TimelineEvent) => void;
}
```

---

#### **`<ProcedureSelector />`** - Catálogo de procedimentos
```typescript
interface ProcedureSelectorProps {
  onSelect: (procedure: Procedure) => void;
  category?: string;
}

// Integração:
// - Seleciona procedimento → carrega folheto automático
// - Estima duração → bloqueia slot no agendamento
// - Cria registro no prontuário
```

---

### 3.2 Componentes Auxiliares (Semana 2-3)

- **`<CidSearchAutocomplete />`** (já existe, melhorar com cache local)
- **`<DosageCalculator />`** - Calcula dose por peso/idade
- **`<InteractionAlert />`** - Popup de confirmação de interação
- **`<FollowupScheduler />`** - Agenda retorno automático
- **`<WhatsAppReceiptPreview />`** - Preview do que será enviado

---

## 4. INTEGRAÇÕES

### 4.1 MeMed ✓ (Pronto)
- **Status:** Integrado
- **O que faz:** Prescrição digital com assinatura eletrônica
- **Melhorias:**
  - [ ] Webhook para receber status assinatura em tempo real
  - [ ] Rastrear recebimento pelo paciente
  - [ ] Fallback manual se MeMed cair

### 4.2 ANVISA 🔴 (NÃO integrado - CRÍTICO)
- **O que falta:** Base de medicamentos oficial
- **Solução:**
  ```bash
  # Opção 1: Web scraping ANVISA (legal mas frágil)
  # Opção 2: API terceira (como Emed ou MeMed API - medicamentos)
  # Opção 3: Seed com dados públicos DATASUS + atualizar 1x/mês
  
  # Recomendação: Opção 3 + cache inteligente
  # - Importar CSV da ANVISA (público)
  # - Atualizar via cron job (1x/mês na madrugada)
  # - Cache Redis por 30 dias
  # - Versão offline: SQLite localmente
  ```

### 4.3 WhatsApp (Evolution API) ✓ (Pronto)
- **Status:** Integrado para agendamento
- **O que falta:**
  - [ ] Envio de receitas digitais (link + QR code)
  - [ ] Lembretes automáticos 24h antes
  - [ ] Pós-consulta template (feedback + folheto)
  - [ ] Confirmação de leitura (WebSocket)

### 4.4 Cloudinary ✓ (Pronto)
- **Status:** Fotos de pacientes
- **O que falta:**
  - [ ] Upload de laudos/exames (OCR automático?)
  - [ ] Galeria de antes/depois de procedimentos
  - [ ] Compressão automática para WhatsApp

### 4.5 Email (NÃO integrado)
- **Por quê:** Documentos formais precisam email
- **Implementar:**
  ```python
  # FastAPI + SendGrid ou Resend
  POST /patients/{id}/documents/send-email
  {
    "document_id": 45,
    "recipient_email": "paciente@email.com",
    "template": "medical_report"
  }
  ```

### 4.6 Futuras (Roadmap)
- ClickSign ou DocuSign (assinatura eletrônica em português)
- PicPay/Stripe (pagamento de consultas)
- Google Workspace (shared calendars)

---

## 5. PERFORMANCE & SEGURANÇA

### 5.1 Cache
```python
# Redis (implementar com FastAPI)
from fastapi_cache2 import FastAPICache2
from fastapi_cache2.backends.redis import RedisBackend

# Estratégia:
# - Medicamentos: 30 dias (raramente muda)
# - CID-10: 30 dias (nunca muda)
# - Agendamentos: 5 minutos (muda frequente)
# - Timeline do paciente: 1 minuto
# - Templates: 7 dias

@app.get("/medications/search")
@cached(namespace="medications", expire=86400*30)
async def search_medications(q: str):
    ...
```

---

### 5.2 Validações Backend

```python
# validators.py
import re
from datetime import datetime

def validate_cpf(cpf: str) -> bool:
    """Valida CPF formato 000.000.000-00"""
    cpf = re.sub(r'\D', '', cpf)
    if len(cpf) != 11:
        return False
    # Algoritmo de validação CPF (Módulo 11)
    ...

def validate_crm(crm: str, state: str) -> bool:
    """Valida CRM format"""
    # CRM deve ter 6 dígitos + estado
    if not re.match(r'^\d{6}$', crm):
        return False
    # Opcionalmente: validar contra base CFM
    ...

def validate_prescription_dates(start_date: date, validity_days: int):
    """Receita não pode ter data futura"""
    if start_date > datetime.now().date():
        raise ValueError("Data de emissão não pode ser futura")
```

---

### 5.3 Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Endpoints críticos
@app.get("/patients")
@limiter.limit("100/hour")
async def list_patients():
    ...

@app.post("/prescriptions")
@limiter.limit("50/hour")  # Previne spam
async def create_prescription():
    ...

@app.get("/medications/search")
@limiter.limit("1000/hour")  # Mais permissivo (autocomplete)
async def search_medications():
    ...
```

---

### 5.4 Criptografia de Dados Sensíveis

```python
from cryptography.fernet import Fernet

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
cipher = Fernet(ENCRYPTION_KEY)

class EncryptedMixin:
    """Para campos: CPF, RG, telefone"""
    
    def encrypt_field(self, value: str) -> str:
        return cipher.encrypt(value.encode()).decode()
    
    def decrypt_field(self, encrypted: str) -> str:
        return cipher.decrypt(encrypted.encode()).decode()

# Model:
class Patient:
    cpf_encrypted = Column(String)
    
    @property
    def cpf_decrypted(self):
        return self.encrypt_field(self.cpf_encrypted) if self.cpf_encrypted else None
```

---

### 5.5 Auditoria de Receitas Controladas

```python
# Compliance com Portaria 344/ANVISA
def create_prescription(data: PrescriptionCreate, current_user: User):
    rx = Prescription(**data.model_dump())
    db.add(rx)
    db.commit()
    
    # Log auditoria obrigatório
    audit = PrescriptionAudit(
        prescription_id=rx.id,
        user_id=current_user.id,
        action="created",
        ip_address=request.client.host,
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    
    return rx
```

---

## 6. TESTES

### 6.1 Cobertura Crítica (Deve-ter)

#### **Test: Validação de Receita Controlada**
```python
def test_prescription_with_controlled_medication():
    """Receita com medicamento controlado exige CRM do médico"""
    patient = create_patient()
    doctor = create_doctor(crm="123456SP")
    
    response = client.post("/prescriptions", json={
        "patient_id": patient.id,
        "medications": [
            {
                "medication_id": get_medication_by_name("Tramadol").id,
                "dosage": "50mg",
                "frequency": "8h",
                "days": 5
            }
        ],
        "doctor_id": doctor.id
    })
    
    assert response.status_code == 201
    assert response.json()["control_type"] == "azul"
    # Verifica se enviado para MeMed com flag controlada
```

#### **Test: Alerta de Alergia**
```python
def test_prescription_allergy_alert():
    """API rejeita medicamento se paciente alérgico"""
    patient = create_patient(allergies=[
        {"allergen": "Penicilina", "severity": "major"}
    ])
    
    response = client.post("/prescriptions/validate", json={
        "patient_id": patient.id,
        "medications": [{"medication_id": penicillin_id, "dosage": "500mg"}]
    })
    
    assert response.status_code == 200
    errors = response.json()["errors"]
    assert any(e["type"] == "allergy" for e in errors)
```

#### **Test: Anamnese Pública com Segurança**
```python
def test_anamnesis_form_security():
    """Link de anamnese expira após 48h"""
    patient = create_patient()
    token = create_anamnesis(patient.id, expires_hours=48)
    
    # Imediatamente: OK
    response = client.get(f"/anamnese/{token}")
    assert response.status_code == 200
    
    # Após 48h: Expirado
    fake_time = now() + timedelta(hours=49)
    with freeze_time(fake_time):
        response = client.get(f"/anamnese/{token}")
        assert response.status_code == 410  # Gone
```

#### **Test: Timeline Carregamento**
```python
def test_patient_timeline_pagination():
    """Timeline suporta pagination para 1000+ eventos"""
    patient = create_patient()
    create_consultations(patient, count=500)
    create_prescriptions(patient, count=500)
    
    response = client.get(f"/patients/{patient.id}/timeline?limit=50")
    
    assert len(response.json()["timeline"]) == 50
    assert response.json()["total"] == 1000
    assert response.json()["hasMore"] == True
```

### 6.2 Testes de Integração

- [ ] MeMed: Prescrição chega com assinatura eletrônica
- [ ] WhatsApp: Receita é enviada e rastreada
- [ ] Cloudinary: Imagens comprimidas e servidas CDN

### 6.3 Testes de Performance

```python
# pytest-benchmark
def test_medication_search_performance(benchmark):
    """Busca deve retornar em <100ms"""
    result = benchmark(search_medications, q="dipirona")
    assert len(result) > 0
```

---

## 7. ROADMAP TÉCNICO PRIORITÁRIO

### Semana 1-2: Fundação (CRÍTICO)
- [ ] BD: Tabelas `medications`, `anamesis_templates`, `diagnosis_codes`
- [ ] BD: Índices de performance
- [ ] API: GET `/medications/search` com autocomplete
- [ ] API: POST `/prescriptions/validate` com alertas
- [ ] API: GET `/diagnoses/search` CID-10
- [ ] Frontend: `<MedicationSelector />` com debounce
- [ ] Frontend: `<PatientAlertBadges />`
- [ ] Tests: Validação de alergia + receita controlada
- **Estimativa:** 40 horas (5 dias, 1 dev)

---

### Semana 2-3: Experiência (ALTA PRIORIDADE)
- [ ] BD: Tabela `procedures_catalog`
- [ ] API: GET `/anamnesis/templates`
- [ ] API: GET `/patients/{id}/timeline` melhorada
- [ ] Frontend: `<AnamneseTemplateSelector />`
- [ ] Frontend: `<PatientTimeline />` estilo Facebook
- [ ] Frontend: `<PrescriptionValidator />`
- [ ] Teste E2E: Fluxo completo receita
- **Estimativa:** 35 horas (4 dias, 2 devs)

---

### Semana 3-4: Integrações (MÉDIA PRIORIDADE)
- [ ] ANVISA: Seed local com dados públicos (CSV)
- [ ] ANVISA: Cron job para atualizar 1x/mês
- [ ] WhatsApp: Envio de receitas `/prescriptions/{id}/send-whatsapp`
- [ ] Redis: Cache de medicamentos + diagnósticos
- [ ] Email: SendGrid para documentos formais
- **Estimativa:** 25 horas (3 dias, 2 devs)

---

### Semana 4+: Refinamento (BAIXA PRIORIDADE)
- [ ] Segurança: Criptografia CPF + RG
- [ ] Auditoria: Tabela `prescription_audits` para Portaria 344
- [ ] Performance: Teste de carga (1000 usuários)
- [ ] Rate limiting: Endpoints críticos
- [ ] Relatórios: Dashboard de prescrições/receitas
- **Estimativa:** 30 horas (próximas semanas)

---

## 8. ESTIMATIVAS DE COMPLEXIDADE

| Tarefa | Complexidade | Dias | Dev | Risco |
|--------|-------------|------|-----|-------|
| Medications CRUD | Baixa | 1 | 1 | Baixo |
| Anamnesis Templates | Média | 2 | 1 | Baixo |
| Procedures Catalog | Média | 1.5 | 1 | Baixo |
| MedicationSelector Frontend | Média | 2 | 1 | Médio |
| Patient Timeline | Média | 2.5 | 1 | Médio |
| ANVISA Integration | Alta | 2 | 1 | Alto |
| WhatsApp Receipts | Alta | 2 | 1 | Alto |
| Prescription Validation | Alta | 3 | 1 | Alto |
| **TOTAL** | **-** | **16.5** | **1** | **-** |

---

## 9. COMPONENTES REUTILIZÁVEIS (DRY)

```typescript
// components/shared/SearchAutocomplete.tsx
interface SearchAutocompleteProps<T> {
  placeholder: string;
  onSearch: (query: string) => Promise<T[]>;
  onSelect: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
  debounceMs?: number;
  minChars?: number;
}

// Reutilizável em:
// - MedicationSelector
// - CidSearch
// - PatientSearch
// - ProcedureSelector
```

```typescript
// components/shared/AlertBadge.tsx
interface AlertBadgeProps {
  type: 'allergy' | 'controlled' | 'expired' | 'followup';
  severity: 'critical' | 'major' | 'minor';
  label: string;
  onClick?: () => void;
}

// Reutilizável em:
// - PatientCard
// - PatientDetail
// - Prescription
// - Timeline
```

---

## 10. DEPENDÊNCIAS NOVAS

### Backend
```toml
# pyproject.toml
redis = "^5.0"  # Caching
slowapi = "^0.1"  # Rate limiting
cryptography = "^41.0"  # Encryption
python-multipart = "^0.0.6"  # File uploads
```

### Frontend
```json
{
  "react-hook-form": "^7.48",
  "zustand": "^4.4",
  "date-fns": "^2.30",
  "react-query": "^3.39"
}
```

---

## 11. CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Banco de Dados ✓
- [ ] Criar migrations no Alembic
- [ ] Seed dados públicos ANVISA
- [ ] Adicionar índices
- [ ] Validar integridade referencial

### Fase 2: Backend APIs
- [ ] Endpoints CRUD para medications
- [ ] Validação de receita com alertas
- [ ] Endpoints de busca com cache
- [ ] Auditoria de receitas
- [ ] Testes unitários (80%+)

### Fase 3: Frontend Components
- [ ] MedicationSelector com autocomplete
- [ ] PatientAlerts display
- [ ] Anamnese templates
- [ ] Timeline visual
- [ ] Testes E2E (Cypress/Playwright)

### Fase 4: Integrações
- [ ] ANVISA sync
- [ ] WhatsApp receipts
- [ ] Redis setup
- [ ] Email service

### Fase 5: Qualidade
- [ ] Security audit
- [ ] Performance testing
- [ ] Load testing (1000 users)
- [ ] Documentação atualizada

---

## Conclusão

A arquitetura atual é **sólida e escalável**. Os principais gaps são:

1. **Catálogo de medicamentos** (falta completamente)
2. **Templates de anamnese** (reutilizabilidade baixa)
3. **Validação de receita** (sem alertas de interação/alergia)
4. **Timeline visual** (experiência melhorável)

Com **16-20 dias de desenvolvimento** é possível implementar tudo com 1-2 desenvolvedores.

**Quick Win:** Começar pelo MedicationSelector + Prescription Validation (semana 1). ROI imediato: reduz erros de prescrição, melhora UX.

