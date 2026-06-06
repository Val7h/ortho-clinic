# OrthoClinic - Schema DDL + Endpoints Specification

---

## PARTE 1: SQL DDL (PostgreSQL)

### A. Tabelas Novas

```sql
-- ============================================================================
-- 1. MEDICAMENTOS (Catálogo ANVISA)
-- ============================================================================

CREATE TABLE medications (
    id SERIAL PRIMARY KEY,
    anvisa_id VARCHAR(20) UNIQUE,
    name VARCHAR(300) NOT NULL,
    active_ingredient VARCHAR(500),
    concentration VARCHAR(100),
    manufacturer VARCHAR(200),
    route VARCHAR(50),  -- oral, injetável, tópica, retal, oftalmológica
    prescription_type VARCHAR(20),  -- branca, azul (controlada), vermelha (receita manual)
    controlled_schedule VARCHAR(50),  -- Anexo I, II, III (se aplicável)
    contraindications TEXT,
    interactions TEXT,  -- JSON: [{ medication_id: int, severity: string, description: string }]
    side_effects TEXT,
    dosage_recommendations TEXT,
    manufacturer_id VARCHAR(50),
    anvisa_status VARCHAR(50),  -- ativo, descontinuado, suspenso
    last_anvisa_update DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_name (name),
    INDEX idx_active_ingredient (active_ingredient),
    INDEX idx_anvisa_id (anvisa_id),
    INDEX idx_route (route),
    INDEX idx_controlled (controlled_schedule)
);

-- Exemplo de dados:
-- INSERT INTO medications (anvisa_id, name, active_ingredient, concentration, manufacturer, route, prescription_type)
-- VALUES 
--   ('1234567890123', 'Dipirona Sódica', 'Dipirona Monoídrica', '500mg', 'Farmácia X', 'oral', 'branca'),
--   ('1234567890124', 'Tramadol HCl', 'Cloridrato de Tramadol', '50mg', 'Farmácia Y', 'oral', 'azul'),
--   ('1234567890125', 'Ibuprofeno', 'Ibuprofeno', '400mg', 'Farmácia Z', 'oral', 'branca');

---

-- ============================================================================
-- 2. TEMPLATES DE ANAMNESE
-- ============================================================================

CREATE TABLE anamnesis_templates (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),  -- ombro, coluna, joelho, mão
    description TEXT,
    fields JSONB NOT NULL,  -- Estrutura abaixo
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(organization_id, name),
    INDEX idx_category (category),
    INDEX idx_active (is_active)
);

-- Estrutura do campo 'fields' (JSONB):
-- [
--   {
--     "id": "chief_complaint",
--     "label": "Queixa Principal",
--     "type": "textarea",
--     "required": true,
--     "placeholder": "Descreva o motivo da consulta"
--   },
--   {
--     "id": "pain_scale",
--     "label": "Escala de Dor (0-10)",
--     "type": "number",
--     "required": true,
--     "min": 0,
--     "max": 10
--   },
--   {
--     "id": "symptom_duration",
--     "label": "Há quanto tempo?",
--     "type": "select",
--     "required": false,
--     "options": ["< 1 semana", "1-2 semanas", "2-4 semanas", "> 1 mês"]
--   }
-- ]

---

-- ============================================================================
-- 3. CATÁLOGO DE PROCEDIMENTOS
-- ============================================================================

CREATE TABLE procedures_catalog (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(300) NOT NULL,
    code VARCHAR(50),  -- TUSS code (se houver)
    description TEXT,
    estimated_duration_minutes INT,
    risk_factors TEXT,
    post_procedure_care TEXT,
    leaflet_id INT REFERENCES treatment_leaflets(id) ON DELETE SET NULL,
    cid10_codes JSONB,  -- ["M75.4", "M75.5"]
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_name (name),
    INDEX idx_code (code),
    INDEX idx_active (is_active)
);

---

-- ============================================================================
-- 4. CÓDIGOS CID-10 (Diagnósticos)
-- ============================================================================

CREATE TABLE diagnosis_codes (
    id SERIAL PRIMARY KEY,
    cid10 VARCHAR(10) UNIQUE NOT NULL,
    description_pt VARCHAR(300),
    description_en VARCHAR(300),
    category VARCHAR(100),  -- Doenças do ombro, Doenças da coluna, etc.
    is_common BOOLEAN DEFAULT FALSE,  -- Para sugerir nos autocompletes
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_cid10 (cid10),
    INDEX idx_category (category),
    INDEX idx_common (is_common)
);

-- Dados iniciais: importar CSV público do DATASUS
-- Exemplo:
-- INSERT INTO diagnosis_codes (cid10, description_pt, category, is_common)
-- VALUES
--   ('M75.0', 'Periartrite do ombro', 'Doenças do ombro', TRUE),
--   ('M75.1', 'Tendinite do supra-espinhoso', 'Doenças do ombro', TRUE),
--   ('M51.2', 'Hérnia de disco torácica com compressão de medula', 'Doenças da coluna', TRUE);

---

-- ============================================================================
-- 5. ALERGIAS ESTRUTURADAS DO PACIENTE
-- ============================================================================

CREATE TABLE patient_allergies (
    id SERIAL PRIMARY KEY,
    patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
    medication_id INT REFERENCES medications(id) ON DELETE SET NULL,
    allergen_description VARCHAR(300),  -- Se não encontrado na BD
    reaction_type VARCHAR(50),  -- anafilaxia, rash, vômito, edema, prurido, etc.
    severity VARCHAR(20),  -- leve, moderada, grave
    documented_date DATE,
    source VARCHAR(100),  -- paciente_relato, teste_alergico, reação_prévia
    notes TEXT,
    alert_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_patient_id (patient_id),
    INDEX idx_medication_id (medication_id),
    INDEX idx_severity (severity),
    INDEX idx_alert_active (alert_active)
);

---

-- ============================================================================
-- 6. AUDITORIA DE RECEITAS (Compliance ANVISA)
-- ============================================================================

CREATE TABLE prescription_audits (
    id SERIAL PRIMARY KEY,
    prescription_id INT REFERENCES prescriptions(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(20),  -- created, signed, sent_whatsapp, sent_email, cancelled
    action_timestamp TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT,
    notes TEXT,
    
    INDEX idx_prescription_id (prescription_id),
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (action_timestamp)
);

---

-- ============================================================================
-- 7. ENVIOS DE RECEITA VIA WHATSAPP
-- ============================================================================

CREATE TABLE prescription_whatsapp_logs (
    id SERIAL PRIMARY KEY,
    prescription_id INT REFERENCES prescriptions(id) ON DELETE CASCADE,
    patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
    phone_number VARCHAR(20),
    whatsapp_message_id VARCHAR(100),
    status VARCHAR(20),  -- pending, sent, delivered, read, failed
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    error_message TEXT,
    
    INDEX idx_prescription_id (prescription_id),
    INDEX idx_patient_id (patient_id),
    INDEX idx_status (status),
    INDEX idx_sent_at (sent_at)
);

---

-- ============================================================================
-- 8. MELHORIAS NA TABELA PRESCRIPTIONS (ALTER)
-- ============================================================================

ALTER TABLE prescriptions ADD COLUMN (
    -- Campos novos
    template_id INT REFERENCES anamnesis_templates(id) ON DELETE SET NULL,
    validated_at TIMESTAMP,
    validation_errors JSONB,  -- {"interactions": [...], "allergies": [...]}
    doctor_crm VARCHAR(50),  -- Para receita controlada (validar CRM)
    prescription_type VARCHAR(20),  -- branca, azul, vermelha
    status VARCHAR(20) DEFAULT 'draft'  -- draft, validated, signed, sent, completed
);

-- Índices novos
CREATE INDEX idx_prescriptions_validated ON prescriptions(validated_at);
CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_doctor_crm ON prescriptions(doctor_crm);

---

-- ============================================================================
-- 9. REFERÊNCIAS NA TABELA ANAMNESIS (ALTER)
-- ============================================================================

ALTER TABLE anamneses ADD COLUMN (
    template_id INT REFERENCES anamnesis_templates(id) ON DELETE SET NULL,
    is_template_based BOOLEAN DEFAULT FALSE
);

---

-- ============================================================================
-- ÍNDICES DE PERFORMANCE GLOBAIS
-- ============================================================================

-- Consultas (já existem, verificar)
CREATE INDEX idx_consultations_patient_date ON consultations(patient_id, date DESC);
CREATE INDEX idx_consultations_cid10 ON consultations(cid10);

-- Timeline (nova, crítica)
CREATE INDEX idx_consultations_for_timeline ON consultations(patient_id, date DESC, created_at DESC);

-- Agendamentos
CREATE INDEX idx_appointments_clinic_date_status ON appointments(clinic_id, date, status);
CREATE INDEX idx_appointments_patient_date ON appointments(patient_id, date DESC);

-- Pacientes com alertas
CREATE INDEX idx_patient_allergies_active ON patient_allergies(patient_id, alert_active);

```

