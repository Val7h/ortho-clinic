# Componentes de Anamnese - Guia de Uso

## Visão Geral

Sistema profissional de anamnese ortopédica com 3 componentes principais:

1. **AnamneseTemplateSelector** - Seleção do tipo de anamnese
2. **AnamneseFirstConsultation** - Anamnese completa para primeira consulta
3. **AnamneseFollowUp** - Anamnese simplificada para retorno

## Instalação e Integração

### 1. Imports Necessários

```typescript
import { AnamneseTemplateSelector } from '@/components/AnamneseTemplateSelector';
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';
```

## Componentes Detalhados

### AnamneseTemplateSelector

**Propósito:** Selector de tipo de anamnese (Primeira Consulta ou Retorno)

**Props:**
```typescript
interface AnamneseTemplateSelectorProps {
  patientName: string;        // Nome do paciente
  onSelect: (templateType: 'first_consultation' | 'follow_up') => void;
}
```

**Exemplo de Uso:**
```typescript
'use client';
import { useState } from 'react';
import { AnamneseTemplateSelector } from '@/components/AnamneseTemplateSelector';
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';

export default function AnamnesePage() {
  const [selectedTemplate, setSelectedTemplate] = useState<'first_consultation' | 'follow_up' | null>(null);

  return (
    <div>
      {!selectedTemplate ? (
        <AnamneseTemplateSelector
          patientName="João Silva"
          onSelect={(template) => setSelectedTemplate(template)}
        />
      ) : selectedTemplate === 'first_consultation' ? (
        <AnamneseFirstConsultation
          patientId={1}
          patientName="João Silva"
          onSave={(data) => {
            console.log('Anamnese salva:', data);
            // Enviar para API
          }}
        />
      ) : (
        <AnamneseFollowUp
          patientId={1}
          patientName="João Silva"
          lastConsultationDate="2025-01-15"
          lastPainIntensity={8}
          onSave={(data) => {
            console.log('Retorno salvo:', data);
            // Enviar para API
          }}
        />
      )}
    </div>
  );
}
```

---

### AnamneseFirstConsultation

**Propósito:** Anamnese completa com 5 abas navegáveis

**Props:**
```typescript
interface AnamneseFirstConsultationProps {
  patientId: number;              // ID do paciente
  patientName: string;            // Nome do paciente
  onSave?: (data: AnamneseFirstConsultationData) => void;
}
```

**Estrutura de Dados Retornada:**
```typescript
interface AnamneseFirstConsultationData {
  template_type: 'first_consultation';
  status: 'draft' | 'completed';
  // TAB 1: Queixa Principal
  chief_complaint: string;
  pain_location: string;
  symptom_duration: string;
  pain_intensity: number;         // 0-10
  aggravating_factors: string;
  relieving_factors: string;
  // TAB 2: Histórico
  previous_traumas: string;
  previous_surgeries: string;
  previous_physiotherapy: string;
  previous_treatments: string;
  current_medications: any[];     // Array de medicações
  // TAB 3: Hábitos e Risco
  profession: string;
  physical_activities: string;
  sedentarism: number;            // 1-10
  smoking: boolean;
  alcohol_consumption: 'none' | 'occasional' | 'regular';
  sleep_quality: 'good' | 'fair' | 'poor';
  // TAB 4: Exame Físico
  range_of_motion: string;
  specific_tests: string;
  inflammation: boolean;
  deformities: string;
  // Metadados
  created_at?: string;
}
```

**Abas Disponíveis:**

#### 1. Queixa Principal (🔴)
- Motivo da consulta (textarea obrigatório)
- Localização da dor (buttons: Ombro, Cotovelo, Punho, Coluna, Quadril, Joelho, Tornozelo)
- Duração dos sintomas
- Intensidade da dor (escala 0-10 com cores)
- O que piora (textarea)
- O que melhora (textarea)

