# Passos de Integração - Sistema de Receitas com ClickSign

## ⚡ Integração Rápida (5 minutos)

### Passo 1: Adicionar import no main.py

```python
# backend/main.py

# Adicione esta linha com os outros imports de routers
from routers.prescriptions import router as prescriptions_router

# E adicione esta linha no bloco include_router (após os outros routers)
app.include_router(prescriptions_router)
```

**Resultado esperado**: Endpoints `/api/prescriptions/*` estarão disponíveis

### Passo 2: Inicializar Tabelas do Banco

Execute no terminal Python:

```python
python
>>> from database import Base, engine
>>> from models.prescription import Prescription, PrescriptionMedicine, PrescriptionSignatureLog
>>> Base.metadata.create_all(bind=engine)
>>> exit()
```

Ou em código durante startup (em `main.py`):

```python
@app.on_event("startup")
def startup():
    init_db()
    migrate_db()
    # Adicionar:
    from models.prescription import Prescription, PrescriptionMedicine, PrescriptionSignatureLog
    Base.metadata.create_all(bind=engine)
```

### Passo 3: Configurar Variáveis de Ambiente

```bash
# .env ou arquivo de configuração
CLICKSIGN_API_KEY=seu_token_aqui

# Obter token em: https://app.clicksign.com/settings/integrations/api
```

### Passo 4: Testar Endpoints

```bash
# Listar receitas (requer autenticação)
curl -H "Authorization: Bearer SEU_TOKEN_JWT" \
     http://localhost:8000/api/prescriptions

# Validar receita (público, sem autenticação)
curl http://localhost:8000/api/prescriptions/validate/1?token=abc123
```

## 📝 Código Completo para main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

# ... imports existentes ...

# ADICIONAR ESTE IMPORT
from routers.prescriptions import router as prescriptions_router

# ... resto do código ...

# ADICIONAR NO BLOCO app.include_router()
app.include_router(prescriptions_router)

# Resto do código permanece igual
```

## 🗄️ Database Migrations

Se estiver usando Alembic:

```bash
# Criar migração
alembic revision --autogenerate -m "Add prescription tables"

# Aplicar migração
alembic upgrade head
```

Se estiver criando tabelas manualmente:

```sql
-- SQL para criar tabelas (se preferir)

