# Quick Start - Sistema de Anamnese Refatorado

**Tempo estimado de implementação**: 15-30 minutos  
**Nível de dificuldade**: Fácil

---

## 1. Verificar Dependências (2 min)

Confirme que você tem as bibliotecas necessárias:

```bash
# Instalar se faltar
npm install react-hot-toast lucide-react
```

Verificar que existem os componentes UI:
- ✅ `/components/ui/Button.tsx`
- ✅ `/components/ui/Modal.tsx`
- ✅ `/components/MedicationSelector.tsx`
- ✅ `/types/anamnese.ts`

---

## 2. Copiar Componentes Refatorados (1 min)

Os componentes já estão em:
- `/frontend/components/AnamneseTemplateSelector.tsx` ✅
- `/frontend/components/AnamneseFirstConsultation.tsx` ✅
- `/frontend/components/AnamneseFollowUp.tsx` ✅

Nenhuma ação necessária se já estão no lugar correto.

---

## 3. Escolher Padrão de Integração (2-5 min)

### Opção A: Fluxo Completo com Selector (Recomendado)

Use quando o usuário escolhe entre primeira consulta ou retorno:

```tsx
// page.tsx do dashboard do paciente
'use client';

import { AnamneseExample } from '@/components/ANAMNESE_EXAMPLE';

export default function PatientPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6">
      <h1>Paciente #123</h1>
      
      <AnamneseExample
        patientId={parseInt(params.id)}
        patientName="João Silva"
        lastAnamneseData={{
          date: "2026-06-01",
          painIntensity: 8
        }}
      />
    </div>
  );
}
```

---

### Opção B: Abrir Apenas Primeira Consulta

Use quando já sabe que é primeira consulta:

```tsx
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';

export default function FirstConsultationPage() {
  return (
    <AnamneseFirstConsultation
      patientId={123}
      patientName="João Silva"
      onSave={async (data) => {
        // Salvar na API
        const response = await fetch('/api/anamneses', {
          method: 'POST',
          body: JSON.stringify({
            patient_id: 123,
            template_type: 'first_consultation',
            status: 'completed',
            dados: data
          })
        });
      }}
    />
  );
}
```

---

### Opção C: Abrir Apenas Retorno

Use quando já sabe que é retorno:

```tsx
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';

export default function FollowUpPage() {
  return (
    <AnamneseFollowUp
      patientId={123}
      patientName="João Silva"
      lastConsultationDate="2026-06-01"
      lastPainIntensity={8}
      onSave={async (data) => {
        // Salvar na API
        const response = await fetch('/api/anamneses', {
          method: 'POST',
          body: JSON.stringify({
            patient_id: 123,
            template_type: 'follow_up',
            status: 'completed',
            dados: data
          })
        });
      }}
    />
  );
}
```

---

### Opção D: Seção em Dashboard Existente

Use para adicionar em uma página existente:

```tsx
import { PatientAnamneseSection } from '@/components/ANAMNESE_EXAMPLE';

export default function PatientDashboard() {
  return (
    <div>
      <h1>Dashboard do Paciente</h1>
      
      {/* Outras seções */}
      
      {/* Seção de Anamnezes */}
      <PatientAnamneseSection
        patientId={123}
        patientName="João Silva"
        patientAge={45}
      />
    </div>
  );
}
```

---

## 4. Implementar API Endpoints (10-15 min)

### POST /api/anamneses

```typescript
// app/api/anamneses/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'; // seu pool de conexão

export async function POST(request: NextRequest) {
  try {
    const { patient_id, template_type, status, dados } = await request.json();

    // Validar
    if (!patient_id || !template_type || !dados) {
      return NextResponse.json(
        { error: 'Campos obrigatórios faltando' },
        { status: 400 }
      );
    }

    // Salvar
    const result = await db.query(
      `INSERT INTO anamneses (patient_id, template_type, status, dados)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [patient_id, template_type, status, dados]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar anamnese' },
      { status: 500 }
    );
  }
}
```

### GET /api/pacientes/:id/anamneses

```typescript
// app/api/pacientes/[id]/anamneses/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await db.query(
      `SELECT id, patient_id, template_type, status, created_at, 
              dados->>'chief_complaint' as chief_complaint,
              dados->>'evolution_summary' as evolution_summary
       FROM anamneses
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [params.id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar anamnezes' },
      { status: 500 }
    );
  }
}
```

---

## 5. Testar Localmente (3-5 min)

```bash
# 1. Iniciar dev server
npm run dev

# 2. Abrir http://localhost:3000/seu-paciente-page

# 3. Testar fluxo:
#    a) Clique em "Nova Anamnese"
#    b) Selecione "Primeira Consulta"
#    c) Preencha cada aba (teste dark mode: Cmd+Shift+L)
#    d) Clique "Salvar Anamnese"
#    e) Verifique console (sucesso esperado)

# 4. Verificar dados salvos:
#    SELECT * FROM anamneses WHERE patient_id = 123;
```

---

## 6. Dark Mode (Opcional)

Os componentes já suportam dark mode nativamente!

Para testar:
```html
<!-- Adicione ao seu layout.tsx -->
<html className="dark" /> <!-- torna dark o padrão -->
<!-- ou use um toggle -->
```