---

## PARTE 2: ENDPOINTS REST

### 2.1 MEDICAMENTOS

#### `GET /medications/search`
```
Busca medicamentos com autocomplete
Autenticação: Required (doctor)
Query params:
  - q: string (obrigatório, min 2 chars)
  - limit: int = 10
  - route: string = null (filter by oral, injetável, tópica)
  - prescription_type: string = null (filter by branca, azul, vermelha)
  - only_common: boolean = false

Response: 200 OK
{
  "medications": [
    {
      "id": 1,
      "anvisa_id": "1234567890123",
      "name": "Dipirona Sódica 500mg",
      "active_ingredient": "Dipirona Monoídrica",
      "concentration": "500mg",
      "manufacturer": "Farmácia X",
      "route": "oral",
      "prescription_type": "branca",
      "controlled_schedule": null
    }
  ],
  "total": 45,
  "query_time_ms": 12
}

Validações:
- q.length >= 2
- limit <= 100 (rate limit 1000/hour)
- Backend: busca local (SQLite ou Redis cache)
```

---

#### `GET /medications/{medication_id}`
```
Retorna detalhes completos de um medicamento
Autenticação: Required

Response: 200 OK
{
  "id": 1,
  "name": "Dipirona Sódica 500mg",
  "active_ingredient": "Dipirona Monoídrica",
  "concentration": "500mg",
  "manufacturer": "Farmácia X",
  "route": "oral",
  "prescription_type": "branca",
  "contraindications": "Gravidez, hipersensibilidade",
  "side_effects": "Reações alérgicas raras, edema angioneurótico",
  "dosage_recommendations": "500mg-1000mg, 6-8 horas",
  "interactions": [
    {
      "with_medication_id": 2,
      "with_name": "Warfarina",
      "severity": "major",
      "description": "Aumenta risco de sangramento"
    }
  ],
  "anvisa_status": "ativo",
  "last_anvisa_update": "2025-05-01"
}
```

