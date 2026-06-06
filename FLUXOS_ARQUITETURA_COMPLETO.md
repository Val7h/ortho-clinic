# Diagramas de Fluxo - Sistema OrthoClinic

Documentação técnica de 3 fluxos principais do sistema: Chamada de Paciente, Assinatura Digital e Anamnese.

---

## 🎯 FLUXO 1: Chamada de Paciente (Real-time)

### Visão Geral

Sistema em tempo real que permite ao médico chamar o próximo paciente da fila, exibindo seu nome na TV da sala de espera e atualizando o dashboard administrativo instantaneamente.

### Sequência Detalhada

```
┌─────────────────────────────────────────────────────────────────┐
│ Etapa 1: Clique do Médico → Frontend                             │
└─────────────────────────────────────────────────────────────────┘
   ↓ < 0.1s
┌─────────────────────────────────────────────────────────────────┐
│ Etapa 2: Requisição HTTP POST /clinic/queue/call                │
│   - Patient ID: 123                                             │
│   - Room: Sala A                                                │
│   - Doctor ID: 5                                                │
└─────────────────────────────────────────────────────────────────┘
   ↓ < 0.2s
┌─────────────────────────────────────────────────────────────────┐
│ Etapa 3: Backend Valida e Atualiza BD                            │
│   1. Valida agendamento (appointment_id existe?)                │
│   2. Valida paciente (patient_id ativo?)                        │
│   3. UPDATE clinic_queue SET status='called'                    │
│   4. Registra called_at timestamp                               │
└─────────────────────────────────────────────────────────────────┘
   ↓ < 0.3s
┌─────────────────────────────────────────────────────────────────┐
│ Etapa 4: WebSocket Broadcast                                     │
│   - Evento: "patient_called"                                    │
│   - Destinatários: Todos clientes conectados                    │
│   - Payload: { patient_name, room, time }                       │
└─────────────────────────────────────────────────────────────────┘
   ↓ < 0.5s
┌─────────────────────────────────────────────────────────────────┐
│ Etapa 5: TV Atualiza e Admin Vê Dashboard                        │
│   - TV: Exibe nome do paciente em grande                        │
│   - Admin: Fila atualiza automaticamente                        │
│   - Status visual: Paciente sai de "Aguardando" → "Chamado"    │
└─────────────────────────────────────────────────────────────────┘
```

### Latências Críticas

| Etapa | Alvo | Descrição |
|-------|------|-----------|
| Clique → API | < 100ms | Resposta do click event no frontend |
| Validação BD | < 200ms | Query de agendamento + update status |
| WebSocket broadcast | < 300ms | Envia para todos clientes conectados |
| Dashboard atualiza | < 500ms | Recebe websocket + renderiza novo estado |
| **Total** | **< 1s** | Experiência de usuário real-time |

### Endpoints Envolvidos

```
POST /clinic/queue/call
├── Request body:
│   ├── appointment_id: int
│   ├── patient_id: int
│   ├── room: str
│   └── doctor_id: int
│
├── Response 200 OK:
│   ├── queue_id: int
│   ├── status: "called"
│   ├── called_at: timestamp
│   └── patient_name: str
│
└── WebSocket event: "patient_called"
    ├── clinic_id: int
    ├── patient_name: str
    ├── room: str
    └── called_at: timestamp
```

### Pontos Críticos

1. **Race Condition (Crítico)**
   - Múltiplos médicos podem clicar simultaneamente
   - Solução: Usar transação BD com LOCK
   - Apenas 1 médico sucede, outros recebem erro "Paciente já foi chamado"

2. **WebSocket Reliability (Crítico)**
   - Clientes desconectados não recebem mensagem
   - Solução: Fallback com polling a cada 5s
   - Message queue opcional: Redis pub/sub para escalar

3. **Banda de Conexão (TV)**
   - TV em rede pode ter latência
   - Solução: Enviar evento + cache local (não recarrega página inteira)

4. **Sincronização BD (Crítico)**
   - Status deve estar 100% correto em todos os clientes
   - Solução: Backend é fonte da verdade, frontend honra estado

### Estrutura de Dados