CREATE TABLE prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    doctor_id INTEGER NOT NULL REFERENCES users(id),
    clinic_id INTEGER NOT NULL REFERENCES clinics(id),
    consultation_id INTEGER REFERENCES consultations(id),
    status VARCHAR(30) NOT NULL DEFAULT 'rascunho',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    issued_at TIMESTAMP WITH TIME ZONE,
    signed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    clicksign_doc_id VARCHAR(255) UNIQUE,
    clicksign_sign_url TEXT,
    clicksign_signed_url TEXT,
    signature_proof_url TEXT,
    pdf_file BYTEA,
    pdf_checksum VARCHAR(64),
    qr_code_token VARCHAR(128) UNIQUE,
    notes TEXT,
    instructions TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescription_medicines (
    id SERIAL PRIMARY KEY,
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    dose FLOAT NOT NULL,
    unit VARCHAR(20),
    frequency VARCHAR(50) NOT NULL,
    route VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescription_signature_logs (
    id SERIAL PRIMARY KEY,
    prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    status VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    clicksign_event_id VARCHAR(255)
);

-- Índices
CREATE INDEX idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor_id ON prescriptions(doctor_id);
CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_qr_token ON prescriptions(qr_code_token);
CREATE INDEX idx_medicines_prescription_id ON prescription_medicines(prescription_id);
```

## 🧪 Teste Rápido

```python
# test_integration.py
import requests

BASE_URL = "http://localhost:8000"
TOKEN = "seu_token_jwt"

headers = {"Authorization": f"Bearer {TOKEN}"}

# 1. Listar receitas (deve retornar lista vazia ou existente)
r = requests.get(f"{BASE_URL}/api/prescriptions", headers=headers)
print(f"GET /prescriptions: {r.status_code}")
print(r.json())

# 2. Health check
r = requests.get(f"{BASE_URL}/health")
print(f"Health: {r.status_code}")
print(r.json())
```

## 🐛 Troubleshooting

### Erro: "prescriptions router not found"

**Solução**: Certifique-se que o import e include_router estão em `main.py`

```python
from routers.prescriptions import router as prescriptions_router
app.include_router(prescriptions_router)
```

### Erro: "CLICKSIGN_API_KEY not set"

**Solução**: Configurar variável de ambiente

```bash
export CLICKSIGN_API_KEY="seu_token"
# ou em .env
CLICKSIGN_API_KEY=seu_token
```

### Erro: "relation 'prescriptions' does not exist"

**Solução**: Criar tabelas no banco de dados

```bash
python -c "from database import Base, engine; from models.prescription import *; Base.metadata.create_all(bind=engine)"
```

### Erro: "Module not found: reportlab"

**Solução**: Instalar dependências

```bash
pip install reportlab==4.0.9 qrcode==7.4.2 Pillow==10.1.0
```

## 📋 Checklist de Integração

```
[ ] 1. Copiar arquivo models/prescription.py para backend/models/
[ ] 2. Copiar arquivo schemas/prescription.py para backend/schemas/
[ ] 3. Copiar arquivo routers/prescriptions.py para backend/routers/
[ ] 4. Copiar arquivo services/pdf_generator.py para backend/services/
[ ] 5. Copiar arquivo services/clicksign_service.py para backend/services/
[ ] 6. Adicionar import em main.py
[ ] 7. Adicionar include_router em main.py
[ ] 8. Instalar dependências: pip install reportlab qrcode Pillow requests
[ ] 9. Criar tabelas no banco de dados
[ ] 10. Configurar CLICKSIGN_API_KEY em .env
[ ] 11. Registrar webhook em https://app.clicksign.com/settings/api
[ ] 12. Copiar componentes TypeScript para frontend/components/Prescription/
[ ] 13. Testar endpoints com curl ou Postman
[ ] 14. Rodar testes: pytest test_prescriptions.py
[ ] 15. Deploy!
```

## 📂 Estrutura Final de Diretórios

Após integração completa:

```
ortho-clinic/
├── backend/
│   ├── main.py (modificado: +2 linhas)
│   ├── models/
│   │   ├── consultation.py
│   │   ├── patient.py
│   │   └── prescription.py (novo)
│   ├── routers/
│   │   ├── consultations.py
│   │   ├── patients.py
│   │   └── prescriptions.py (novo)
│   ├── schemas/
│   │   ├── patient.py
│   │   └── prescription.py (novo)
│   ├── services/
│   │   ├── pdf_generator.py (novo)
│   │   └── clicksign_service.py (novo)
│   ├── examples/
│   │   ├── prescription_example.py (novo)
│   │   └── test_webhook.py (novo)
│   ├── test_prescriptions.py (novo)
│   └── requirements.txt (adicionar 4 linhas)
│
├── frontend/
│   └── components/Prescription/
│       ├── PrescriptionSignature.tsx (novo)
│       └── PrescriptionValidator.tsx (novo)
│
└── Documentação/
    ├── CLICKSIGN_IMPLEMENTATION.md (novo)
    ├── CLICKSIGN_QUICK_START.md (novo)
    ├── CLICKSIGN_IMPLEMENTATION_SUMMARY.md (novo)
    ├── INTEGRATION_STEPS.md (este arquivo)
    └── .env.example (novo)
```

## 🔗 Próximos Passos

Após integração:

1. **Criar página de receitas** (`/admin/prescriptions`)
   - Listar receitas
   - Ver detalhes
   - Assinar receita

2. **Criar página de validação** (`/validar-receita`)
   - Input de ID + Token
   - Exibir dados
   - Validar integridade

3. **Notificações**
   - Email ao paciente quando receita é assinada
   - SMS com link de validação

4. **Dashboard**
   - Quantas receitas assinadas por mês
   - Taxa de sucesso
   - Medicamentos mais prescritos

## 📞 Support

- ClickSign API Docs: https://app.clicksign.com/api
- ClickSign Dashboard: https://app.clicksign.com
- Issues: Ver CLICKSIGN_IMPLEMENTATION.md → Troubleshooting

---

**Tempo estimado**: 5-10 minutos  
**Dificuldade**: Fácil ✓  
**Status**: Pronto para Integração
