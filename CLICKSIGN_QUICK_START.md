# ClickSign - Guia Rápido de Implementação

## 30 minutos para colocar em produção

### Pré-requisitos

- Python 3.8+
- Node.js 16+
- Conta ClickSign (https://app.clicksign.com)
- API Key ClickSign

### Passo 1: Instalar Dependências (2 min)

```bash
# Backend
pip install reportlab==4.0.9 qrcode==7.4.2 Pillow==10.1.0 requests==2.31.0

# ou adicione ao requirements.txt existente
echo "reportlab==4.0.9" >> backend/requirements.txt
echo "qrcode==7.4.2" >> backend/requirements.txt
echo "Pillow==10.1.0" >> backend/requirements.txt
echo "requests==2.31.0" >> backend/requirements.txt
```

### Passo 2: Configurar Variáveis de Ambiente (3 min)

```bash
# .env ou arquivo de configuração
export CLICKSIGN_API_KEY="seu_token_api_clicksign_aqui"

# Frontend (se necessário)
export NEXT_PUBLIC_API_BASE_URL="http://localhost:8000"
```

Obter chave:
1. Acesse https://app.clicksign.com/dashboard
2. Settings → Integrações → API
3. Copie seu token

### Passo 3: Atualizar Banco de Dados (5 min)

```python
# backend/main.py - Adicionar na startup

from models.prescription import Prescription, PrescriptionMedicine, PrescriptionSignatureLog

# Em init_db():
Base.metadata.create_all(bind=engine)
```

Ou rodar manualmente:
```python
python
>>> from database import Base, engine
>>> from models.prescription import *
>>> Base.metadata.create_all(bind=engine)
>>> exit()
```

### Passo 4: Copiar Arquivos (5 min)

Arquivo → Destino:
```
models/prescription.py → backend/models/
schemas/prescription.py → backend/schemas/
routers/prescriptions.py → backend/routers/
services/pdf_generator.py → backend/services/
services/clicksign_service.py → backend/services/
components/Prescription/PrescriptionSignature.tsx → frontend/components/
components/Prescription/PrescriptionValidator.tsx → frontend/components/
```

### Passo 5: Integrar Routers (2 min)

```python
# backend/main.py

from routers.prescriptions import router as prescriptions_router

app.include_router(prescriptions_router)
```

### Passo 6: Registrar Webhook (5 min)

1. Acesse https://app.clicksign.com/settings/api
2. Webhook URL: `https://seu-dominio.com/api/webhooks/clicksign`
3. Eventos: marque "document_signed"
4. Salvar

**Desenvolvimento local** (usar ngrok):
```bash
ngrok http 8000
# Use a URL fornecida como webhook
```

### Passo 7: Testar (8 min)

```bash
# Terminal 1: Backend
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Teste
python examples/prescription_example.py
```

### Passo 8: Deploy (Opcional)

```bash
# Render/Heroku
git add .
git commit -m "feat: add digital signature ClickSign"
git push

# Variáveis em Render:
# CLICKSIGN_API_KEY = seu_token
# BACKEND_CORS_ORIGINS = ["https://seu-frontend.com"]
```

## Uso Rápido (Frontend)

### 1. Criar Receita

```typescript
// Importar componente
import { PrescriptionForm } from '@/components/Prescription/PrescriptionForm';

// Usar na página
<PrescriptionForm patientId={1} onSuccess={handleSuccess} />
```

### 2. Assinar Receita

```typescript
import { PrescriptionSignature } from '@/components/Prescription/PrescriptionSignature';

// Uso
<PrescriptionSignature 
  prescriptionId={1}
  onSignatureComplete={(id) => console.log('Signed:', id)}
/>
```

### 3. Validar (Farmácia)

```typescript
import { PrescriptionValidator } from '@/components/Prescription/PrescriptionValidator';

// Página pública
export default function ValidatePage() {
  return <PrescriptionValidator />;
}
```

## Uso Rápido (Backend)

### Criar Receita via API

```bash
curl -X POST http://localhost:8000/api/prescriptions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 1,
    "medicines": [
      {
        "name": "Dipirona",
        "dose": 500,
        "unit": "mg",
        "frequency": "3x ao dia",
        "route": "via oral",
        "quantity": 30
      }
    ]
  }'
```

### Solicitar Assinatura

```bash
curl -X POST http://localhost:8000/api/prescriptions/1/sign \
  -H "Authorization: Bearer TOKEN"
```

Retorna: `{"sign_url": "https://app.clicksign.com/..."}`

### Validar Receita (Público)

```bash
curl -X GET "http://localhost:8000/api/prescriptions/validate/1?token=ABC123XYZ"
```

## Troubleshooting Rápido

| Erro | Solução |
|------|---------|
| `CLICKSIGN_API_KEY not set` | Defina em .env: `CLICKSIGN_API_KEY=seu_token` |
| `PDF generation error` | Cheque se reportlab está instalado: `pip install reportlab` |
| `QR code missing` | Pip install qrcode: `pip install qrcode[pil]` |
| `Webhook not arriving` | Verificar URL em ClickSign settings + usar ngrok para dev |
| `Token invalid` | QR code token deve coincidir: `/validate/{id}?token=TOKEN` |

## Checklist de Produção

- [ ] HTTPS/SSL configurado
- [ ] CLICKSIGN_API_KEY em variável de ambiente (não commitado)
- [ ] Webhook registrado em ClickSign
- [ ] Database backup configurado
- [ ] CORS configurado para domínio correto
- [ ] Logs habilitados para auditoria
- [ ] Testes executados com sucesso
- [ ] Certificado ClickSign verificado (ICP-Brasil)

## Próximos Passos

1. **Notificações**: Adicionar SMS/Email quando receita é assinada
2. **WhatsApp**: Integrar com seu sistema WhatsApp existente
3. **Histórico**: Interface para gerenciar receitas antigas
4. **Analytics**: Dashboard com estatísticas de assinaturas
5. **Mobile**: App React Native para farmácia validar

## Suporte

- Docs ClickSign: https://app.clicksign.com/api
- Issues: Verificar CLICKSIGN_IMPLEMENTATION.md
- Email: suporte@clicksign.com

---

**Status**: Pronto para Produção ✓