```sql
CREATE TABLE clinic_queue (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL,
    appointment_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    room VARCHAR(50),
    called_at TIMESTAMP,          -- Quando foi chamado
    called_by_user_id INTEGER,    -- Qual médico chamou
    status VARCHAR(20) DEFAULT 'pending',
        -- pending (na fila) | called (chamado) | 
        -- arrived (chegou) | in_consultation (consultando) | 
        -- completed (finalizado)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (clinic_id) REFERENCES clinics(id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (called_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_clinic_queue_clinic_called 
    ON clinic_queue(clinic_id, called_at DESC);
CREATE INDEX idx_clinic_queue_status 
    ON clinic_queue(status);
```

---

## 🔐 FLUXO 2: Assinatura Digital (ClickSign)

### Visão Geral

Fluxo completo de assinatura digital de receitas médicas conforme CFM 2.299/21 e Lei 14.065/2020, utilizando certificado ICP-Brasil (ClickSign).

### Sequência Detalhada

```
FASE 1: VALIDAÇÃO E GERAÇÃO PDF
┌──────────────────────────────────────────────────────┐
│ Frontend: Médico clica "Assinar Receita"              │
│   - Validação local (todos campos preenchidos?)      │
│   - Exibe modal com resumo da receita                │
└──────────────────────────────────────────────────────┘
   ↓ < 0.2s
┌──────────────────────────────────────────────────────┐
│ Backend: POST /prescriptions/{id}/sign                │
│   1. Valida prescrição novamente                     │
│   2. Gera PDF com ReportLab + QR Code               │
│   3. Calcula hash SHA-256 do PDF                    │
│   4. Armazena em /storage/prescriptions/             │
└──────────────────────────────────────────────────────┘
   ↓ < 1-2s
┌──────────────────────────────────────────────────────┐
│ ClickSign API: Upload Documento                       │
│   1. POST /documents com PDF                         │
│   2. ClickSign retorna document_id + sign_url        │
│   3. Backend armazena doc_id em prescription_signatures
└──────────────────────────────────────────────────────┘
   ↓ < 0.5s
┌──────────────────────────────────────────────────────┐
│ Frontend: Abre Popup de Assinatura                    │
│   - window.open(sign_url) → portal ClickSign         │
│   - Médico acessa com CPF + Senha                    │
└──────────────────────────────────────────────────────┘

FASE 2: ASSINATURA E CONFIRMAÇÃO
┌──────────────────────────────────────────────────────┐
│ ClickSign: Médico Assina                              │
│   1. Portal exibe documento                          │
│   2. Médico clica "Assinar"                          │
│   3. Valida com certificado digital                  │
│   4. Aplica assinatura criptográfica                 │
│   - Tempo: ~30-40 segundos (humano)                  │
└──────────────────────────────────────────────────────┘
   ↓ < 1s
┌──────────────────────────────────────────────────────┐
│ ClickSign: POST Webhook → Backend                     │
│   - Evento: "document_signed"                        │
│   - Payload: { document_id, signed_at, signature_proof }
│   - Backend valida webhook signature                 │
└──────────────────────────────────────────────────────┘
   ↓ < 2s
┌──────────────────────────────────────────────────────┐
│ Backend: Salva Comprovante e Envia WhatsApp           │
│   1. UPDATE prescription_signatures SET status='signed'
│   2. Download PDF assinado de ClickSign             │
│   3. Envia via WhatsApp API ao paciente              │
│   - Anexos: PDF + comprovante de assinatura         │
└──────────────────────────────────────────────────────┘
   ↓ < 1s
┌──────────────────────────────────────────────────────┐
│ Frontend: Exibe Sucesso                               │
│   - Botão "Baixar PDF" habilitado                    │
│   - Botão "Enviar via WhatsApp" habilitado           │
│   - Timestamp de assinatura exibido                  │
└──────────────────────────────────────────────────────┘
```

### Timeline Completa

| Etapa | Tempo | Ator | Descrição |
|-------|-------|------|-----------|
| 1 | 0s | Frontend | Clique "Assinar" |
| 2 | 1-2s | Backend | Gera PDF com QR |
| 3 | 2-3s | ClickSign | Document upload pronto |
| 4 | 30-40s | Médico | Assina no portal (humano) |
| 5 | 31-42s | Webhook | ClickSign notifica backend |
| 6 | 32-44s | WhatsApp | PDF enviado ao paciente |
| **Total** | **~35-60s** | **Sistema** | **Completo** |

### Endpoints Envolvidos

