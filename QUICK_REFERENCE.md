# OrthoClinic - Quick Reference Guide

**Última atualização:** 2026-06-05

---

## 📋 TABELAS NOVAS (7)

```
medications
├─ anvisa_id (unique)
├─ name (indexed)
├─ interactions (JSON)
├─ prescription_type (branca/azul/vermelha)
└─ controlled_schedule (Anexo I/II/III)

diagnosis_codes
├─ cid10 (unique, indexed)
├─ description_pt
├─ category (indexed)
└─ is_common (indexed)

anamnesis_templates
├─ name (unique per org)
├─ category
├─ fields (JSONB)
└─ is_active (indexed)

procedures_catalog
├─ name
├─ code (TUSS)
├─ cid10_codes (JSONB)
└─ leaflet_id

patient_allergies (melhorada)
├─ medication_id (FK)
├─ allergen_description
├─ severity (leve/moderada/grave)
└─ alert_active (indexed)

prescription_audits (NEW)
├─ prescription_id (FK)
├─ action (created/signed/sent/cancelled)
├─ user_id (FK)
├─ ip_address
└─ timestamp (indexed)

prescription_whatsapp_logs (NEW)
├─ prescription_id (FK)
├─ phone_number
├─ status (pending/sent/delivered/read/failed)
└─ sent_at (indexed)
```

---

## 🔌 ENDPOINTS NOVOS (13)

### Medicamentos
| Verbo | Path | Rate Limit | Cache |
|-------|------|-----------|-------|
| GET | `/medications/search?q=...` | 1000/h | 30d |
| GET | `/medications/{id}` | ∞ | 30d |
| GET | `/medications/{id}/interactions?patient_id=...` | ∞ | 30d |
| POST | `/medications/sync-anvisa` | 1/h | - |

### Diagnósticos
| Verbo | Path | Rate Limit | Cache |
|-------|------|-----------|-------|
| GET | `/diagnoses/search?q=...` | 1000/h | 30d |

### Validação
| Verbo | Path | Rate Limit | Cache |
|-------|------|-----------|-------|
| POST | `/prescriptions/validate` | 100/h | - |
| POST | `/prescriptions/{id}/send-whatsapp` | 100/h | - |
| GET | `/prescriptions/{id}/whatsapp-status` | ∞ | 1m |

### Templates
| Verbo | Path | Rate Limit | Cache |
|-------|------|-----------|-------|
| GET | `/anamnesis/templates` | ∞ | 7d |
| GET | `/anamnesis/templates/{id}` | ∞ | 7d |
| POST | `/anamnesis/templates` | 10/h | - |

### Timeline
| Verbo | Path | Rate Limit | Cache |
|-------|------|-----------|-------|
| GET | `/patients/{id}/timeline` | ∞ | 60s |

---

## ⚛️ COMPONENTES NOVOS (8)

### Core
```
MedicationSelector.tsx (2-3 dias)
├─ Autocomplete ANVISA
├─ Detecção interação real-time
├─ Alerta alergia
└─ Sugestão dosagem

PatientAlertBadges.tsx (1 dia)
├─ Alergia 🚨 (red)
├─ Controlado ⚠️ (orange)
├─ Expirado ⏰ (yellow)
└─ Followup 📋 (blue)

PrescriptionValidator.tsx (2 dias)
├─ POST /prescriptions/validate
├─ Mostra erros/warnings
├─ Sugestão alternativa
└─ Sobrescrita com justificativa

PatientTimeline.tsx (2-3 dias)
├─ Timeline vertical
├─ Cards expandíveis
├─ Filtro por tipo
└─ Infinite scroll
```

### Auxiliares
```
AnamneseTemplateSelector.tsx (1 dia)
├─ Carrega template
├─ Pré-preenche campos
└─ Paciente completa

ProcedureSelector.tsx (1 dia)
├─ Busca procedimentos
├─ Vincula folheto
└─ Estima duração

SearchAutocomplete.tsx (1 dia, reutilizável)
├─ Genérico <T>
├─ Debounce 300ms
├─ Cache local
└─ Keyboard nav

AlertBadge.tsx (0.5 dia, reutilizável)
├─ Type: allergy/controlled/expired/followup
├─ Severity: critical/major/minor
└─ Customizável
```

---

## 📊 PERFORMANCE TARGETS

| Operação | Target | Com Índice | Com Cache |
|----------|--------|-----------|-----------|
| GET /medications/search | <100ms | <30ms | <10ms |
| GET /diagnoses/search | <100ms | <30ms | <10ms |
| POST /prescriptions/validate | <50ms | <20ms | - |
| GET /patients/{id}/timeline | <200ms | <100ms | <50ms |
| GET /medications/{id}/interactions | <50ms | <20ms | <10ms |

---

## 🛡️ SEGURANÇA

### Validações Backend
```
✓ CPF válido (Módulo 11)
✓ CRM válido (formato)
✓ Receita data não futura
✓ Medicação dosagem vs tipo
✓ Alergia conhecida → ERRO
✓ Interação major → WARNING
✓ Receita controlada → CRM obrigatório
```

