# Refatoração de Componentes de Anamnese - Documentação

## Visão Geral

Os componentes de anamnese foram completamente refatorados para oferecer uma experiência profissional, completa e otimizada para o sistema OrthoClinic.

## Componentes Refatorados

### 1. **AnamneseTemplateSelector.tsx**
Seletor de template inicial com interface intuitiva.

**Funcionalidades:**
- Radio buttons visuais com cards interativos
- Dois templates: "Primeira Consulta" vs "Retorno"
- Seleção com feedback visual e animações
- Informações detalhadas sobre cada template
- Dark mode completo
- Responsivo (mobile-first)

**Props:**
```typescript
interface AnamneseTemplateSelectorProps {
  patientName: string;
  onSelect: (templateType: 'first_consultation' | 'follow_up') => void;
}
```

**Uso:**
```tsx
<AnamneseTemplateSelector
  patientName="João Silva"
  onSelect={(templateType) => {
    // Handle template selection
  }}
/>
```

---

### 2. **AnamneseFirstConsultation.tsx**
Formulário completo de primeira consulta com 5 abas navegáveis.

**Funcionalidades:**

#### TAB 1: Queixa Principal
- Motivo da consulta (textarea obrigatório)
- Localização: 7 locais (Ombro, Cotovelo, Punho, Coluna, Quadril, Joelho, Tornozelo)
- Duração dos sintomas (input flexível)
- Intensidade da dor: slider visual 0-10 com cores gradientes
- Fatores agravantes e aliviantes (textareas)

#### TAB 2: Histórico
- Traumas anteriores
- Cirurgias anteriores
- Fisioterapia anterior
- Tratamentos prévios
- Seletor de medicações com integração ao MedicationSelector

#### TAB 3: Hábitos e Risco
- Profissão
- Atividades físicas/esportes
- Nível de sedentarismo (slider 1-10)
- Tabagismo (sim/não)
- Consumo de álcool (não/ocasional/regular)
- Qualidade do sono (boa/regular/ruim)

#### TAB 4: Exame Físico
- Amplitude de movimento
- Testes específicos (Neer, Speed, etc)
- Presença de inflamação (sim/não)
- Deformidades/assimetrias

#### TAB 5: Resumo
- Preview de todas as seções preenchidas
- Cards coloridos por tema (queixa, histórico, hábitos, exame físico, medicações)
- Barra de progresso de preenchimento
- Informações de completude

**Props:**
```typescript
interface AnamneseFirstConsultationProps {
  patientId: number;
  patientName: string;
  onSave?: (data: AnamneseFirstConsultationData) => void;
}
```

**Estrutura de Dados:**
```typescript
interface AnamneseFirstConsultationData {
  template_type: 'first_consultation';
  status: 'draft' | 'completed';
  chief_complaint: string;
  pain_location: string;
  symptom_duration: string;
  pain_intensity: number; // 0-10
  aggravating_factors: string;
  relieving_factors: string;
  previous_traumas: string;
  previous_surgeries: string;
  previous_physiotherapy: string;
  previous_treatments: string;
  current_medications: Medicacao[];
  profession: string;
  physical_activities: string;
  sedentarism: number; // 1-10
  smoking: boolean;
  alcohol_consumption: 'none' | 'occasional' | 'regular';
  sleep_quality: 'good' | 'fair' | 'poor';
  range_of_motion: string;
  specific_tests: string;
  inflammation: boolean;
  deformities: string;
  created_at?: string;
}
```

**Uso:**
```tsx
<AnamneseFirstConsultation
  patientId={123}
  patientName="João Silva"
  onSave={(data) => {
    // Save to API
    console.log(data);
  }}
/>
```

**Componentes Auxiliares (internos):**
- `InfoBox` - Caixa de informação colorida por contexto
- `FormField` - Campo genérico (text/textarea)
- `LocationButton` - Botão de seleção de localização
- `PainIntensitySelector` - Slider de dor visual
- `SedentarismSelector` - Slider de sedentarismo
- `BinarySelector` - Seletor de sim/não
- `TripleSelector` - Seletor de 3 opções
- `SummaryCard` - Card de resumo colorido