```
POST /prescriptions/{id}/sign
├── Request: { prescription_id, doctor_id }
├── Response: { sign_url, document_id }
└── Inicia fluxo de assinatura

GET /prescriptions/{id}/signature-status
├── Polling a cada 5 segundos
├── Response: { status: 'pending|signed|failed' }
└── Frontend espera transição para 'signed'

POST /webhook/clicksign (ClickSign → Backend)
├── Body: { document_id, status, signed_at, signature_proof }
├── Validação: HMAC SHA-256 com secret ClickSign
└── Atomicamente atualiza BD

GET /prescriptions/{id}/pdf
├── Download PDF assinado
└── Response: arquivo PDF binary
```

### Conformidade CFM 2.299/21

✅ **Checklist de Conformidade:**
- [x] Certificado digital ICP-Brasil (ClickSign)
- [x] Assinatura criptográfica (RSA-2048)
- [x] QR Code com link de validação
- [x] Timestamp certificado
- [x] Hash digital do documento
- [x] Proof de assinatura armazenado
- [x] Integridade do documento garantida
- [x] Disponível para auditoria

### Estrutura de Dados

```sql
CREATE TABLE prescriptions (
    id INTEGER PRIMARY KEY,
    doctor_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    specialty VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'draft',
        -- draft | pending_signature | signed | cancelled
    -- ... outros campos de prescrição
    FOREIGN KEY (doctor_id) REFERENCES users(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE prescription_signatures (
    id INTEGER PRIMARY KEY,
    prescription_id INTEGER NOT NULL,
    clicksign_doc_id VARCHAR(255),           -- ID do ClickSign
    signed_at TIMESTAMP,                      -- Timestamp assinatura
    signature_proof JSON,                     -- {
        -- "signer_name": "Dr. João Silva",
        -- "timestamp": "2026-06-06T10:05:30Z",
        -- "doc_hash": "sha256:abc123...",
        -- "cert_issuer": "ICP-Brasil",
        -- "validations_url": "https://app.clicksign.com/..."
    -- }
    status VARCHAR(20) DEFAULT 'pending',    -- pending | signed | failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id),
    UNIQUE(prescription_id)  -- Uma assinatura por receita
);

CREATE INDEX idx_prescription_signatures_status 
    ON prescription_signatures(status);
```

### Pontos Críticos

1. **Segurança do Webhook (Crítico)**
   - Validar HMAC SHA-256 da requisição ClickSign
   - Rejeitar requests não autenticadas
   - Rejeitar duplicatas (idempotência)

2. **QR Code Validação**
   - QR Code contém: prescrição_id + hash do PDF
   - Link público: `/api/prescriptions/validate/{id}`
   - Qualquer pessoa pode validar (sem auth requerida)

3. **Conformidade com Lei 14.065**
   - Prescrição digital = prescrição original
   - Não requer assinatura em papel
   - Válida para farmácias registradas

4. **Falha na Assinatura**
   - Se médico não assina em 24h: expirar
   - Permitir nova tentativa
   - Armazenar motivo de falha em BD

---

## 📋 FLUXO 3: Anamnese (Primeira Consulta)

### Visão Geral

Sistema completo de coleta de histórico clínico (anamnese) estruturado em 5 abas, com auto-save, validação em tempo real e possibilidade de assinatura digital.

### Tipos de Anamnese

#### 1. **Primeira Consulta** (5 Abas Completas)
Anamnese detalhada e estruturada para novo paciente.

#### 2. **Retorno** (Follow-up)
Anamnese simplificada para acompanhamento de paciente existente.

### Sequência Detalhada - Primeira Consulta

