# OrthoClinic - Checklist de Implementação Técnica

**Preparado em:** 2026-06-05  
**Versão:** 1.0  
**Status:** Pronto para execução

---

## FASE 0: SETUP (1 dia)

### 0.1 Banco de Dados
- [ ] Backup completo de produção
- [ ] Criar branch `feature/db-improvements` no git
- [ ] Setup Alembic para migrations (se não tiver)
- [ ] Testar migrations em ambiente de staging

### 0.2 Frontend
- [ ] Instalar dependências novas: `npm install zustand date-fns react-hook-form`
- [ ] Setup TypeScript strict mode (se não tiver)
- [ ] Criar `/components/shared/SearchAutocomplete.tsx` (base reutilizável)
- [ ] Criar `/components/shared/AlertBadge.tsx` (base reutilizável)

### 0.3 Backend
- [ ] `pip install fastapi-cache2 redis slowapi cryptography`
- [ ] Criar `/validators/` directory
- [ ] Criar `/services/medications.py` (camada de negócio)
- [ ] Criar `/services/prescriptions.py` (validação centralizada)
- [ ] Setup Redis dev (local ou Docker)

---

## FASE 1: BANCO DE DADOS (5 dias)

### 1.1 Criar Tabelas Novas
- [ ] `medications` - Catálogo ANVISA
  - [ ] Migrations Alembic
  - [ ] Seed dados iniciais (100 medicamentos comuns)
  - [ ] Índices criados
  - [ ] Testes: inserir/buscar funciona

- [ ] `diagnosis_codes` - CID-10
  - [ ] Migrations Alembic
  - [ ] Seed dados públicos DATASUS (importar CSV)
  - [ ] Índices criados
  - [ ] Verificar integridade (11000+ códigos)

- [ ] `anamnesis_templates` - Templates de formulário
  - [ ] Migrations Alembic
  - [ ] Seeds com 3-5 templates padrão (ombro, coluna, joelho)
  - [ ] Índices criados

- [ ] `procedures_catalog` - Catálogo de procedimentos
  - [ ] Migrations Alembic
  - [ ] Seed com 20+ procedimentos ortopédicos
  - [ ] Índices criados

- [ ] `patient_allergies` - Alergias estruturadas
  - [ ] Migrations Alembic
  - [ ] Índices criados
  - [ ] Testes: busca por severity funciona

- [ ] `prescription_audits` - Auditoria Portaria 344
  - [ ] Migrations Alembic
  - [ ] Índices criados

- [ ] `prescription_whatsapp_logs` - Rastreamento WhatsApp
  - [ ] Migrations Alembic
  - [ ] Índices criados

### 1.2 Alterar Tabelas Existentes
- [ ] `prescriptions`: ADD COLUMNS (template_id, validated_at, status, doctor_crm)
  - [ ] Migrations Alembic
  - [ ] Rollback plan definido

- [ ] `anamneses`: ADD COLUMN (template_id)
  - [ ] Migrations Alembic

- [ ] `patients`: MODIFICAR allergies
  - [ ] Migrar dados texto → estruturado (script SQL)
  - [ ] Validar integridade

### 1.3 Índices de Performance
- [ ] Executar todos os índices definidos em SCHEMA_AND_ENDPOINTS.md
- [ ] Executar ANALYZE em todas as tabelas
- [ ] Benchmarking: busca medicamento < 100ms

### 1.4 Testes Banco de Dados
- [ ] Teste volume: 1000 medicamentos buscáveis por nome
- [ ] Teste volume: 11000+ diagnósticos buscáveis
- [ ] Teste integridade: foreign keys funcionam
- [ ] Teste rollback: migrations podem voltar

---

## FASE 2: BACKEND - MEDICAMENTOS & DIAGNÓSTICOS (7 dias)