---

## 7. Estrutura de Dados Esperada

### Primeira Consulta (em anamneses.dados)
```json
{
  "template_type": "first_consultation",
  "status": "completed",
  "chief_complaint": "Dor no ombro direito",
  "pain_location": "Ombro",
  "symptom_duration": "2 semanas",
  "pain_intensity": 8,
  "aggravating_factors": "Levantamento de peso",
  "relieving_factors": "Repouso",
  "previous_traumas": "",
  "previous_surgeries": "Nenhuma",
  "previous_physiotherapy": "",
  "previous_treatments": "Anti-inflamatório",
  "current_medications": [
    {
      "id": "123",
      "nome": "Ibuprofeno",
      "dosagem": "400mg",
      "via": "oral",
      "fabricante": "Genérico"
    }
  ],
  "profession": "Gerente",
  "physical_activities": "Musculação 3x/semana",
  "sedentarism": 3,
  "smoking": false,
  "alcohol_consumption": "occasional",
  "sleep_quality": "fair",
  "range_of_motion": "Limitado em abdução",
  "specific_tests": "Teste de Neer positivo",
  "inflammation": true,
  "deformities": "Nenhuma",
  "created_at": "2026-06-06T10:30:00Z"
}
```

### Retorno (em anamneses.dados)
```json
{
  "template_type": "follow_up",
  "status": "completed",
  "last_consultation_date": "2026-06-01",
  "pain_intensity_last": 8,
  "pain_intensity_current": 4,
  "evolution_summary": "Paciente evoluiu bem com 50% de melhora",
  "new_symptoms": "Nenhum",
  "treatment_adherence": "good",
  "treatment_response": "Excelente resposta aos anti-inflamatórios",
  "current_limitations": "Ainda não consegue levantar pesos pesados",
  "next_steps": "Continuar com fisioterapia 2x/semana",
  "additional_observations": "Paciente muito aderente ao tratamento",
  "created_at": "2026-06-06T11:00:00Z"
}
```

---

## 8. Validação de Campos

### Campos Obrigatórios

**Primeira Consulta:**
- `chief_complaint` - Motivo da consulta (não pode estar vazio)
- Outros campos: opcionais

**Retorno:**
- `evolution_summary` - Evolução (não pode estar vazio)
- Outros campos: opcionais

---

## 9. Troubleshooting

### "Cannot find module '@/components/MedicationSelector'"
→ Certifique-se que MedicationSelector existe em `/components/`

### Dark mode não funciona
→ Verificar se seu layout.tsx tem className="dark" no html root

### Toast notifications não aparecem
→ Verificar se Toaster está em seu layout.tsx:
```tsx
import { Toaster } from 'react-hot-toast';

export default function Layout() {
  return (
    <>
      <Toaster />
      <main>{/* ... */}</main>
    </>
  );
}
```

### Modal não abre
→ Verificar se Modal component tem export de useModal hook

### Styles não aplicando
→ Verificar se Tailwind CSS está configurado em tailwind.config.ts

---

## 10. Próximos Passos

### Imediato
- [ ] Implementar POST /api/anamneses
- [ ] Implementar GET /api/pacientes/:id/anamneses
- [ ] Integrar em uma página de teste
- [ ] Fazer testes manuais

### Curto Prazo (1-2 semanas)
- [ ] Implementar GET/PATCH/DELETE endpoints
- [ ] Adicionar validação no backend
- [ ] Testar em staging
- [ ] Deploy para produção

### Futuro
- [ ] Export para PDF
- [ ] Assinatura digital
- [ ] Histórico e comparações

---

## Referências Rápidas

| Arquivo | Descrição |
|---------|-----------|
| `AnamneseTemplateSelector.tsx` | Seletor de template |
| `AnamneseFirstConsultation.tsx` | Formulário 5 abas |
| `AnamneseFollowUp.tsx` | Formulário retorno |
| `ANAMNESE_EXAMPLE.tsx` | 4 exemplos de uso |
| `ANAMNESE_REFACTOR.md` | Documentação técnica |
| `types/anamnese.ts` | Tipos e interfaces |

---

## Suporte

### Dúvidas Comuns

**P: Como mudar as cores das abas?**  
R: Editar a constante `TABS` em AnamneseFirstConsultation.tsx

**P: Como adicionar mais campos?**  
R: 1) Adicionar em types/anamnese.ts, 2) Criar FormField na aba desejada, 3) Adicionar state

**P: Como validar antes de salvar?**  
R: Editar a função `handleSave` em cada componente

**P: Como integrar com Prisma/Sequelize?**  
R: Usar o JSON que vem em `dados` e fazer insert direto

---

## Checklist Final

- [ ] Dependências instaladas (react-hot-toast, lucide-react)
- [ ] Componentes no lugar certo
- [ ] Tipos/interfaces verificadas
- [ ] API endpoints implementados
- [ ] Integração escolhida (A, B, C ou D)
- [ ] Testes locais executados
- [ ] Dark mode testado
- [ ] Ready para staging!

---

**Tempo total**: 15-30 minutos  
**Dificuldade**: ⭐ Fácil  
**Status**: ✅ Pronto para Deploy

Para detalhes técnicos, consulte `ANAMNESE_REFACTOR.md`.