```
FASE 1: SELEÇÃO
┌──────────────────────────────────────────────────────┐
│ Frontend: Paciente escolhe "Primeira Consulta"        │
│   - Radio button com cards coloridos                  │
│   - Descrição do que será preenchido                  │
│   - Tempo estimado: 10-15 minutos                     │
└──────────────────────────────────────────────────────┘
   ↓ < 0.1s
┌──────────────────────────────────────────────────────┐
│ Backend: Cria registro vazio em patient_anamnesis     │
│   - INSERT INTO patient_anamnesis                     │
│   - Status: 'in_progress'                            │
│   - Retorna anamnesis_id para continuidade             │
└──────────────────────────────────────────────────────┘

FASE 2: ABA 1 - QUEIXA PRINCIPAL 🔴
┌──────────────────────────────────────────────────────┐
│ Campos:                                               │
│   • Motivo da consulta (textarea, obrigatório)        │
│   • Localização da dor:                              │
│       - Ombro, Cotovelo, Punho                       │
│       - Coluna (Cervical/Torácica/Lombar)            │
│       - Quadril, Joelho, Tornozelo                   │
│   • Há quanto tempo (data ou "meses/anos")           │
│   • Intensidade de dor (slider 0-10 com cores):      │
│       0-2: Verde (suportável)                        │
│       3-6: Amarelo (moderado)                        │
│       7-10: Vermelho (severo)                        │
│   • O que piora? (textarea)                          │
│   • O que melhora? (textarea)                        │
│                                                      │
│ Auto-save: A cada 2 segundos (sem perder dados)     │
│ Indicador: ✓ Salvo + timestamp                       │
└──────────────────────────────────────────────────────┘
   ↓ (paciente clica próxima aba)
┌──────────────────────────────────────────────────────┐
│ Validação:                                            │
│   ✓ Motivo é obrigatório?                           │
│   ✓ Localização foi selecionada?                     │
│   ✓ Intensidade preenchida?                          │
│ Se OK: Habilita próxima aba                         │
│ Se NOT: Marca campos em vermelho, impede avanço     │
└──────────────────────────────────────────────────────┘

FASE 3: ABA 2 - HISTÓRICO 📜
┌──────────────────────────────────────────────────────┐
│ Campos:                                               │
│   • Traumas anteriores (textarea)                     │
│   • Cirurgias anteriores (lista com datas)           │
│   • Fisioterapia anterior (sim/não + detalhes)       │
│   • Outros tratamentos (textarea)                     │
│   • Medicações atuais (MedicationSelector):          │
│       - Cada medicação mostra interações             │
│       - Alertas se conflita com ortopedia            │
│   • Alergias a medicações (textarea, obrigatório)    │
│   • Comorbidades (checkboxes):                       │
│       - Diabetes, Hipertensão, Osteoporose, etc.    │
│                                                      │
│ Auto-save: A cada campo                              │
│ Validação: Alertas de interações medicamentosas     │
└──────────────────────────────────────────────────────┘

FASE 4: ABA 3 - HÁBITOS & RISCO ⚠️
┌──────────────────────────────────────────────────────┐
│ Campos:                                               │
│   • Profissão (texto)                                │
│   • Atividades físicas/esportes (lista)              │
│   • Nível de sedentarismo (slider 1-10):            │
│       1-3: Ativo demais                             │
│       4-6: Moderado                                 │
│       7-10: Sedentário                              │
│   • Tabagismo (sim/não + quantidade/dia)            │
│   • Consumo de álcool:                              │
│       - Não / Ocasional / Regular / Frequente       │
│   • Qualidade do sono:                              │
│       - Boa / Regular / Ruim (com observações)      │
│                                                      │
│ Aviso: Se sedentário + dor = destaque em laranja   │
└──────────────────────────────────────────────────────┘

FASE 5: ABA 4 - EXAME FÍSICO 🔍
┌──────────────────────────────────────────────────────┐
│ Campos (dependem da localização da dor):             │
│   • Amplitude de movimento (ranges em graus)        │
│   • Testes específicos (checkboxes):                 │
│       - Para Ombro: Neer, Speed, Sulcus sign        │
│       - Para Joelho: Lachman, ACL, McMurray        │
│       - Para Coluna: Lasègue, Bragard               │
│   • Presença de inflamação (sim/não)               │
│   • Deformidades/assimetrias (texto)               │
│   • Palpação (quais pontos doem - diagrama)        │
│                                                      │
│ Preenchimento: Pode ser feito pelo médico durante  │
│ ou após exame físico                               │
└──────────────────────────────────────────────────────┘

FASE 6: ABA 5 - RESUMO & ASSINATURA ✅
┌──────────────────────────────────────────────────────┐
│ Conteúdo:                                             │
│   1. Cards coloridos resumindo cada seção            │
│   2. Barra de progresso (% de campos preenchidos)    │
│   3. Lista de campos obrigatórios vazios (se houver) │
│   4. Botão "Salvar Anamnese"                         │
│   5. Botão "Assinar com ClickSign"                   │
│                                                      │
│ Layout:                                              │
│   [Card: Queixa Principal] [Card: Histórico]        │
│   [Card: Hábitos]          [Card: Exame Físico]     │
│   [Barra de Progresso: 95%]                         │
│   [Botão Salvar] [Botão Assinar]                    │
└──────────────────────────────────────────────────────┘
   ↓ Clique "Salvar"
┌──────────────────────────────────────────────────────┐
│ Backend: Validação Final                              │
│   1. Verifica campos obrigatórios                    │
│   2. Valida consistência de dados                    │
│   3. Calcula pontuação de risco                      │
│   4. Gera PDF da anamnese                           │
│   5. INSERT final na BD com status='completed'       │
└──────────────────────────────────────────────────────┘
   ↓ < 1s
┌──────────────────────────────────────────────────────┐
│ Frontend: Exibe Sucesso                              │
│   - Toast: "Anamnese salva com sucesso!"             │
│   - Habilita botão "Assinar com ClickSign"           │
│   - Habilita botão "Baixar PDF"                      │
└──────────────────────────────────────────────────────┘
   ↓ (opcional) Clique "Assinar"
┌──────────────────────────────────────────────────────┐
│ Fluxo idêntico a Assinatura Digital (ClickSign)      │
│   - Gera PDF com dados da anamnese                   │
│   - Abre modal assinatura                           │
│   - Paciente assina no ClickSign                     │
│   - Webhook salva comprovante                        │
└──────────────────────────────────────────────────────┘
```

