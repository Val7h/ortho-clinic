# Quick Start - Integração Rápida do Sistema de Anamnese

## Setup em 5 Minutos

### Frontend

#### 1. Copiar componentes
```bash
# Os 3 componentes já estão em:
# - frontend/components/AnamneseTemplateSelector.tsx
# - frontend/components/AnamneseFirstConsultation.tsx
# - frontend/components/AnamneseFollowUp.tsx
# - frontend/types/anamnese.ts
```

#### 2. Importar em sua página
```typescript
'use client';
import { AnamneseTemplateSelector } from '@/components/AnamneseTemplateSelector';
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';
import { useState } from 'react';

export default function ConsultaPage() {
  const [template, setTemplate] = useState(null);
  const patientId = 123;

  if (!template) {
    return (
      <AnamneseTemplateSelector
        patientName="João Silva"
        onSelect={setTemplate}
      />
    );
  }

  return template === 'first_consultation' ? (
    <AnamneseFirstConsultation
      patientId={patientId}
      patientName="João Silva"
      onSave={(data) => {
        console.log('Salvando:', data);
        // Chamar API
      }}
    />
  ) : (
    <AnamneseFollowUp
      patientId={patientId}
      patientName="João Silva"
      onSave={(data) => {
        console.log('Salvando:', data);
        // Chamar API
      }}
    />
  );
}
```

### Backend

#### 1. Criar tabela PostgreSQL
```sql
CREATE TABLE anamneses (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  template_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  dados JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_anamneses_patient_id ON anamneses(patient_id);
CREATE INDEX idx_anamneses_template_type ON anamneses(template_type);
CREATE INDEX idx_anamneses_status ON anamneses(status);
```

#### 2. Criar modelo SQLAlchemy
```python
# app/models/anamnese.py
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Anamnese(Base):
    __tablename__ = "anamneses"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    template_type = Column(String(50), nullable=False)
    status = Column(String(50), default="draft")
    dados = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"))

    patient = relationship("Patient", back_populates="anamneses")
```

#### 3. Importar rotas no main.py
```python
# app/main.py
from fastapi import FastAPI
from app.api.routes import anamneses

app = FastAPI()
app.include_router(anamneses.router)
```

#### 4. Testar API
```bash
# Criar anamnese
curl -X POST http://localhost:8000/api/anamneses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "patient_id": 123,
    "template_type": "first_consultation",
    "status": "completed",
    "dados": {
      "chief_complaint": "Dor no ombro",
      "pain_intensity": 7,
      ...
    }
  }'

# Listar anamneses
curl -X GET http://localhost:8000/api/anamneses?patient_id=123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Estrutura Esperada

```
ortho-clinic/
├── frontend/
│   ├── app/
│   │   └── anamnese/
│   │       └── patient/
│   │           └── [id]/
│   │               └── page.tsx
│   ├── components/
│   │   ├── AnamneseTemplateSelector.tsx
│   │   ├── AnamneseFirstConsultation.tsx
│   │   ├── AnamneseFollowUp.tsx
│   │   ├── MedicationSelector.tsx (já existe)
│   │   └── ANAMNESE_USAGE.md
│   └── types/
│       └── anamnese.ts
│
└── backend/
    └── app/
        ├── models/
        │   ├── anamnese.py (novo)
        │   └── __init__.py
        ├── api/
        │   └── routes/
        │       ├── anamneses.py (novo)
        │       └── __init__.py
        └── schemas/
            └── anamnese.py (novo)
```

## Checklist de Integração

- [ ] Componentes Frontend copiados
- [ ] Types TypeScript importados
- [ ] Página do paciente criada/atualizada
- [ ] Tabela PostgreSQL criada
- [ ] Modelo SQLAlchemy criado
- [ ] Rotas FastAPI importadas
- [ ] Schemas Pydantic configurados
- [ ] Testes locais realizados
- [ ] Dark mode verificado
- [ ] Mobile responsiveness testado

## Troubleshooting

**Erro: "MedicationSelector não encontrado"**
- Verifique se MedicationSelector.tsx existe em components/
- Verifique imports

**Erro: "Modal não abre"**
- Certifique-se que useModal está exportado de components/ui
- Verifique que Button e Modal estão importados

**Erro: "API 404"**
- Verifique se router está incluído no main.py
- Verifique prefixo `/api/` está correto
- Teste com curl

**Erro: "Database integrity"**
- Crie a tabela antes de usar
- Verifique foreign keys
- Verifique que patients table existe

## Próximos Passos

1. **Assinatura Digital** - Integrar com DocuSign ou similar
2. **PDF Export** - Gerar PDF da anamnese assinada
3. **Mensagens Automáticas** - Lembretes de preenchimento
4. **Templates Customizados** - Por especialidade médica
5. **Relatórios** - Dashboard com estatísticas

## Suporte

Ver:
- `ANAMNESE_SYSTEM.md` - Documentação completa
- `ANAMNESE_USAGE.md` - Guia de uso detalhado
- `ANAMNESE_MANIFEST.json` - Manifesto de recursos
- `frontend/components/__tests__/` - Exemplos de testes

## Timing

- **Setup**: 5 min
- **Integração**: 15 min
- **Testes**: 10 min
- **Deploy**: 5 min
- **Total**: ~35 min

Sucesso! 🎉
