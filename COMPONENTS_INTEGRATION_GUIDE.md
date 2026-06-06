# Guia de Integração - Phase 1 Components

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                  OrthoClinic Frontend                     │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  TVDisplay   │  │AdminCallPanel│  │QueueStatus   │   │
│  │  (Sala TV)   │  │  (Painel)    │  │  (Widget)    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │     MedicationSelector (Prescrições)             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │     Custom Hooks (lib/medication-hooks.ts)       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│            OrthoClinic FastAPI Backend                   │
│                                                           │
│  ├─ /api/fila/* (Queue Management)                      │
│  ├─ /api/medicamentos/* (Medications)                   │
│  ├─ /api/pacientes/* (Patients)                         │
│  └─ /ws/queue (WebSocket real-time)                    │
│                                                           │
│  └─ PostgreSQL Database                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Endpoints Necessários no Backend

### 1.1 Fila de Pacientes

#### GET /api/fila/status
Retorna status geral da fila com paciente atual e próximos

**Response:**
```json
{
  "pacienteAtual": {
    "id": "uuid",
    "nome": "João Silva",
    "sala": "01",
    "horario": "2024-06-05T14:30:00"
  },
  "proximosPacientes": [
    {
      "id": "uuid",
      "nome": "Maria Santos",
      "sala": "02",
      "horario": "2024-06-05T14:45:00"
    },
    {
      "id": "uuid",
      "nome": "Carlos Oliveira",
      "sala": "03",
      "horario": "2024-06-05T15:00:00"
    }
  ],
  "chamadaEm": "2024-06-05T14:30:15.123Z",
  "totalAguardando": 12
}
```

**Usado por:** TVDisplay, AdminCallPanel

---

#### GET /api/fila/status-rapido
Status resumido para widget compacto

**Response:**
```json
{
  "totalAguardando": 12,
  "tempoMedioEspera": 15,
  "maiorTempoEspera": 45,
  "atrasoPercentual": 35,
  "estimadoParaAtender": 8
}
```

**Usado por:** QueueStatus

---

#### GET /api/fila/aguardando
Lista de pacientes aguardando atendimento

**Response:**
```json
{
  "pacientes": [
    {
      "id": "uuid",
      "nome": "João Silva",
      "sala": "01",
      "tempoEspera": 900
    },
    {
      "id": "uuid",
      "nome": "Maria Santos",
      "sala": null,
      "tempoEspera": 1200
    }
  ]
}
```

**Usado por:** AdminCallPanel

---

#### GET /api/fila/historico?limite=5
Histórico das últimas chamadas

**Query Params:**
- `limite` (int, default: 5)
- `offset` (int, default: 0, optional)

**Response:**
```json
{
  "historico": [
    {
      "id": "uuid",
      "pacienteId": "uuid",
      "pacienteNome": "João Silva",
      "sala": "01",
      "chamadoEm": "2024-06-05T14:30:15.123Z",
      "status": "em_atendimento",
      "atendidoPor": "Dr. Pedro",
      "concluidoEm": null
    }
  ]
}
```

**Status:** `chamado` | `em_atendimento` | `concluido`

**Usado por:** AdminCallPanel

---

#### POST /api/fila/chamar
Chama um paciente para uma sala

**Request:**
```json
{
  "pacienteId": "uuid",
  "sala": "01"
}
```

**Response:**
```json
{
  "sucesso": true,
  "mensagem": "Paciente chamado com sucesso",
  "chamadaEm": "2024-06-05T14:30:15.123Z"
}
```

**Usado por:** AdminCallPanel

---

#### POST /api/fila/atualizar-status
Atualiza status de um paciente na fila

**Request:**
```json
{
  "pacienteId": "uuid",
  "status": "em_atendimento",
  "sala": "01"
}
```

**Usado por:** Backend interno

---

### 1.2 Medicações

#### GET /api/medicamentos?search=:termo&limite=10
Busca medicações com autocomplete

**Query Params:**
- `search` (string)
- `limite` (int, default: 10)
- `via` (string, optional: "oral", "injetável", etc)

**Response:**
```json
{
  "medicamentos": [
    {
      "id": "uuid",
      "nome": "Dipirona",
      "dosagem": "500mg",
      "via": "oral",
      "fabricante": "Laboratório X",
      "indicacoes": ["febre", "dor"],
      "contraIndicacoes": ["gravidez"],
      "alergiasComuns": ["sulfas"]
    }
  ]
}
```

**Usado por:** MedicationSelector

---

#### POST /api/medicamentos/:id/interacoes
Verifica interações com medicações atuais

**Request:**
```json
{
  "medicacoesAtuais": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "medicamentos_analisados": ["uuid1", "uuid2"],
  "interacoes": [
    {
      "medicacao": "Ibuprofeno",
      "severidade": "moderada",
      "descricao": "Pode aumentar risco de úlceras gástricas"
    },
    {
      "medicacao": "Aspirana",
      "severidade": "grave",
      "descricao": "Contra-indicado - risco de hemorragia"
    }
  ]
}
```

**Severidade:** `leve` | `moderada` | `grave`

**Usado por:** MedicationSelector

---

### 1.3 Pacientes

#### GET /api/pacientes/:id/proxima-consulta
Retorna data da próxima consulta

**Response:**
```json
{
  "pacienteId": "uuid",
  "horario": "2024-06-10T10:00:00",
  "especialidade": "Ortopedia",
  "medico": "Dr. Pedro"
}
```

**Usado por:** AdminCallPanel

---

#### GET /api/pacientes/:id/alergias
Retorna alergias registradas do paciente

**Response:**
```json
{
  "pacienteId": "uuid",
  "alergias": ["Penicilina", "Sulfas", "Ibuprofeno"],
  "comentarios": "Alergia leve a penicilina"
}
```

**Usado por:** MedicationSelector

---

#### GET /api/pacientes/:id/medicacoes-atuais
Retorna medicações que paciente está tomando

**Response:**
```json
{
  "pacienteId": "uuid",
  "medicacoes": [
    {
      "id": "uuid",
      "nome": "Losartana",
      "dosagem": "50mg",
      "via": "oral"
    }
  ]
}
```

**Usado por:** MedicationSelector

---

#### POST /api/pacientes/:id/prescricoes
Salva prescrição de medicação

**Request:**
```json
{
  "medicacaoId": "uuid",
  "posologia": "1 comprimido a cada 8h",
  "duracao": "7 dias",
  "dataInicio": "2024-06-05",
  "observacoes": "Tomar após as refeições"
}
```

**Response:**
```json
{
  "sucesso": true,
  "prescricaoId": "uuid",
  "mensagem": "Prescrição salva com sucesso"
}
```

---

### 1.4 WebSocket

#### /ws/queue
Conexão WebSocket para atualizações real-time da fila

**Mensagens enviadas pelo servidor:**

```json
{
  "tipo": "paciente_chamado",
  "pacienteId": "uuid",
  "pacienteNome": "João Silva",
  "sala": "01",
  "proximosPacientes": [...]
}
```

```json
{
  "tipo": "fila_atualizada",
  "totalAguardando": 12,
  "tempoMedioEspera": 15
}
```

```json
{
  "tipo": "paciente_concluido",
  "pacienteId": "uuid",
  "proximoPacienteId": "uuid",
  "proximoPacienteNome": "Maria Santos"
}
```

**Usado por:** TVDisplay (com fallback polling)

---

## 2. Estrutura de Dados

### Paciente
```typescript
interface Paciente {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  dataNascimento: Date;
  alergias: string[];
  medicacoesAtuais: string[];
  historico: Consulta[];
}
```

### Medicação
```typescript
interface Medicacao {
  id: string;
  nome: string;
  dosagem: string;
  via: 'oral' | 'injetável' | 'tópica' | 'intravenosa';
  fabricante: string;
  principioAtivo: string;
  indicacoes: string[];
  contraIndicacoes: string[];
  alergiasComuns: string[];
  interacoes: Interacao[];
}
```

### Chamada na Fila
```typescript
interface ChamadaFila {
  id: string;
  pacienteId: string;
  sala: string;
  chamadoEm: Date;
  status: 'chamado' | 'em_atendimento' | 'concluido';
  atendidoPor: string;
  concluidoEm?: Date;
}
```

### Prescrição
```typescript
interface Prescricao {
  id: string;
  pacienteId: string;
  medicacaoId: string;
  posologia: string;
  duracao: string;
  dataInicio: Date;
  dataFim?: Date;
  observacoes: string;
  criadoEm: Date;
}
```

---

## 3. Autenticação & Autorização

### Headers esperados
```
Authorization: Bearer {token}
Content-Type: application/json
```

### Roles necessárias
- **admin**: Acesso a todas as endpoints
- **recepcionista**: POST /api/fila/chamar
- **medico**: GET medicamentos, POST prescrições
- **viewer**: GET status endpoints (para TV)

### Implementação sugerida
```typescript
// middleware.ts - Next.js 14
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  if (!token && request.pathname.includes('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}
```

---

## 4. Variáveis de Ambiente

### .env.local (Frontend)
```bash
# API
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws

# Auth
NEXT_PUBLIC_AUTH_TOKEN=seu_token_inicial

# Features
NEXT_PUBLIC_ENABLE_TV_DISPLAY=true
NEXT_PUBLIC_POLLING_INTERVAL=5000
```

### .env (Backend)
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost/orthoclinic

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000,https://seu-dominio.com

# WebSocket
WS_ENABLED=true
WS_PING_INTERVAL=30

# Security
SECRET_KEY=sua_chave_secreta
JWT_ALGORITHM=HS256
```

---

## 5. Fluxo de Dados - Exemplos

### Fluxo 1: Chamar Próximo Paciente
```
1. Admin clica em "CHAMAR PRÓXIMO" (AdminCallPanel)
   ↓
2. Frontend: POST /api/fila/chamar { pacienteId, sala }
   ↓
3. Backend:
   - Valida paciente e sala
   - Cria ChamadaFila
   - Envia mensagem via WebSocket
   - Retorna sucesso
   ↓
4. TVDisplay recebe via WebSocket:
   - Paciente na tela
   - Próximos 3 pacientes
   - Animação suave
   ↓
5. QueueStatus atualiza:
   - Total aguardando - 1
   - Tempo médio ajustado
```

### Fluxo 2: Prescrever Medicação
```
1. Médico busca medicação (MedicationSelector)
   ↓
2. Frontend: GET /api/medicamentos?search=termo
   ↓
3. Seleciona medicação
   ↓
4. Frontend: POST /api/medicamentos/:id/interacoes
   - Verifica interações
   - Verifica contraindicações
   ↓
5. Médico preenche posologia e duração
   ↓
6. Frontend: POST /api/pacientes/:id/prescricoes
   ↓
7. Backend: Salva prescrição com histórico
   ↓
8. UI retorna sucesso com confirmação
```

---

## 6. Tratamento de Erros

### HTTP Status Codes esperados
- **200 OK**: Sucesso
- **400 Bad Request**: Validação falhou
- **401 Unauthorized**: Token inválido/expirado
- **403 Forbidden**: Sem permissão
- **404 Not Found**: Recurso não existe
- **409 Conflict**: Conflito (ex: paciente já chamado)
- **500 Internal Server Error**: Erro no servidor

### Exemplo de Error Response
```json
{
  "error": "Paciente já foi chamado",
  "code": "PATIENT_ALREADY_CALLED",
  "details": {
    "pacienteId": "uuid",
    "chamadoEm": "2024-06-05T14:30:00"
  }
}
```

### Implementação no Frontend
```typescript
// lib/api-client.ts
export async function apiCall(endpoint: string, options?: RequestInit) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        ...options?.headers,
      },
      ...options,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new ApiError(error.error, res.status, error.code);
    }

    return await res.json();
  } catch (error) {
    if (error instanceof ApiError) {
      toast.error(error.message);
      throw error;
    }
    toast.error('Erro de conexão');
    throw error;
  }
}
```

---

## 7. Performance & Otimizações

### Recomendações Backend
- ✅ Cache de medicações (Redis, 1 hora)
- ✅ Queries otimizadas com índices
- ✅ Connection pooling PostgreSQL
- ✅ Gzip compression
- ✅ CORS headers apropriados

### Recomendações Frontend
- ✅ Lazy loading de componentes
- ✅ Code splitting por página
- ✅ Image optimization
- ✅ Service Worker para offline
- ✅ Debounce em inputs

### Exemplo de Cache
```typescript
// Backend
from fastapi_cache2 import FastAPICache2
from fastapi_cache2.backends.redis import RedisBackend

@app.get("/api/medicamentos")
@cached(expire=3600)
async def search_medications(search: str):
    # Busca com cache de 1 hora
    pass
```

---

## 8. Testes

### Unit Tests (Frontend)
```typescript
// components/__tests__/MedicationSelector.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedicationSelector } from '@/components/MedicationSelector';

describe('MedicationSelector', () => {
  it('busca medicações com debounce', async () => {
    const mockApi = jest.fn();
    render(<MedicationSelector pacienteId="123" apiUrl="http://mock" />);
    
    const input = screen.getByPlaceholderText(/Digite o nome/);
    await userEvent.type(input, 'Dipirona');
    
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('Dipirona');
    });
  });
});
```

### API Tests (Backend)
```python
# tests/test_fila.py
def test_chamar_proximo_paciente(client, authenticated_headers):
    response = client.post(
        "/api/fila/chamar",
        json={"pacienteId": "uuid", "sala": "01"},
        headers=authenticated_headers
    )
    assert response.status_code == 200
    assert response.json()["sucesso"] == True
```

---

## 9. Deployment Checklist

- [ ] Variáveis de ambiente configuradas
- [ ] Database migrations executadas
- [ ] CORS headers configurados
- [ ] SSL/TLS habilitado
- [ ] Rate limiting ativado
- [ ] Logging centralizado setup
- [ ] Monitoring/alertas configurados
- [ ] Backups automáticos
- [ ] Health checks endpoints
- [ ] Documentation API (Swagger)

---

## 10. Suporte & Troubleshooting

### Problema: TVDisplay não atualiza
**Solução:**
1. Verificar WebSocket URL em NEXT_PUBLIC_WS_URL
2. Confirmar que backend suporta WebSocket
3. Verificar CORS headers
4. Frontend fallback para polling (automático)

### Problema: Medicações não encontradas
**Solução:**
1. Verificar `/api/medicamentos?search=termo` endpoint
2. Confirmar que medicações estão no banco
3. Aumentar limite de resultados
4. Verificar índices no PostgreSQL

### Problema: Interações não detectam
**Solução:**
1. Verificar dados de interações no banco
2. Confirmar POST `/api/medicamentos/:id/interacoes`
3. Validar array de `medicacoesAtuais` enviado

---

## Documentação Adicional

- [Componentes Guide](./frontend/components/COMPONENTS_GUIDE.md)
- [Custom Hooks](./frontend/lib/medication-hooks.ts)
- [Exemplos de Página](./frontend/pages/)
- [Tailwind Config](./frontend/tailwind.config.ts)

---

**Data:** 2024-06-05
**Versão:** 1.0.0
**Status:** Pronto para Development