---

#### `GET /medications/{medication_id}/interactions`
```
Valida interações com medicamentos do paciente
Autenticação: Required

Query params:
  - patient_id: int (para comparar com medicações atuais)

Response: 200 OK
{
  "medication": {
    "id": 1,
    "name": "Dipirona"
  },
  "interactions": [
    {
      "with_medication_id": 2,
      "with_name": "Warfarina",
      "severity": "major",
      "description": "Risco de sangramento aumentado"
    }
  ],
  "patient_current_medications": [
    {
      "id": 2,
      "name": "Warfarina 5mg",
      "has_interaction": true
    }
  ],
  "has_major_interactions": true
}
```

---

#### `POST /medications/sync-anvisa`
```
Admin endpoint: sincroniza com ANVISA (cron job)
Autenticação: Required (admin)

Body:
{
  "source": "csv_upload" | "api_call" | "datasus_import",
  "file_path": "/uploads/anvisa_2025_06.csv" (se upload),
  "force_update": false
}

Response: 202 Accepted
{
  "job_id": "sync_123456",
  "status": "queued",
  "estimated_duration_seconds": 300,
  "medications_to_process": 15000,
  "message": "Sincronização iniciada. Você receberá email quando concluída."
}
```

---

### 2.2 DIAGNÓSTICOS (CID-10)

#### `GET /diagnoses/search`
```
Busca CID-10 com autocomplete
Autenticação: Required

Query params:
  - q: string (obrigatório, min 1 char)
  - limit: int = 10
  - category: string = null (Doenças do ombro, Doenças da coluna)
  - only_common: boolean = true

Response: 200 OK
{
  "diagnoses": [
    {
      "id": 1,
      "cid10": "M75.1",
      "description_pt": "Tendinite do supra-espinhoso",
      "description_en": "Supraspinatus tendinitis",
      "category": "Doenças do ombro",
      "is_common": true
    },
    {
      "id": 2,
      "cid10": "M75.10",
      "description_pt": "Tendinite do supra-espinhoso, mão não-dominante",
      "description_en": "Supraspinatus tendinitis, non-dominant hand",
      "category": "Doenças do ombro",
      "is_common": false
    }
  ],
  "total": 47
}
```