### 2.1 Modelos SQLAlchemy
- [ ] `models/medication.py` - Medication model
- [ ] `models/diagnosis.py` - DiagnosisCode model
- [ ] `models/patient_allergy.py` - PatientAllergy model
- [ ] `models/procedure.py` - Procedure model
- [ ] Adicionar relacionamentos em Patient

### 2.2 Schemas Pydantic
- [ ] `schemas/medications.py`
  - MedicationOut
  - MedicationSearchOut
  - MedicationInteractionsOut

- [ ] `schemas/diagnoses.py`
  - DiagnosisCodeOut
  - DiagnosisSearchOut

- [ ] `schemas/allergies.py`
  - PatientAllergyCreate
  - PatientAllergyOut

### 2.3 Validadores
- [ ] `validators/medications.py`
  - `validate_medication_dosage()`
  - `validate_medication_interaction()`
  - `check_patient_allergies()`
  - `check_controlled_medication()`

- [ ] `validators/prescription.py`
  - `validate_prescription_complete()`
  - `validate_doctor_crm()` - integrar com CFM?

### 2.4 Serviços (Lógica de Negócio)
- [ ] `services/medications.py`
  ```python
  - search_medications(query, limit, filters)
  - get_medication_interactions(medication_id, patient_id)
  - sync_anvisa_medications(source)
  ```

- [ ] `services/prescriptions.py`
  ```python
  - validate_prescription(patient_id, medications)
  - create_prescription_with_validation(data)
  - check_allergies(patient_id, medication_ids)
  - check_interactions(patient_id, medication_ids)
  ```

- [ ] `services/diagnoses.py`
  ```python
  - search_diagnosis_codes(query, limit)
  ```

### 2.5 Routers
- [ ] `routers/medications.py`
  - GET /medications/search
  - GET /medications/{id}
  - GET /medications/{id}/interactions
  - POST /medications/sync-anvisa (admin only)

- [ ] `routers/diagnoses.py`
  - GET /diagnoses/search

- [ ] `routers/prescriptions.py` (modificar existente)
  - POST /prescriptions/validate (novo)
  - Modificar POST /prescriptions para aceitar validation_override_reason

- [ ] `routers/allergies.py`
  - GET /patients/{id}/allergies
  - POST /patients/{id}/allergies

### 2.6 Cache (Redis)
- [ ] Setup Redis local (docker-compose update)
- [ ] Cache configuration in config.py
- [ ] Implementar cache em:
  - [ ] GET /medications/search (30 dias)
  - [ ] GET /diagnoses/search (30 dias)
  - [ ] GET /anamnesis/templates (7 dias)
  - [ ] GET /medications/{id} (30 dias)

### 2.7 Rate Limiting
- [ ] Implementar slowapi em:
  - [ ] GET /medications/search (1000/hora)
  - [ ] POST /prescriptions/validate (100/hora)
  - [ ] POST /prescriptions/send-whatsapp (100/hora)

### 2.8 Testes Unitários
- [ ] `tests/test_medications.py`
  - [ ] test_search_medications_empty_query → 400
  - [ ] test_search_medications_with_results → 200, verificar formato
  - [ ] test_medication_interactions_with_patient → resultado correto
  - [ ] test_medication_not_found → 404

- [ ] `tests/test_prescriptions_validation.py`
  - [ ] test_validate_prescription_with_allergy → errors
  - [ ] test_validate_prescription_with_interaction → warnings
  - [ ] test_validate_prescription_clean → valid: true
  - [ ] test_create_prescription_after_validation → 201
  - [ ] test_controlled_medication_requires_crm → validation error

- [ ] `tests/test_diagnoses.py`
  - [ ] test_search_diagnoses_by_code
  - [ ] test_search_diagnoses_by_description
  - [ ] test_search_diagnoses_limit

- [ ] `tests/test_allergies.py`
  - [ ] test_add_patient_allergy
  - [ ] test_allergy_triggers_validation_error
  - [ ] test_multiple_allergies_listed