### Auto-save Detalhado

```javascript
// Frontend Logic
const [changes, setChanges] = useState({});

useEffect(() => {
  if (Object.keys(changes).length === 0) return;
  
  const timer = setTimeout(() => {
    api.post(`/anamnesys/${anamnesisId}/auto-save`, changes)
      .then(() => setHasUnsavedChanges(false))
      .catch(err => showErrorNotification());
    setChanges({});
  }, 2000); // Auto-save a cada 2 segundos de inatividade
  
  return () => clearTimeout(timer);
}, [changes]);
```

**Indicador Visual:**
- ⏳ Salvando... (cinza)
- ✓ Salvo em 2026-06-06 10:15:30 (verde)
- ⚠️ Erro ao salvar (vermelho)

### Estrutura de Dados

```sql
CREATE TABLE patient_anamnesis (
    id INTEGER PRIMARY KEY,
    clinic_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    anamnesis_type VARCHAR(20) NOT NULL,
        -- 'first_consultation' | 'follow_up'
    consultation_date DATE,
    
    -- Dados estruturados em JSON por aba
    data_chief_complaint JSON,     -- Aba 1: Queixa principal
    data_history JSON,             -- Aba 2: Histórico
    data_habits JSON,              -- Aba 3: Hábitos & risco
    data_physical_exam JSON,       -- Aba 4: Exame físico
    
    -- Metadados
    created_by_user_id INTEGER,    -- Quem criou
    last_edited_by_user_id INTEGER,-- Quem editou por último
    status VARCHAR(20) DEFAULT 'in_progress',
        -- 'in_progress' | 'completed' | 'signed'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,        -- Quando foi finalizada
    
    FOREIGN KEY (clinic_id) REFERENCES clinics(id),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    FOREIGN KEY (last_edited_by_user_id) REFERENCES users(id)
);

-- Exemplo de data_chief_complaint JSON:
{
    "chief_complaint": "Dor no ombro direito há 3 semanas",
    "location": "shoulder",
    "duration_value": 3,
    "duration_unit": "weeks",
    "intensity": 7,
    "intensity_label": "severe",
    "aggravating_factors": "Elevar braço, dormindo sobre o lado",
    "relieving_factors": "Repouso, gelo",
    "color_code": "red"  // Visual para 7-10
}

-- Exemplo de data_habits JSON:
{
    "profession": "Programador",
    "sports": ["Natação 2x/semana"],
    "sedentariness_level": 6,
    "smoking": false,
    "alcohol_consumption": "occasional",
    "sleep_quality": "regular",
    "risk_score": 5  // Calculado automaticamente
}
```

### Validação em Tempo Real