---

### 2.3 TEMPLATES DE ANAMNESE

#### `GET /anamnesis/templates`
```
Lista templates reutilizáveis
Autenticação: Required

Query params:
  - category: string = null (ombro, coluna, joelho)
  - organization_id: int = current_user.organization_id

Response: 200 OK
{
  "templates": [
    {
      "id": 1,
      "name": "Anamnese Ombro Completa",
      "category": "ombro",
      "description": "Template padrão para lesões de ombro",
      "field_count": 8,
      "is_active": true,
      "fields": [
        {
          "id": "chief_complaint",
          "label": "Queixa Principal",
          "type": "textarea",
          "required": true
        },
        {
          "id": "pain_scale",
          "label": "Escala de Dor (0-10)",
          "type": "number",
          "required": true
        }
      ]
    }
  ],
  "total": 5
}
```

---

#### `GET /anamnesis/templates/{template_id}`
```
Retorna template completo com estrutura
Response: 200 OK (mesmo formato acima)
```

---

#### `POST /anamnesis/templates`
```
Cria novo template (admin/doctor)
Autenticação: Required (doctor+)

Body:
{
  "name": "Anamnese Ombro Completa",
  "category": "ombro",
  "description": "Template padrão para lesões de ombro",
  "fields": [
    {
      "id": "chief_complaint",
      "label": "Queixa Principal",
      "type": "textarea",
      "required": true,
      "placeholder": "Descreva o motivo da consulta"
    },
    {
      "id": "pain_scale",
      "label": "Escala de Dor (0-10)",
      "type": "number",
      "required": true,
      "min": 0,
      "max": 10
    }
  ]
}

Response: 201 Created
{ id: 1, ... }
```

---

### 2.4 VALIDAÇÃO DE RECEITA

#### `POST /prescriptions/validate`
```
Valida receita ANTES de salvar (draft → validation)
Autenticação: Required (doctor)

Body:
{
  "patient_id": 1,
  "medications": [
    {
      "medication_id": 1,
      "dosage": "500mg",
      "frequency": "8h",
      "days": 10,
      "route": "oral"
    }
  ],
  "instructions": "Tomar com alimentos"
}

Response: 200 OK
{
  "valid": false,
  "validation_summary": {
    "has_errors": true,
    "has_warnings": true,
    "error_count": 2,
    "warning_count": 1
  },
  "errors": [
    {
      "type": "allergy",
      "severity": "critical",
      "medication_id": 1,
      "medication_name": "Dipirona",
      "message": "Paciente alérgico a Dipirona",
      "allergy_severity": "grave",
      "recommendation": "Utilizar alternativa"
    },
    {
      "type": "interaction",
      "severity": "major",
      "medication_id": 1,
      "medication_name": "Dipirona",
      "with_medication_id": 2,
      "with_medication_name": "Warfarina",
      "message": "Interação major: aumenta risco de sangramento",
      "recommendation": "Considerar alternativa ou monitorar"
    }
  ],
  "warnings": [
    {
      "type": "dosage",
      "medication_id": 1,
      "message": "Dosagem acima do usual (máximo recomendado: 1000mg)",
      "recommendation": "Confirmar prescrição"
    }
  ]
}

Validações:
- Verifica alergia em patient_allergies (crítico)
- Verifica interações em medications.interactions (major/moderate)
- Valida dosagem contra medicamento
- Se controlled_schedule: valida doctor_crm
- Se receita branca: pode ter warning, nunca erro
- Se receita azul: deve ter validação de CRM
```

---