---

### 3. **AnamneseFollowUp.tsx**
Formulário simplificado de retorno/acompanhamento.

**Funcionalidades:**
- Card de comparação de dor (antes/depois com percentual)
- Indicadores visuais: TrendingDown (melhora), TrendingUp (piora), CheckCircle (sem mudança)
- Evolução desde última consulta (obrigatório)
- Adesão ao tratamento (excelente/boa/regular/fraca)
- Resposta ao tratamento
- Novos sintomas
- Limitações atuais
- Próximos passos
- Observações adicionais
- Resumo de avaliação com ícones

**Props:**
```typescript
interface AnamneseFollowUpProps {
  patientId: number;
  patientName: string;
  lastConsultationDate?: string;
  lastPainIntensity?: number;
  onSave?: (data: AnamneseFollowUpData) => void;
}
```

**Estrutura de Dados:**
```typescript
interface AnamneseFollowUpData {
  template_type: 'follow_up';
  status: 'draft' | 'completed';
  last_consultation_date?: string;
  pain_intensity_last: number; // 0-10
  pain_intensity_current: number; // 0-10
  evolution_summary: string;
  new_symptoms: string;
  treatment_adherence: 'excellent' | 'good' | 'fair' | 'poor';
  treatment_response: string;
  current_limitations: string;
  next_steps: string;
  additional_observations: string;
  created_at?: string;
}
```

**Uso:**
```tsx
<AnamneseFollowUp
  patientId={123}
  patientName="João Silva"
  lastConsultationDate="2025-02-01"
  lastPainIntensity={8}
  onSave={(data) => {
    // Save to API
    console.log(data);
  }}
/>
```

**Componentes Auxiliares (internos):**
- `InfoBox` - Caixa de informação
- `PainComparisonCard` - Card com comparação de dor visual
- `FormField` - Campo genérico
- `TreatmentAdherenceSelector` - Seletor de adesão com ícones
- `AssessmentSummary` - Resumo de avaliação

---

## Padrões de Design Implementados

### 1. **Dark Mode Completo**
Todos os componentes suportam dark mode com cores apropriadas:
- Background: `bg-white dark:bg-slate-900`
- Text: `text-slate-900 dark:text-slate-50`
- Borders: `border-slate-300 dark:border-slate-600`

### 2. **Validação**
- Campos obrigatórios marcados com asterisco vermelho
- Validação antes de salvar (chief_complaint e evolution_summary)
- Feedback com toast notifications

### 3. **Acessibilidade**
- Labels associados aos inputs
- Placeholder descritivos
- Contraste adequado
- Focus rings visíveis

### 4. **Performance**
- `useCallback` para funções de handlers
- `useMemo` para cálculos de percentual
- Estados locais otimizados

### 5. **Type Safety**
- Tipos TypeScript completos
- Props interfaces documentadas
- Data structures bem definidas

---

## Integração com Banco de Dados

### Schema PostgreSQL

```sql
-- Tabela de anamnezes
CREATE TABLE anamneses (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES pacientes(id),
  template_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  dados JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES usuarios(id)
);

-- Index para otimização
CREATE INDEX idx_anamneses_patient ON anamneses(patient_id);
CREATE INDEX idx_anamneses_template ON anamneses(template_type);
CREATE INDEX idx_anamneses_status ON anamneses(status);
```

### Fluxo de Salvamento

1. Usuário preenche o formulário
2. Clica em "Salvar Anamnese"
3. Componente valida dados obrigatórios
4. Chama `onSave` callback com dados completos
5. Parent component envia para API
6. API salva em JSONB (estrutura completa armazenada)
7. Toast de sucesso e modal fecha

---

## Utilitários (anamnese.ts)

### `AnamneseUtils` Namespace