### 2.9 Documentação OpenAPI
- [ ] Docstrings em todos endpoints
- [ ] /docs atualizado
- [ ] Schema examples completos

---

## FASE 3: FRONTEND - COMPONENTES CORE (7 dias)

### 3.1 Componentes Base (reutilizáveis)
- [ ] `components/shared/SearchAutocomplete.tsx`
  - [ ] Props generalizadas <T>
  - [ ] Debounce 300ms
  - [ ] Loading state
  - [ ] Error handling
  - [ ] Keyboard navigation
  - [ ] Testes: Cypress

- [ ] `components/shared/AlertBadge.tsx`
  - [ ] Type: allergy | controlled | expired | followup
  - [ ] Severity colors
  - [ ] Tooltip com descrição
  - [ ] Testes: Jest

### 3.2 Componentes de Domínio
- [ ] `components/MedicationSelector.tsx`
  - [ ] Usa SearchAutocomplete
  - [ ] Mostra interações em tempo real
  - [ ] Alerta de alergia
  - [ ] Sugestões de dosagem/frequência
  - [ ] Múltiplas medicações
  - [ ] Testes: Cypress (fluxo completo)

- [ ] `components/PatientAlertBadges.tsx`
  - [ ] Renderiza alertas de paciente
  - [ ] Alergia (vermelho 🚨)
  - [ ] Medicamento controlado (laranja ⚠️)
  - [ ] Receita expirada (amarelo ⏰)
  - [ ] Follow-up pendente (azul 📋)
  - [ ] Testes: Jest snapshots

- [ ] `components/AnamneseTemplateSelector.tsx`
  - [ ] Lista templates por categoria
  - [ ] Clique → carrega campos
  - [ ] Preview dos campos
  - [ ] Testes: Cypress

- [ ] `components/PrescriptionValidator.tsx`
  - [ ] POST /prescriptions/validate
  - [ ] Mostra erros/warnings
  - [ ] Sugestão de alternativas
  - [ ] Botão "Sobrescrever com justificativa"
  - [ ] Testes: Cypress

- [ ] `components/PatientTimeline.tsx`
  - [ ] Carrega GET /patients/{id}/timeline
  - [ ] Renderiza verticalmente
  - [ ] Cards expandíveis
  - [ ] Ícones por tipo (consultation, prescription, exam, report)
  - [ ] Infinite scroll ou pagination
  - [ ] Testes: Cypress + Jest

### 3.3 Hooks Customizados
- [ ] `hooks/useMedicationSearch.ts`
  - [ ] Debounce search
  - [ ] Cache local
  - [ ] Error handling

- [ ] `hooks/usePrescriptionValidator.ts`
  - [ ] Valida prescrição
  - [ ] Gerencia estado
  - [ ] Retorna erros/warnings

- [ ] `hooks/usePatientAlerts.ts`
  - [ ] Busca alertas do paciente
  - [ ] Cache por 5min
  - [ ] Polling opcional

### 3.4 Integração em Páginas Existentes
- [ ] `/app/pacientes/[id]/consulta/page.tsx` → Integrar MedicationSelector
- [ ] `/app/pacientes/[id]/receitas/page.tsx` → Integrar PrescriptionValidator
- [ ] `/app/pacientes/[id]/page.tsx` → Adicionar PatientAlertBadges no topo
- [ ] `/app/pacientes/[id]/timeline/page.tsx` → Render PatientTimeline

### 3.5 Testes E2E
- [ ] `e2e/prescription-flow.cy.ts`
  - Doctor acessa paciente
  - Clica "Nova Receita"
  - Busca medicamento (autocomplete)
  - Valida (OK)
  - Salva receita
  - Assina digitalmente
  - Envia WhatsApp
  - ✓ Fluxo completo