#### `POST /prescriptions` (modificado)
```
Cria prescrição após validação
Autenticação: Required (doctor)

Body:
{
  "patient_id": 1,
  "consultation_id": 123,  // opcional
  "date": "2025-06-05",
  "medications": [...],  // mesma estrutura
  "instructions": "Tomar com alimentos",
  "validity_days": 30,
  "template_id": null,  // para rastrear origem
  "doctor_crm": "123456SP",  // obrigatório se controlled
  "validated": true  // já validou?
}

Response: 201 Created
{
  "id": 45,
  "patient_id": 1,
  "status": "draft",
  "validated_at": "2025-06-05T10:30:00Z",
  "validation_errors": null,
  "medications": [...],
  "created_at": "2025-06-05T10:30:00Z"
}

POST /prescriptions/{id}/sign
{
  "signature": "base64_image_or_id",
  "memed_send": true  // enviar para MeMed?
}

Response: 200 OK
{
  "id": 45,
  "status": "signed",
  "memed_id": "ABC123DEF",
  "signed_at": "2025-06-05T10:35:00Z",
  "audit_log": [
    { "action": "created", "timestamp": "..." },
    { "action": "validated", "timestamp": "..." },
    { "action": "signed", "timestamp": "..." }
  ]
}
```

---

### 2.5 TIMELINE DO PACIENTE

#### `GET /patients/{patient_id}/timeline`
```
Timeline visual de todo histórico
Autenticação: Required (doctor)

Query params:
  - limit: int = 50
  - offset: int = 0
  - types: string = null (comma-separated: consultation,prescription,exam,report)
  - from_date: ISO string = null
  - to_date: ISO string = null

Response: 200 OK
{
  "patient_id": 1,
  "patient_name": "João Silva",
  "total_events": 127,
  "limit": 50,
  "offset": 0,
  "has_more": true,
  
  "timeline": [
    {
      "id": "evt_001_consultation_123",
      "date": "2025-06-05T10:30:00Z",
      "type": "consultation",
      "icon": "stethoscope",
      "title": "Consulta de Retorno - Ombro",
      "summary": "Ombro direito - Dor reduzida de 8/10 para 5/10",
      "details": {
        "consultation_id": 123,
        "consultation_type": "retorno",
        "chief_complaint": "Ombro direito com dor",
        "pain_scale": 5,
        "diagnosis": "Tendinite do supra-espinhoso",
        "cid10": "M75.1",
        "treatment_plan": "Continuar repouso, fisioterapia",
        "procedures": ["Infiltração de corticoide"]
      },
      "expandable": true
    },
    {
      "id": "evt_002_prescription_45",
      "date": "2025-05-28T14:00:00Z",
      "type": "prescription",
      "icon": "pill",
      "title": "Receita - Dipirona + Ibuprofeno",
      "summary": "10 dias, tomar 8/8h com alimentos",
      "details": {
        "prescription_id": 45,
        "status": "signed",
        "medications": [
          { "id": 1, "name": "Dipirona 500mg", "dosage": "500mg", "frequency": "8h", "days": 10 },
          { "id": 2, "name": "Ibuprofeno 400mg", "dosage": "400mg", "frequency": "12h", "days": 10 }
        ],
        "memed_id": "ABC123",
        "sent_whatsapp": true,
        "sent_at": "2025-05-28T14:05:00Z"
      },
      "expandable": true
    },
    {
      "id": "evt_003_exam_12",
      "date": "2025-05-20T10:00:00Z",
      "type": "exam",
      "icon": "image",
      "title": "Solicitação de Exame - Ressonância Ombro",
      "summary": "Urgência: Eletivo | Status: Pendente",
      "details": {
        "exam_id": 12,
        "exams": ["Ressonância Magnética Ombro"],
        "clinical_indication": "Avaliar lesão de manguito rotador",
        "status": "pending",
        "has_result": false
      },
      "expandable": true
    },
    {
      "id": "evt_004_report_8",
      "date": "2025-05-15T11:00:00Z",
      "type": "report",
      "icon": "file-text",
      "title": "Laudo - Avaliação Funcional",
      "summary": "Amplitude de movimento limitada 45°",
      "details": {
        "report_id": 8,
        "report_type": "Avaliação Funcional",
        "content_preview": "Paciente com limitação de abdução..."
      },
      "expandable": true
    }
  ]
}

Cache: 60 segundos (muita leitura)
```

---

### 2.6 INTEGRAÇÃO WHATSAPP