### Rate Limiting
```
GET medicamentos:     1000/hora (permissivo, autocomplete)
POST validação:        100/hora (proteção)
POST WhatsApp:         100/hora (custos)
POST templates:         10/hora (admin)
```

### Criptografia
```
CPF:     AES-256 (Fernet)
RG:      AES-256 (Fernet)
Phone:   Opcional
Senha:   bcrypt (existing)
Token:   JWT (existing)
```

### Auditoria
```
prescription_audits:
  - created
  - validated
  - signed
  - sent_whatsapp
  - sent_email
  - cancelled
  
Rastreia: user_id, ip_address, timestamp, action
```

---

## 📈 TIMELINE IMPLEMENTAÇÃO

### SEMANA 1-2: FOUNDATION ⚡
```
Phase: Setup + Core APIs
Time: 40 horas
Dev:  1 person
Deliverable:
  ✓ BD: medications, diagnosis_codes
  ✓ API: /medications/search + validate
  ✓ Frontend: MedicationSelector
  ✓ Tests: alergia, interação, validação
```

### SEMANA 3-4: EXPERIENCE 🎨
```
Phase: UX + Integration
Time: 40 horas
Dev:  1 person
Deliverable:
  ✓ BD: procedures, audit tables
  ✓ Frontend: Timeline, Templates
  ✓ WhatsApp: Envio receitas
  ✓ Cache + Rate Limiting
```

### SEMANA 5-8: POLISH 🔧
```
Phase: Integrações + Testes
Time: 80 horas
Dev:  1-2 pessoas
Deliverable:
  ✓ ANVISA sync automático
  ✓ Email SendGrid
  ✓ Criptografia dados
  ✓ Load testing 1000 usuários
  ✓ E2E tests 90%+ cobertura
```

### SEMANA 9-12: DEPLOY 🚀
```
Phase: Production Ready
Time: 40 horas
Dev:  1-2 pessoas
Deliverable:
  ✓ Testes regressão
  ✓ Documentação completa
  ✓ Deploy staging
  ✓ Deploy produção
```

---

## 🎯 QUICK WINS (1-2 SEMANAS)

### Mínimo Viável (1 semana)
```
BD:
  ✓ medications table (seed 100 drugs)
  ✓ diagnosis_codes table (seed 1000 CID)

API:
  ✓ GET /medications/search
  ✓ GET /diagnoses/search
  ✓ POST /prescriptions/validate

Frontend:
  ✓ MedicationSelector com autocomplete
  ✓ PrescriptionValidator com alertas

Tests:
  ✓ Alergia → validation error
  ✓ Interação → validation warning

Impacto: Doctor consegue prescrever com segurança
```

### Valor Agregado (segunda semana)
```
Adicione:
  ✓ PatientTimeline visual
  ✓ WhatsApp /send-whatsapp
  ✓ PatientAlertBadges
  ✓ Anamnesis templates

Impacto: Sistema profissional + compliance
```

---

## 💾 MIGRAÇÕES BANCO

### Sequência Segura
```
1. Backup produção (obrigatório)
2. Apply migration: medications
3. Apply migration: diagnosis_codes
4. Apply migration: anamnesis_templates
5. Apply migration: procedures_catalog
6. Apply migration: patient_allergies (alter)
7. Apply migration: prescription_audits
8. Apply migration: prescription_whatsapp_logs
9. Apply migration: prescriptions (add columns)
10. Apply migration: anamneses (add columns)
11. Create indices
12. Seed data
13. Testes smoke
14. Rollback test
```

### Rollback (se necessário)
```
Down migration em ordem reversa
Restaurar backup
Verificar integridade
```

---

## 🧪 TESTES CRÍTICOS

### Unitários Backend
```python
✓ validators/test_cpf.py
✓ validators/test_medication_dosage.py
✓ services/test_medications_search.py
✓ services/test_prescription_validation.py
✓ routers/test_medications_api.py
✓ routers/test_diagnoses_api.py
```

### Unitários Frontend
```typescript
✓ MedicationSelector.test.tsx
✓ PatientAlertBadges.test.tsx
✓ PrescriptionValidator.test.tsx
✓ PatientTimeline.test.tsx
```

### Integração
```
✓ Prescription workflow (create → validate → sign → send)
✓ Medication interactions detection
✓ Allergy alert blocking
✓ WhatsApp delivery tracking
```

### E2E (Cypress)
```
✓ Doctor prescribes → validation error (allergy)
✓ Doctor prescribes → validation warning (interaction)
✓ Doctor prescribes → validates → signs → sends WhatsApp
✓ Patient views timeline with 50+ events
✓ Timeline filters by type work
✓ Patient fills anamnesis template
```

---

## 📁 ESTRUTURA ARQUIVOS