- [ ] `e2e/allergy-alert.cy.ts`
  - Doctor tenta prescrever medicamento que paciente é alérgico
  - Alerta aparece
  - Tenta sobrescrever
  - Validação de justificativa
  - ✓ Segurança funciona

---

## FASE 4: BACKEND - INTEGRAÇÕES (5 dias)

### 4.1 WhatsApp - Envio de Receitas
- [ ] `services/whatsapp_prescriptions.py`
  - [ ] `send_prescription_message(prescription_id, patient_phone)`
  - [ ] Formata mensagem com:
    - Medicações
    - Instruções
    - QR code para MeMed
    - Link para prontuário (se houver)
  - [ ] Integra com Evolution API
  - [ ] Loga em prescription_whatsapp_logs

- [ ] `routers/prescriptions.py`
  - [ ] POST /prescriptions/{id}/send-whatsapp (novo)
  - [ ] GET /prescriptions/{id}/whatsapp-status (novo)

- [ ] Webhook WhatsApp (opcional)
  - [ ] POST /webhooks/whatsapp/status
  - [ ] Atualiza prescription_whatsapp_logs com status

### 4.2 ANVISA Sync
- [ ] `services/anvisa.py`
  - [ ] `import_anvisa_csv(filepath)`
  - [ ] `sync_from_api()` (se usar API externa)
  - [ ] Validação de duplicatas
  - [ ] Cleanup de dados antigos

- [ ] `routers/admin.py`
  - [ ] POST /admin/medications/sync-anvisa

- [ ] Cron Job
  - [ ] Agendador para 1x/mês (madrugada)
  - [ ] Log de sincronização
  - [ ] Notificação se falhar

### 4.3 Auditoria de Receitas
- [ ] `services/audit.py`
  - [ ] `log_prescription_action(prescription_id, user_id, action, ip_address, ...)`
  - [ ] Centraliza toda auditoria

- [ ] Modificar prescription routes
  - [ ] Chamar `log_prescription_action` em cada operação

### 4.4 Email (SendGrid)
- [ ] `services/email.py`
  - [ ] `send_prescription_email(patient_email, prescription_id)`
  - [ ] Template HTML de receita
  - [ ] Attachment PDF (se MeMed fornecer)

- [ ] `routers/documents.py`
  - [ ] POST /patients/{id}/send-document-email (novo)

### 4.5 Testes Integração
- [ ] `tests/integration/test_prescription_flow.py`
  - [ ] Cria prescription → valida → assina → envia WhatsApp
  - [ ] Verifica logs em prescription_audits

- [ ] `tests/integration/test_anvisa_sync.py`
  - [ ] Simula upload CSV
  - [ ] Verifica medications criados/atualizados
  - [ ] Verifica versão anterior arquivada

---

## FASE 5: ANAMENSESE & PROCEDIMENTOS (5 dias)

### 5.1 Templates de Anamnese
- [ ] `routers/anamnesis.py` (modificar existente)
  - [ ] GET /anamnesis/templates (novo)
  - [ ] GET /anamnesis/templates/{id} (novo)
  - [ ] POST /anamnesis/templates (novo, admin)
  - [ ] Modificar POST /patients/{id}/anamnese para aceitar template_id

- [ ] `services/anamnesis.py`
  - [ ] `create_anamnesis_from_template(patient_id, template_id)`

### 5.2 Catálogo de Procedimentos
- [ ] `models/procedure.py`
- [ ] `schemas/procedure.py`
- [ ] `routers/procedures.py`
  - [ ] GET /procedures
  - [ ] GET /procedures/{id}
  - [ ] POST /procedures (admin)

- [ ] Integração com Timeline
  - [ ] Se há procedure em consultation → mostra no timeline

### 5.3 Frontend Components
- [ ] `components/AnamneseTemplateSelector.tsx` (concluir)
- [ ] `components/ProcedureSelector.tsx`

### 5.4 Testes
- [ ] `tests/test_anamnesis_templates.py`
- [ ] `tests/test_procedures.py`