#### `POST /prescriptions/{prescription_id}/send-whatsapp`
```
Envia receita via WhatsApp
Autenticação: Required (doctor)

Body:
{
  "patient_phone": "11999999999",
  "include_qr_code": true,
  "include_pdf": false,
  "message_template": "prescription_simple" | "prescription_detailed" | "custom",
  "custom_message": null  // se template = custom
}

Response: 200 OK
{
  "sent": true,
  "whatsapp_message_id": "wamid_1234567890",
  "phone": "5511999999999",
  "timestamp": "2025-06-05T10:45:00Z",
  "status": "sent",
  "audit_log_id": 999
}

Response: 400 Bad Request (validation)
{
  "error": "patient_phone_invalid",
  "message": "Formato de telefone inválido. Use (11) 99999-9999"
}

Validações:
- phone válido (brasileiro format)
- prescription.status in ['signed', 'sent']
- WhatsApp instance configurado
- Rate limit: 100/hora por usuário
```

---

#### `GET /prescriptions/{prescription_id}/whatsapp-status`
```
Rastreia entrega da receita
Response: 200 OK
{
  "prescription_id": 45,
  "whatsapp_logs": [
    {
      "id": 1,
      "phone": "5511999999999",
      "message_id": "wamid_123",
      "status": "read",
      "sent_at": "2025-06-05T10:45:00Z",
      "delivered_at": "2025-06-05T10:46:00Z",
      "read_at": "2025-06-05T10:50:00Z"
    }
  ]
}
```

---

### 2.7 PROCEDIMENTOS

#### `GET /procedures`
```
Lista procedimentos do catálogo
Query params:
  - category: string = null
  - limit: int = 50
  - offset: int = 0

Response: 200 OK
{
  "procedures": [
    {
      "id": 1,
      "name": "Infiltração de Corticoide - Ombro",
      "code": "40301027",  // TUSS
      "description": "Infiltração intra-articular com anestésico e corticoide",
      "estimated_duration_minutes": 15,
      "cid10_codes": ["M75.0", "M75.1", "M75.4"],
      "leaflet_id": 5,
      "leaflet_title": "Infiltração de Ombro - O que você precisa saber"
    }
  ],
  "total": 23
}
```

---

## PARTE 3: FLUXOS EXEMPLO (End-to-End)

### Fluxo 1: Prescrição com Validação

```
1. Frontend: Doctor clica "Nova Receita"
   → Modal abre com MedicationSelector

2. Doctor digita "dipirona" no autocomplete
   → GET /medications/search?q=dipirona
   → Recebe lista (100ms)
   → Seleciona "Dipirona Sódica 500mg" (id=1)

3. Frontend: Carrega interações da medicação
   → GET /medications/1/interactions?patient_id=123
   → Backend: busca patient_current_medications, cruza com interactions
   → Se tem interação major: alerta visual 🟠

4. Doctor: Seleciona frequência + dias
   → Valida dosagem automaticamente

5. Doctor: Clica "Validar Receita"
   → POST /prescriptions/validate
   {
     patient_id: 123,
     medications: [
       { medication_id: 1, dosage: "500mg", frequency: "8h", days: 10 }
     ]
   }
   
6. Backend: Valida
   - Alergia? patient_allergies.severity = "grave" → Erro 🚨
   - Interação? medications.interactions → Warning 🟠
   - Dosagem? medication.dosage_recommendations → Check ✓
   
7. Response:
   {
     valid: false,
     errors: [
       { type: "allergy", severity: "critical", ... }
     ],
     warnings: [...]
   }

8. Frontend: Mostra erros + oferece alternativas
   → Doctor pode:
     a) Cancelar
     b) Sobrescrever com justificativa (log auditoria)
     c) Trocar medicamento (busca alternativas)

9. Doctor: Confirma prescrição (sobrescrever + justificativa)
   → POST /prescriptions
   {
     ...,
     validated: true,
     validation_override_reason: "Paciente não tolera alternativas"
   }

10. Backend:
    - Cria prescription com status = 'draft'
    - Loga em prescription_audits
    - Retorna para assinatura

11. Doctor: Assina (digital ou foto)
    → PATCH /prescriptions/45/sign
    → Status muda para 'signed'
    → Loga em prescription_audits

12. Doctor: Envia para WhatsApp
    → POST /prescriptions/45/send-whatsapp
    {
      patient_phone: "11999999999",
      include_qr_code: true
    }
    
13. Backend:
    - Formata mensagem WhatsApp
    - Envia via Evolution API
    - Salva em prescription_whatsapp_logs
    - Status → 'sent'
    - Loga em prescription_audits

14. WhatsApp: Paciente recebe → lê → abre link
    → /confirmar/token → vê receita + folheto
    
✓ Fluxo completado com auditoria completa
```

