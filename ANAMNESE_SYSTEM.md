# Sistema Profissional de Anamnese Ortopédica

## Visão Geral

Sistema completo de anamnese (histórico clínico) para consultório ortopédico com TypeScript/React no frontend e FastAPI no backend. Suporta dois tipos de anamnese:

1. **Primeira Consulta** - Anamnese completa e estruturada em 5 abas
2. **Retorno** - Anamnese simplificada para acompanhamento

## Componentes Frontend

### 1. AnamneseTemplateSelector

**Arquivo:** `/frontend/components/AnamneseTemplateSelector.tsx`

- Radio buttons interativos para escolher tipo de anamnese
- Cards coloridos e informativos
- Animações suaves
- Dark mode completo

**Uso:**
```typescript
<AnamneseTemplateSelector
  patientName="João Silva"
  onSelect={(template) => setSelectedTemplate(template)}
/>
```

### 2. AnamneseFirstConsultation

**Arquivo:** `/frontend/components/AnamneseFirstConsultation.tsx`

Anamnese completa com **5 abas navegáveis**:

#### TAB 1: Queixa Principal (🔴)
- Motivo da consulta (textarea obrigatório)
- Localização: Ombro, Cotovelo, Punho, Coluna, Quadril, Joelho, Tornozelo (buttons)
- Duração dos sintomas
- Intensidade de dor: Escala visual 0-10 com cores
- O que piora? (textarea)
- O que melhora? (textarea)

#### TAB 2: Histórico (📜)
- Traumas anteriores
- Cirurgias anteriores
- Fisioterapia anterior
- Outros tratamentos
- **Medicações atuais** (MedicationSelector integrado com alertas de interações)

#### TAB 3: Hábitos e Risco (⚠️)
- Profissão
- Atividades físicas/esportes
- Sedentarismo (slider 1-10)
- Tabagismo (sim/não)
- Consumo de álcool (não/ocasional/regular)
- Qualidade do sono (boa/regular/ruim)

#### TAB 4: Exame Físico (🔍)
- Amplitude de movimento
- Testes específicos (Neer, Speed, etc)
- Presença de inflamação
- Deformidades/assimetrias

#### TAB 5: Resumo (✅)
- Preview colorido de todos dados
- Cards por seção com ícones
- Barra de progresso de preenchimento
- Botão "Salvar Anamnese"

**Uso:**
```typescript
<AnamneseFirstConsultation
  patientId={123}
  patientName="Maria Santos"
  onSave={(data) => console.log(data)}
/>
```

### 3. AnamneseFollowUp

**Arquivo:** `/frontend/components/AnamneseFollowUp.tsx`

Anamnese simplificada para retorno com:

- **Comparação de Dor** (antes/depois com cores e percentual)
- Evolução desde última consulta
- Adesão ao tratamento (botões: Excelente/Boa/Regular/Fraca)
- Resposta ao tratamento
- Novos sintomas aparecidos
- Limitações atuais
- Próximos passos/recomendações
- Observações adicionais
- **Resumo automático** com indicadores

**Uso:**
```typescript
<AnamneseFollowUp
  patientId={123}
  patientName="Maria Santos"
  lastConsultationDate="2025-01-15"
  lastPainIntensity={8}
  onSave={(data) => console.log(data)}
/>
```

## Página Integrada

**Arquivo:** `/frontend/app/anamnese/patient/[id]/page.tsx`

Página completa que integra os 3 componentes com:
- Header com info do paciente
- Seletor de template
- Histórico de anamneses anteriores
- Estados de loading e erro
- Integração com API

## Types TypeScript

**Arquivo:** `/frontend/types/anamnese.ts`

Definições completas de tipos incluindo:
- Interfaces para dados de primeira consulta e retorno
- Enums para status, template type, etc
- Utilidades para cálculos (melhora %, conversão de labels)
- Schema completo para integração com API

## Backend FastAPI

### API Routes

**Arquivo:** `/backend/app/api/routes/anamneses.py`

**Endpoints:**

```bash
# Criar anamnese
POST /api/anamneses
Body: { patient_id, template_type, status, dados }
Response: { id, patient_id, template_type, status, dados, created_at, ... }

# Listar anamneses (com filtros)
GET /api/anamneses?patient_id=123&template_type=first_consultation&status=completed

# Obter anamnese específica
GET /api/anamneses/{id}

# Atualizar anamnese (apenas rascunhos)
PUT /api/anamneses/{id}
Body: { status?, dados? }

# Deletar anamnese (apenas rascunhos)
DELETE /api/anamneses/{id}

# Listar anamneses de um paciente
GET /api/patients/{patient_id}/anamneses

# Assinar anamnese (completed → signed)
POST /api/anamneses/{id}/sign

# Estatísticas
GET /api/stats/patient/{patient_id}
Response: { total, first_consultations, follow_ups, completed, drafts, signed, last_anamnese_date }
```

### Schemas Pydantic

**Arquivo:** `/backend/app/schemas/anamnese.py`

- `AnamneseCreate` - Validação de criação
- `AnamneseUpdate` - Validação de atualização
- `AnamneseResponse` - Response modelo
- `AnamneseStats` - Estatísticas
- Enums para tipos e status

## Database Schema