#### 2. Histórico (📜)
- Traumas anteriores (textarea)
- Cirurgias anteriores (textarea)
- Fisioterapia anterior (textarea)
- Outros tratamentos (textarea)
- Medicações atuais (MedicationSelector component)

#### 3. Hábitos e Risco (⚠️)
- Profissão (input)
- Atividades físicas (input)
- Nível de sedentarismo (slider 1-10)
- Tabagismo (sim/não)
- Consumo de álcool (não/ocasional/regular)
- Qualidade do sono (boa/regular/ruim)

#### 4. Exame Físico (🔍)
- Amplitude de movimento (textarea)
- Testes específicos (textarea)
- Presença de inflamação (sim/não)
- Deformidades/assimetrias (textarea)

#### 5. Resumo (✅)
- Preview colorido de todos os dados preenchidos
- Cards por seção
- Barra de progresso de preenchimento (%)
- Botão "Salvar Anamnese"

**Exemplo de Uso:**
```typescript
<AnamneseFirstConsultation
  patientId={123}
  patientName="Maria Santos"
  onSave={async (data) => {
    try {
      const response = await fetch('/api/anamneses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: 123,
          ...data,
        }),
      });
      
      if (response.ok) {
        console.log('Anamnese salva com sucesso');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  }}
/>
```

---

### AnamneseFollowUp

**Propósito:** Anamnese simplificada para retorno do paciente

**Props:**
```typescript
interface AnamneseFollowUpProps {
  patientId: number;
  patientName: string;
  lastConsultationDate?: string;  // Formato: "2025-01-15"
  lastPainIntensity?: number;     // 0-10
  onSave?: (data: AnamneseFollowUpData) => void;
}
```

**Estrutura de Dados Retornada:**
```typescript
interface AnamneseFollowUpData {
  template_type: 'follow_up';
  status: 'draft' | 'completed';
  last_consultation_date?: string;
  pain_intensity_last: number;        // Dor na última consulta
  pain_intensity_current: number;     // Dor agora
  evolution_summary: string;          // Descrição da evolução
  new_symptoms: string;               // Novos sintomas aparecidos
  treatment_adherence: 'excellent' | 'good' | 'fair' | 'poor';
  treatment_response: string;         // Como respondeu ao tratamento
  current_limitations: string;        // Limitações atuais
  next_steps: string;                 // Próximos passos
  additional_observations: string;    // Observações adicionais
  created_at?: string;
}
```

**Componentes:**

1. **Comparação de Dor (📊)**
   - Escala visual antes/depois
   - Cálculo automático de percentual de melhora/piora
   - Indicador de tendência (📈📉➡️)

2. **Evolução desde Última Consulta** (obrigatório)
   - Textarea para descrição detalhada

3. **Adesão ao Tratamento**
   - Buttons: Excelente (100%), Boa (75%), Regular (50%), Fraca (<50%)

4. **Resposta ao Tratamento**
   - Textarea para descrever benefícios

5. **Novos Sintomas**
   - Textarea para novos sintomas ou queixas

6. **Limitações Atuais**
   - Textarea para descrever nível de funcionalidade

7. **Próximos Passos**
   - Textarea para recomendações

8. **Observações Adicionais**
   - Textarea para notas importantes

9. **Resumo da Avaliação**
   - Card com evolução de dor
   - Card com nível de adesão

**Exemplo de Uso:**
```typescript
<AnamneseFollowUp
  patientId={123}
  patientName="Maria Santos"
  lastConsultationDate="2025-01-10"
  lastPainIntensity={8}
  onSave={async (data) => {
    await fetch('/api/anamneses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: 123,
        ...data,
      }),
    });
  }}
/>
```

---

## Integração com Banco de Dados

### Schema PostgreSQL Sugerido

```sql
CREATE TABLE anamneses (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('first_consultation', 'follow_up')),
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'signed')),
  dados JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_anamneses_patient_id ON anamneses(patient_id);
CREATE INDEX idx_anamneses_template_type ON anamneses(template_type);
CREATE INDEX idx_anamneses_status ON anamneses(status);
```