---

## FASE 6: TIMELINE DO PACIENTE (5 dias)

### 6.1 Backend
- [ ] `services/timeline.py`
  - [ ] `get_patient_timeline(patient_id, limit, offset, types, date_range)`
  - [ ] Consolida dados de múltiplas tabelas (UNION)
  - [ ] Ordena por data desc
  - [ ] Suporta tipos: consultation, prescription, exam, report, physio, procedure

- [ ] `routers/patients.py` (modificar)
  - [ ] GET /patients/{id}/timeline (novo)

- [ ] Otimizações
  - [ ] Índices de performance
  - [ ] Cache Redis (60 segundos)
  - [ ] Lazy loading de details

### 6.2 Frontend
- [ ] `components/PatientTimeline.tsx` (melhorar)
  - [ ] Cards por evento com ícone + tipo
  - [ ] Expand/collapse details
  - [ ] Infinite scroll ou pagination
  - [ ] Filtro por tipo

### 6.3 Testes
- [ ] `tests/test_timeline.py`
  - [ ] test_timeline_50_items
  - [ ] test_timeline_with_filters
  - [ ] test_timeline_pagination
  - [ ] test_timeline_performance (< 100ms)

- [ ] `e2e/timeline.cy.ts`
  - [ ] Usuário vê timeline
  - [ ] Clica em item → expande details
  - [ ] Filtra por tipo
  - [ ] Scroll carrega mais

---

## FASE 7: SEGURANÇA & PERFORMANCE (5 dias)

### 7.1 Criptografia
- [ ] Setup ENCRYPTION_KEY em .env
- [ ] `services/encryption.py`
  - [ ] `encrypt_field()`, `decrypt_field()`

- [ ] Aplicar em campos sensíveis:
  - [ ] patients.cpf
  - [ ] patients.rg
  - [ ] patients.emergency_phone (optional)

- [ ] Testes: Criptografia/Descriptografia funciona

### 7.2 Rate Limiting
- [ ] slowapi configurado em todos endpoints críticos
- [ ] Testes de rate limit: requisição 101ª retorna 429

### 7.3 Performance Tuning
- [ ] Query profiling
  - [ ] /medications/search < 100ms
  - [ ] /diagnoses/search < 100ms
  - [ ] /patients/{id}/timeline < 200ms (50 items)

- [ ] Load testing
  - [ ] Apache JMeter ou K6
  - [ ] Simular 100 usuários simultâneos
  - [ ] Identificar gargalos

### 7.4 CORS & Headers
- [ ] Verificar CORS configurado corretamente
- [ ] Security headers (CSP, HSTS, X-Frame-Options)

### 7.5 Testes
- [ ] `tests/test_security.py`
- [ ] `tests/performance/test_load.py`

---

## FASE 8: TESTES COMPLETOS (3 dias)

### 8.1 Cobertura Mínima
- [ ] Backend: 80%+ coverage
  - [ ] pytest --cov=routers --cov=services --cov=models

- [ ] Frontend: 70%+ coverage
  - [ ] jest --coverage

- [ ] E2E: 90%+ críticos
  - [ ] cypress run

### 8.2 Testes por Tipo

#### Unitários (Backend)
- [ ] Validadores
- [ ] Serviços de negócio
- [ ] Modelos

#### Unitários (Frontend)
- [ ] Components (Jest)
- [ ] Hooks
- [ ] Utilities

#### Integração
- [ ] Prescrição completa (create → validate → sign → send)
- [ ] Anamnese (create link → patient fills → doctor sees)
- [ ] Interações medicação

#### E2E
- [ ] Prescrição com validação
- [ ] Alerta de alergia
- [ ] Timeline
- [ ] WhatsApp send

### 8.3 Testes de Regressão
- [ ] Agendamento funciona (existente)
- [ ] WhatsApp lembrete funciona (existente)
- [ ] Consulta salva corretamente (existente)