---

### Fluxo 2: Criação de Anamnese com Template

```
1. Frontend: Doctor clica "Enviar Anamnese" para paciente
   → GET /anamnesis/templates?category=ombro
   → Lista aparece: "Anamnese Ombro Completa"

2. Doctor: Clica em template
   → Carrega estrutura de campos
   → Gera link seguro (token + 48h expiry)

3. POST /patients/123/anamnese
   {
     expires_hours: 48,
     template_id: 1
   }
   
   Response:
   {
     token: "abc123xyz",
     link: "https://ortho.clinic/anamnese/abc123xyz",
     expires_at: "2025-06-07T10:30:00Z"
   }

4. Frontend: Envia link via WhatsApp ao paciente
   POST /anamnesis/1/send-whatsapp
   
5. Paciente: Clica link + preenche anamnese
   GET /anamnese/abc123xyz
   {
     patient_name: "João Silva",
     fields: [
       { id: "chief_complaint", label: "Queixa Principal", type: "textarea", ... },
       ...
     ]
   }

6. Paciente: Envia respostas
   POST /anamnese/abc123xyz
   {
     chief_complaint: "Dor no ombro direito há 2 semanas",
     pain_scale: 8,
     symptom_duration: "2-4 semanas",
     ...
   }
   
7. Backend:
   - Salva responses em anamnesis.responses (JSON)
   - Status → "filled"
   - Loga timestamp + preenchimento

8. Doctor: Próxima vez que vê paciente
   GET /patients/123/anamnese
   → Vê último preenchimento
   → Click para expandi-lo na consulta
   → Usa dados para montar nova anamnese estruturada

✓ Paciente preenche EM CASA → Doctor tem dados organizados
```

---

## Índices de Performance Recomendados

```sql
-- Leitura rápida de timeline
EXPLAIN ANALYZE
SELECT * FROM consultations 
WHERE patient_id = 1 
ORDER BY date DESC 
LIMIT 50;

-- Timeline com múltiplos tipos (UNION)
EXPLAIN ANALYZE
(SELECT 'consultation' as type, date, ... FROM consultations WHERE patient_id = 1)
UNION ALL
(SELECT 'prescription' as type, date, ... FROM prescriptions WHERE patient_id = 1)
UNION ALL
(SELECT 'exam' as type, date, ... FROM exam_requests WHERE patient_id = 1)
ORDER BY date DESC
LIMIT 50;

-- Busca de medicamentos
EXPLAIN ANALYZE
SELECT * FROM medications 
WHERE name ILIKE '%dipirona%' 
LIMIT 10;
-- Com índice GIST: busca FTS seria 10x mais rápida
-- CREATE INDEX idx_medications_name_gin ON medications 
-- USING GIN (to_tsvector('portuguese', name));

-- Auditoria de receitas
EXPLAIN ANALYZE
SELECT * FROM prescription_audits 
WHERE prescription_id = 45 
ORDER BY action_timestamp DESC;
```

---

## Summary Endpoints

| Método | Path | Autenticação | Prioridade |
|--------|------|--------------|-----------|
| GET | `/medications/search` | Doctor | Crítica |
| GET | `/medications/{id}` | Doctor | Crítica |
| GET | `/medications/{id}/interactions` | Doctor | Crítica |
| POST | `/medications/sync-anvisa` | Admin | Alta |
| GET | `/diagnoses/search` | Doctor | Crítica |
| GET | `/anamnesis/templates` | Doctor | Alta |
| GET | `/anamnesis/templates/{id}` | Doctor | Alta |
| POST | `/anamnesis/templates` | Doctor | Média |
| POST | `/prescriptions/validate` | Doctor | Crítica |
| POST | `/prescriptions` | Doctor | Existente |
| GET | `/patients/{id}/timeline` | Doctor | Alta |
| POST | `/prescriptions/{id}/send-whatsapp` | Doctor | Alta |
| GET | `/prescriptions/{id}/whatsapp-status` | Doctor | Média |
| GET | `/procedures` | Doctor | Média |

**Total novos endpoints:** ~13 (principais) + 5-10 (suporte)
**Tempo estimado:** 3 semanas (2 devs)