```typescript
// Calcula melhora/piora em percentual
calculatePainImprovement(painBefore: number, painAfter: number): number

// Converte enums para labels em português
getSleepQualityLabel(quality: SleepQuality): string
getAlcoholConsumptionLabel(consumption: AlcoholConsumption): string
getTreatmentAdherenceLabel(adherence: TreatmentAdherence): string

// Calcula percentual de preenchimento
calculateCompletionPercentage(data: AnamneseData): number

// Valida se anamnese está completa
isComplete(data: AnamneseData): boolean
```

### Constantes

```typescript
PAIN_COLORS // Array com 11 cores para escala 0-10
PAIN_LOCATIONS // Array com 7 localizações de dor
```

---

## Fluxo de Uso Recomendado

### Flow 1: Primeira Consulta
```
1. AnamneseTemplateSelector
   ↓
2. Usuário seleciona "Primeira Consulta"
   ↓
3. AnamneseFirstConsultation abre modal
   ↓
4. Preenchimento de 5 abas
   ↓
5. Botão "Salvar Anamnese"
   ↓
6. onSave callback dispara
   ↓
7. Parent envia para API
   ↓
8. Dados salvos em `anamneses.dados` (JSONB)
```

### Flow 2: Retorno
```
1. AnamneseTemplateSelector
   ↓
2. Usuário seleciona "Retorno"
   ↓
3. AnamneseFollowUp abre modal com dados da última consulta
   ↓
4. Preenchimento simplificado
   ↓
5. Comparação visual de dor
   ↓
6. Botão "Salvar Anamnese"
   ↓
7. onSave callback dispara
   ↓
8. Parent envia para API
```

---

## Estilos Implementados

### Cores por Tema
- **Queixa Principal**: Red/Blue (🔴)
- **Histórico**: Purple (📜)
- **Hábitos**: Amber (⚠️)
- **Exame Físico**: Green (🔍)
- **Resumo**: Emerald (✅)
- **Pain Intensity**: Gradient Green → Red

### Tipografia
- Headings: Font weight bold, sizes 2xl-4xl
- Labels: Font weight bold, size sm
- Descriptions: Regular weight, size sm

### Spacing
- Cards: p-4 ou p-5
- Gaps: gap-2, gap-3, gap-4, gap-6
- Margins: mb-2, mb-3, mb-4

---

## Melhorias Implementadas vs Versão Anterior

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Abas | 5 abas com ícones simples | 5 abas com cores e contexto |
| Info Box | Genérica | Colorida por contexto |
| Componentes | Mistos no arquivo | Extraídos em sub-components |
| Type Safety | Interfaces locais | Types centralizados |
| Performance | useState puro | useCallback/useMemo otimizados |
| Acessibilidade | Básica | Labels, placeholders, focus |
| Documentation | Nenhuma | JSDoc + inline comments |
| Error Handling | Toast genérico | Validação específica |

---

## Testing (Sugestão)

```typescript
describe('AnamneseFirstConsultation', () => {
  it('should render all tabs', () => {
    // Test each tab renders correctly
  });

  it('should validate chief_complaint is required', () => {
    // Test save fails without chief_complaint
  });

  it('should calculate completion percentage', () => {
    // Test completion percentage updates
  });

  it('should support dark mode', () => {
    // Test dark mode classes are applied
  });
});
```

---

## Deployment Checklist

- [ ] Types atualizados em `types/anamnese.ts`
- [ ] Componentes importados corretamente
- [ ] MedicationSelector disponível
- [ ] Modal component funciona
- [ ] Toast notifications configuradas
- [ ] Database schema migrado
- [ ] API endpoints para salvar anamnese
- [ ] Environment variables definidas
- [ ] Tests passando
- [ ] Dark mode testado

---

## Suporte e Manutenção

### Adições Futuras Sugeridas
1. Assinatura digital (signature pad)
2. Upload de imagens (radiografias)
3. Export para PDF
4. Histórico com versioning
5. Comparação com anamneses anteriores
6. Análise de tendências

### Contato
Para dúvidas sobre a implementação, consulte a documentação de tipos em `types/anamnese.ts` ou abra um issue.

---

**Data de Refatoração**: 2026-06-06
**Versão**: 2.0.0
**Status**: Production Ready