| Campo | Validação | Mensagem de Erro |
|-------|-----------|------------------|
| Motivo da consulta | Obrigatório, min 10 caracteres | "Descreva melhor o motivo" |
| Localização | Mínimo 1 selecionado | "Selecione uma localização" |
| Intensidade | 0-10, numérico | "Valor entre 0 e 10" |
| Alergias | Obrigatório (pode ser "Nenhuma") | "Informe alergias" |
| Medicações | Verificar interações | "Conflito: medicação X com Y" |
| Sedentarismo | 1-10, slider | Automático |
| Dor + Sedentário | Warning se ambos elevados | "Atenção: padrão de risco" |

### Fluxo Follow-up (Retorno)

Para pacientes já consultados, fluxo simplificado:

```
Campos:
├── Evolução desde última consulta (textarea)
├── Intensidade de dor antes vs depois (comparação visual)
├── Adesão ao tratamento (Excelente/Boa/Regular/Fraca)
├── Resposta ao tratamento (sim/não + detalhes)
├── Novos sintomas (sim/não + lista)
├── Limitações atuais (textarea)
├── Próximos passos recomendados (texto)
└── Resumo automático com indicadores de progresso

Timeline visual mostrando:
- Dor inicial: 8/10
- Dor atual: 5/10
- Melhora: 37.5% (com indicador verde)
```

### Pontos Críticos

1. **Completude de Dados (Crítico)**
   - Campos obrigatórios não podem estar vazios
   - Bloqueia envio até 100% preenchimento
   - Exibir checklist visual

2. **Consistência de Medicações**
   - Alertar sobre interações medicamentosas
   - Validar contra base de dados de medicamentos
   - Sugestão automática de alternativas

3. **Auto-save Confiável**
   - Recuperação automática se browser fecha
   - Modo offline: salva local storage
   - Sincroniza quando online

4. **Segurança de Dados Médicos**
   - HIPAA compliant (se em US)
   - LGPD compliant (se em Brasil)
   - Criptografia em trânsito e em repouso

---

## 📊 RESUMO COMPARATIVO

| Aspecto | Chamada | Assinatura | Anamnese |
|---------|---------|-----------|----------|
| **Duração** | < 1s | 30-60s | 5-20 min (usuário) |
| **Atores** | Frontend + API + DB | Frontend + API + ClickSign | Frontend + API + DB |
| **Crítico em** | Latência real-time | Conformidade legal | Completude de dados |
| **WebSocket** | Sim (broadcast) | Não (polling) | Não (auto-save) |
| **Integração Externa** | Não | ClickSign | Não |
| **Complexidade** | Média | Alta | Alta |
| **Escalabilidade** | OK (índices DB) | OK (async jobs) | OK (pagination) |

---

## 🔧 Checklist de Implementação

### ✅ Chamada de Paciente
- [x] Tabela clinic_queue criada
- [x] Indices de performance aplicados
- [x] Endpoint POST /clinic/queue/call implementado
- [x] WebSocket configurado (eventos de broadcast)
- [x] Validações de agendamento
- [x] Recuperação de erros (retry logic)
- [x] Testes de carga (concurrent calls)

### ✅ Assinatura Digital
- [x] Integração ClickSign (API keys configuradas)
- [x] Geração de PDF com ReportLab
- [x] QR Code para validação
- [x] Endpoint POST /prescriptions/{id}/sign
- [x] Webhook receiver para ClickSign
- [x] Validação HMAC de webhook
- [x] Integração WhatsApp para envio
- [x] Conformidade CFM 2.299/21

### ✅ Anamnese
- [x] Tabela patient_anamnesis criada
- [x] 5 abas implementadas
- [x] Auto-save a cada 2s
- [x] Validação em tempo real
- [x] Barra de progresso
- [x] Geração de PDF
- [x] Integração ClickSign para assinatura
- [x] Fluxo de Follow-up

---

## 🚀 Performance Targets

| Métrica | Target | Status |
|---------|--------|--------|
| Latência chamada de paciente | < 1s | ✅ |
| Tempo de geração de PDF | < 2s | ✅ |
| Tempo de upload ClickSign | < 2s | ✅ |
| Auto-save latência | < 0.5s | ✅ |
| Barra de progresso update | < 0.1s | ✅ |
| WebSocket broadcast | < 300ms | ✅ |
| Dashboard refresh | < 500ms | ✅ |

---

**Documentação criada: Junho 2026**  
**Versão: 1.0**  
**Última atualização: 2026-06-06**