```
backend/
├─ models/
│  ├─ medication.py (novo)
│  ├─ diagnosis.py (novo)
│  ├─ procedure.py (novo)
│  └─ [existing]
├─ routers/
│  ├─ medications.py (novo)
│  ├─ diagnoses.py (novo)
│  ├─ prescriptions.py (modificar)
│  ├─ anamnesis.py (modificar)
│  └─ [existing]
├─ services/
│  ├─ medications.py (novo)
│  ├─ prescriptions.py (novo)
│  ├─ timeline.py (novo)
│  ├─ whatsapp_prescriptions.py (novo)
│  └─ [existing]
├─ validators/
│  ├─ medications.py (novo)
│  ├─ prescriptions.py (novo)
│  └─ [existing]
├─ schemas/
│  ├─ medications.py (novo)
│  ├─ diagnoses.py (novo)
│  ├─ procedures.py (novo)
│  └─ [existing]
├─ tests/
│  ├─ test_medications.py (novo)
│  ├─ test_prescriptions_validation.py (novo)
│  ├─ test_diagnoses.py (novo)
│  ├─ test_timeline.py (novo)
│  └─ [existing]
└─ migrations/
   ├─ [timestamp]_create_medications.py
   ├─ [timestamp]_create_diagnosis_codes.py
   ├─ [timestamp]_create_anamnesis_templates.py
   ├─ [timestamp]_create_procedures_catalog.py
   ├─ [timestamp]_alter_patient_allergies.py
   ├─ [timestamp]_create_prescription_audits.py
   ├─ [timestamp]_create_prescription_whatsapp_logs.py
   ├─ [timestamp]_alter_prescriptions.py
   └─ [timestamp]_alter_anamneses.py

frontend/
├─ components/
│  ├─ shared/
│  │  ├─ SearchAutocomplete.tsx (novo)
│  │  └─ AlertBadge.tsx (novo)
│  ├─ MedicationSelector.tsx (novo)
│  ├─ PatientAlertBadges.tsx (novo)
│  ├─ PrescriptionValidator.tsx (novo)
│  ├─ PatientTimeline.tsx (novo)
│  ├─ AnamneseTemplateSelector.tsx (novo)
│  ├─ ProcedureSelector.tsx (novo)
│  └─ [existing]
├─ hooks/
│  ├─ useMedicationSearch.ts (novo)
│  ├─ usePrescriptionValidator.ts (novo)
│  ├─ usePatientAlerts.ts (novo)
│  └─ [existing]
├─ app/
│  └─ [modificações para integrar novos components]
└─ e2e/
   ├─ prescription-flow.cy.ts (novo)
   ├─ allergy-alert.cy.ts (novo)
   ├─ timeline.cy.ts (novo)
   └─ [existing]
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Antes de Mergear PR
- [ ] Testes passam (backend 80%+, frontend 70%+)
- [ ] Linter passa
- [ ] Migration reversível
- [ ] Documentação atualizada

### Antes de Deploy Staging
- [ ] Code review aprovado
- [ ] Load test passou
- [ ] Security review aprovado
- [ ] Backup BD pronto

### Antes de Deploy Produção
- [ ] Staging validado 24h
- [ ] Rollback plan documentado
- [ ] Equipe notificada
- [ ] Monitoramento ativo (Sentry)
- [ ] Performance OK (< 200ms p95)

### Após Deploy
- [ ] /health retorna 200
- [ ] /docs acessível
- [ ] Medicamentos buscáveis
- [ ] Prescrições validáveis
- [ ] WhatsApp envia
- [ ] Monitora erro rate

---

## 📚 DOCUMENTAÇÃO

| Arquivo | Páginas | Conteúdo |
|---------|---------|----------|
| TECHNICAL_IMPROVEMENTS.md | 15 | Análise + propostas |
| SCHEMA_AND_ENDPOINTS.md | 20 | DDL + API spec |
| IMPLEMENTATION_CHECKLIST.md | 30 | Checklist fase a fase |
| TECHNICAL_IMPROVEMENTS_SUMMARY.txt | 5 | Executivo |
| QUICK_REFERENCE.md | 5 | Este arquivo |

**Total: 75 páginas de documentação pronta**

---

## 🤔 DÚVIDAS FREQUENTES

**P: Por onde começo?**
R: MedicationSelector (semana 1). Menor risco, maior impacto.

**P: Quanto tempo leva?**
R: 3 semanas para MVP crítico, 12 semanas para completo.

**P: Precisa downtime?**
R: Não. Migrations são reversíveis, sem lock de tabelas.

**P: Qual custo infraestrutura?**
R: ~$20-30/mês (Redis + storage). Technologies são free.

**P: Posso fazer em fases?**
R: Sim. Phase 1 (semana 1-4) → Phase 2 (semana 5-8) → Phase 3 (semana 9-12).

**P: E se ANVISA mudar formato?**
R: CSV import é flexível. Redesign é 1-2 dias max.

**P: Quem faz código?**
R: 1 dev fullstack (11 semanas) ou 2 devs paralelos (6 semanas).

---

## 📞 CONTATO

**Arquiteto:** Software Architect  
**Data:** 2026-06-05  
**Status:** Pronto para desenvolvimento  
**Documentação:** Completa em `/ortho-clinic/`

---

**Ready to ship! 🚀**