```sql
CREATE TABLE anamneses (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  template_type VARCHAR(50) NOT NULL 
    CHECK (template_type IN ('first_consultation', 'follow_up')),
  status VARCHAR(50) DEFAULT 'draft' 
    CHECK (status IN ('draft', 'completed', 'signed')),
  dados JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Índices
  CONSTRAINT fk_patient FOREIGN KEY (patient_id) 
    REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX idx_anamneses_patient_id ON anamneses(patient_id);
CREATE INDEX idx_anamneses_template_type ON anamneses(template_type);
CREATE INDEX idx_anamneses_status ON anamneses(status);
CREATE INDEX idx_anamneses_created_at ON anamneses(created_at DESC);
```

## Fluxo de Dados

```
┌─────────────────────────────────────────────┐
│   Página do Paciente (/anamnese/patient/id) │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
    ┌────▼──────────────┐  ┌──────▼─────────────┐
    │ TemplateSelector  │  │ AnamneseHistory   │
    │ (Escolher tipo)   │  │ (Listar anteriores)│
    └────┬──────────────┘  └────────────────────┘
         │
    ┌────▼──────────────────────────┐
    │                               │
    │ Primeira Consulta      Retorno│
    │  (5 Abas)            (Simples)│
    │  ✓ Completa          ✓ Rápida │
    │  ✓ Estruturada       ✓ Comparativa
    │                              │
    └────┬──────────┬──────────────┘
         │          │
    ┌────▼──────────▼──────────┐
    │   onSave(data)           │
    │   POST /api/anamneses    │
    └────┬──────────────────────┘
         │
    ┌────▼──────────────────────┐
    │   FastAPI Backend         │
    │   - Validação Pydantic    │
    │   - Permissões           │
    │   - Salva em DB (JSONB)  │
    └────┬──────────────────────┘
         │
    ┌────▼──────────────────────┐
    │   PostgreSQL JSONB        │
    │   dados completos         │
    └──────────────────────────┘
```

## Recursos Especiais

### 1. Escala de Dor Visual
- 11 botões (0-10) com cores progressivas
- Verde (sem dor) → Vermelho (dor máxima)
- Clicáveis em ambos componentes
- Comparação antes/depois em Follow-up

### 2. MedicationSelector Integrado
- Busca de medicações via API autocomplete
- Detecção de interações medicamentosas
- Alertas de contraindicações (alergias do paciente)
- Posologia e duração customizáveis

### 3. Barra de Progresso
- Calcula automaticamente % de preenchimento
- Atualiza em tempo real conforme preenche
- Mostra no footer do modal

### 4. Validação
- Queixa principal obrigatória em ambas
- Evolução obrigatória em Follow-up
- Toasts de sucesso/erro
- Feedback visual em campos importante

### 5. Dark Mode
- Suporte completo com Tailwind
- Classes `dark:` em todos componentes
- Cores contrastantes e legíveis

### 6. Responsividade
- Grid adapta-se a tablet (md:)
- Modal responsivo
- Abas scrolláveis em mobile

## Exemplo de Integração Completa

```typescript
'use client';
import { useState } from 'react';
import { AnamneseTemplateSelector } from '@/components/AnamneseTemplateSelector';
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';

export default function ConsultaPage() {
  const [template, setTemplate] = useState<'first_consultation' | 'follow_up' | null>(null);
  const patientId = 123;
  const patientName = "João Silva";

  const handleSave = async (data) => {
    const response = await fetch('/api/anamneses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: patientId,
        template_type: template,
        status: 'completed',
        dados: data,
      }),
    });

    if (response.ok) {
      alert('Anamnese salva com sucesso!');
      setTemplate(null);
    }
  };

  return (
    <div>
      {!template ? (
        <AnamneseTemplateSelector
          patientName={patientName}
          onSelect={setTemplate}
        />
      ) : template === 'first_consultation' ? (
        <AnamneseFirstConsultation
          patientId={patientId}
          patientName={patientName}
          onSave={handleSave}
        />
      ) : (
        <AnamneseFollowUp
          patientId={patientId}
          patientName={patientName}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
```

## Estrutura de Arquivos

```
ortho-clinic/
├── frontend/
│   ├── components/
│   │   ├── AnamneseTemplateSelector.tsx
│   │   ├── AnamneseFirstConsultation.tsx
│   │   ├── AnamneseFollowUp.tsx
│   │   ├── MedicationSelector.tsx (existente)
│   │   └── ANAMNESE_USAGE.md
│   ├── app/
│   │   └── anamnese/
│   │       └── patient/
│   │           └── [id]/
│   │               └── page.tsx
│   └── types/
│       └── anamnese.ts
│
└── backend/
    └── app/
        ├── api/
        │   └── routes/
        │       └── anamneses.py
        └── schemas/
            └── anamnese.py
```

## Próximas Melhorias

- [ ] Autosave em localStorage
- [ ] Assinatura digital/eletrônica
- [ ] Upload de imagens/exames
- [ ] Templates customizáveis por especialidade
- [ ] Exportar para PDF
- [ ] Histórico de versões/auditoria
- [ ] Campos personalizados por clínica
- [ ] Relatórios e análises
- [ ] Integração com prontuário eletrônico completo
- [ ] Notificações para não preenchimento
- [ ] Lembretes automáticos de retorno

## Suporte e Documentação

- **Uso Detalhado:** Ver `ANAMNESE_USAGE.md`
- **Types:** Ver `types/anamnese.ts`
- **API:** Ver `routes/anamneses.py`
- **Schemas:** Ver `schemas/anamnese.py`

## Status: Production Ready ✅

- ✅ TypeScript completo
- ✅ Dark mode
- ✅ Validação robusta
- ✅ Tratamento de erros
- ✅ Responsivo
- ✅ Acessível
- ✅ API documentada
- ✅ Pronto para produção