---

## FASE 9: DOCUMENTAÇÃO (2 dias)

### 9.1 API Documentation
- [ ] Atualizar /docs (OpenAPI)
- [ ] Criar ENDPOINTS.md com exemplos de curl

### 9.2 Código
- [ ] Docstrings em todos funções
- [ ] README.md atualizado
- [ ] TECHNICAL_IMPROVEMENTS.md (este arquivo)
- [ ] SCHEMA_AND_ENDPOINTS.md (este arquivo)

### 9.3 Deployment
- [ ] Criar guia de migration para produção
- [ ] Backup strategy documentado
- [ ] Rollback procedure documentado

---

## FASE 10: DEPLOYMENT (2 dias)

### 10.1 Staging
- [ ] Deploy em staging (Render)
- [ ] Testar migrações BD
- [ ] Testar todos endpoints
- [ ] Smoke tests E2E

### 10.2 Produção
- [ ] Backup BD antes de migrations
- [ ] Deploy backend (Render)
- [ ] Deploy frontend (Vercel)
- [ ] Verificar:
  - [ ] Health check passa
  - [ ] /docs acessível
  - [ ] /health retorna 200
  - [ ] Medicamentos buscáveis
  - [ ] Prescrições validáveis
  - [ ] Timeline carrega

### 10.3 Monitoramento
- [ ] Logs agregados (Sentry ou similar)
- [ ] Performance monitoring
- [ ] Erro rate alertas

---

## RESUMO TOTALIZADOR

| Fase | Tarefa | Dias | Dev | Status |
|------|--------|------|-----|--------|
| 0 | Setup | 1 | 1 | Aguardando |
| 1 | BD | 5 | 1 | Aguardando |
| 2 | Backend: Meds | 7 | 1 | Aguardando |
| 3 | Frontend: Core | 7 | 1 | Aguardando |
| 4 | Integrações | 5 | 1 | Aguardando |
| 5 | Anamnese/Proc | 5 | 1 | Aguardando |
| 6 | Timeline | 5 | 1 | Aguardando |
| 7 | Segurança | 5 | 1 | Aguardando |
| 8 | Testes | 3 | 1 | Aguardando |
| 9 | Docs | 2 | 1 | Aguardando |
| 10 | Deploy | 2 | 1 | Aguardando |
| **TOTAL** | **-** | **48** | **1** | **-** |

**Com 2 desenvolvedores:** ~24 dias (~5 semanas)  
**Com 1 desenvolvedor:** ~48 dias (~10 semanas)

---

## QUICK WINS (Ganhos Rápidos - 1-2 semanas)

Se quiser impacto rápido, comece por:

1. **Semana 1:**
   - [ ] BD: medications + diagnosis_codes (seeds)
   - [ ] API: GET /medications/search
   - [ ] Frontend: MedicationSelector com autocomplete
   - **Impacto:** Doctor consegue buscar medicamentos facilmente

2. **Semana 2:**
   - [ ] API: POST /prescriptions/validate com alertas
   - [ ] Frontend: PrescriptionValidator visual
   - [ ] Testes E2E: validação de alergia
   - **Impacto:** Prescrições mais seguras, menos erros

**ROI:** 2 semanas → valor mensurável (segurança + UX)

---

## Próximos Passos

1. **Aprovação:** Review deste documento com stakeholder
2. **Priorização:** Validar se ordem/scope está correto
3. **Setup:** Realizar FASE 0
4. **Sprint 1:** Começar FASE 1 (BD) + FASE 2 (Backend)
5. **Sprint 2:** FASE 3 (Frontend) + FASE 4 (Integrações)
6. **Sprint 3:** FASE 5-6 + Testes
7. **Sprint 4:** Staging + Produção

---

**Preparado por:** Software Architect  
**Para:** OrthoClinic Team  
**Qualidade:** Pronto para desenvolvimento