### Exemplo de API FastAPI

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
import json

router = APIRouter(prefix="/api/anamneses", tags=["anamneses"])

class AnamneseCreate(BaseModel):
    patient_id: int
    template_type: str
    status: str = "completed"
    dados: dict

@router.post("")
async def create_anamnese(data: AnamneseCreate, db: Session = Depends(get_db)):
    try:
        anamnese = Anamnese(
            patient_id=data.patient_id,
            template_type=data.template_type,
            status=data.status,
            dados=data.dados,
            created_by=current_user.id,
        )
        db.add(anamnese)
        db.commit()
        db.refresh(anamnese)
        return {
            "id": anamnese.id,
            "created_at": anamnese.created_at,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{patient_id}")
async def get_anamneses(patient_id: int, db: Session = Depends(get_db)):
    anamneses = db.query(Anamnese).filter(
        Anamnese.patient_id == patient_id
    ).order_by(Anamnese.created_at.desc()).all()
    
    return [
        {
            "id": a.id,
            "template_type": a.template_type,
            "status": a.status,
            "created_at": a.created_at,
            "dados": a.dados,
        }
        for a in anamneses
    ]
```

---

## Dark Mode

Todos os componentes suportam **dark mode** automaticamente via Tailwind CSS. 

Classes utilizadas:
- `dark:bg-slate-900` / `dark:bg-slate-800` / etc
- `dark:text-slate-50` / `dark:text-slate-400` / etc
- `dark:border-slate-600` / `dark:border-slate-700` / etc

---

## Funcionalidades Especiais

### 1. Barra de Progresso
- Automática em AnamneseFirstConsultation
- Calcula percentual de preenchimento em tempo real
- Visualização no footer do modal

### 2. Validação
- Campo "Queixa Principal" obrigatório em ambas
- Avisos visuais para campos importantes
- Toasts de sucesso/erro

### 3. MedicationSelector Integrado
- Busca de medicações via API
- Detecção de interações
- Alertas de contraindicações (alergias)

### 4. Escala de Dor Visual
- Cores progressivas (verde → vermelho)
- Clicáveis em ambos componentes
- Comparação antes/depois em FollowUp

### 5. Responsividade
- Grid adapta-se a md: (tablet)
- Modal responsivo
- Abas com scroll em mobile

---

## Customização

### Alterar Cores
Localizações principais:
```typescript
const PAIN_COLORS = [
  'bg-green-500',
  'bg-green-400',
  // ...
];

// Gradient backgrounds:
// from-blue-500 to-blue-600
// from-emerald-500 to-emerald-600
```

### Alterar Localizações de Dor
```typescript
const PAIN_LOCATIONS = [
  'Ombro',
  'Cotovelo',
  // Adicione aqui...
];
```

### Alterar Rótulos das Abas
```typescript
const tabs = [
  { id: 'complaint' as const, label: 'Queixa Principal', icon: '🔴' },
  // Customize aqui...
];
```

---

## Troubleshooting

**Q: Modal não abre?**
- Verifique se useModal está importado corretamente
- Verifique prop `open` e `onOpenChange`

**Q: MedicationSelector retorna erro?**
- Verifique se API endpoint `/api/medicamentos` existe
- Verifique `NEXT_PUBLIC_API_URL`

**Q: Dark mode não funciona?**
- Verifique se `dark:` classes estão em Tailwind config
- Verifique `class="dark"` no html tag

**Q: Dados não salvam?**
- Verifique callback `onSave` está implementado
- Verifique conexão com API
- Veja console.error para detalhes

---

## Próximas Melhorias

- [ ] Autosave em localStorage
- [ ] Signature digital
- [ ] Upload de imagens/exames
- [ ] Template customizados por especialidade
- [ ] Exportar para PDF
- [ ] Histórico de versões
- [ ] Campos personalizados por clínica
