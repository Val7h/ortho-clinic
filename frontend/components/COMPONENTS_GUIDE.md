# OrthoClinic Phase 1 Components Guide

## Visão Geral

Quatro componentes React TypeScript profissionais para gerenciamento de fila de pacientes e prescrição de medicações.

## 1. TVDisplay.tsx

### Propósito
Display full-screen para sala de espera mostrando o paciente sendo atendido e próximos pacientes.

### Props
```typescript
interface TVDisplayProps {
  apiUrl?: string;           // URL base da API (default: env var)
  updateInterval?: number;   // Intervalo de polling em ms (default: 5000)
  wsUrl?: string;           // URL do WebSocket (default: env var)
}
```

### Features
- ✅ Nome do paciente em 80%+ da tela
- ✅ WebSocket real-time com fallback HTTP polling
- ✅ Animação suave ao chamar novo paciente
- ✅ Próximos 3 pacientes visíveis
- ✅ Timestamp da última chamada
- ✅ Responsivo para 1920x1080 e 4K
- ✅ Dark theme sem UI clutter
- ✅ Indicador de status de conexão

### Uso
```typescript
import { TVDisplay } from '@/components/TVDisplay';

export default function SalaEsperaPage() {
  return <TVDisplay />;
}
```

### Endpoints esperados
```
GET /api/fila/status
{
  "pacienteAtual": {
    "id": "string",
    "nome": "string",
    "sala": "string"
  },
  "proximosPacientes": [
    { "id": "string", "nome": "string", "sala": "string", "horario": "string" }
  ],
  "chamadaEm": "ISO8601 timestamp"
}

WebSocket: /ws/queue
{
  "tipo": "paciente_chamado",
  "pacienteId": "string",
  "pacienteNome": "string",
  "sala": "string",
  "proximosPacientes": [...]
}
```

---

## 2. AdminCallPanel.tsx

### Propósito
Painel administrativo para chamar pacientes e visualizar histórico de chamadas.

### Props
```typescript
interface AdminCallPanelProps {
  apiUrl?: string;
  onCallSuccess?: (paciente: QueuePatient) => void;
}
```

### Features
- ✅ Dropdown seletor de próximo paciente
- ✅ Grid de seleção de salas
- ✅ Botão "CHAMAR PRÓXIMO" grande e destacado
- ✅ Histórico dos últimos 5 chamados com timestamps
- ✅ Indicador tempo até próxima consulta (com cores)
- ✅ Status de conexão visível
- ✅ Validações visuais
- ✅ Dark mode completo

### Uso
```typescript
import { AdminCallPanel } from '@/components/AdminCallPanel';

export default function AdminPage() {
  return (
    <div className="p-6">
      <AdminCallPanel 
        onCallSuccess={(patient) => console.log('Chamado:', patient)}
      />
    </div>
  );
}
```

### Endpoints esperados
```
GET /api/fila/aguardando
{
  "pacientes": [
    { "id": "string", "nome": "string", "sala": "string", "tempoEspera": number }
  ]
}

GET /api/fila/historico?limite=5
{
  "historico": [
    {
      "id": "string",
      "pacienteNome": "string",
      "sala": "string",
      "chamadoEm": "ISO8601",
      "status": "chamado" | "em_atendimento" | "concluido"
    }
  ]
}

POST /api/fila/chamar
Request: {
  "pacienteId": "string",
  "sala": "string"
}
Response: {
  "sucesso": true,
  "mensagem": "string"
}

GET /api/pacientes/:id/proxima-consulta
{
  "horario": "ISO8601 timestamp"
}
```

---

## 3. QueueStatus.tsx

### Propósito
Widget compacto ou expandido mostrando status da fila com indicadores visuais.

### Props
```typescript
interface QueueStatusProps {
  apiUrl?: string;
  updateInterval?: number; // default: 10000
  compact?: boolean;        // default: false
}
```

### Features
- ✅ Contagem de pacientes aguardando
- ✅ Tempo médio e máximo de espera
- ✅ Indicador de atraso com 3 níveis (verde/amarelo/vermelho)
- ✅ Estimativa de tempo para próximo paciente
- ✅ Barra de progresso visual
- ✅ Alert automático se atrasos > 50%
- ✅ Versão compacta (para sidebar) e expandida (para dashboard)
- ✅ Atualização real-time

### Uso
```typescript
import { QueueStatus } from '@/components/QueueStatus';

// Versão compacta em sidebar
<QueueStatus compact={true} />

// Versão expandida em dashboard
<QueueStatus compact={false} />
```

### Lógica de cores
- **Verde** (0-20% atraso): "No prazo"
- **Amarelo** (20-50% atraso): "Ligeiro atraso"
- **Vermelho** (>50% atraso): "Atrasos significativos"

### Endpoints esperados
```
GET /api/fila/status-rapido
{
  "totalAguardando": number,
  "tempoMedioEspera": number,      // em minutos
  "maiorTempoEspera": number,      // em minutos
  "atrasoPercentual": number,      // 0-100
  "estimadoParaAtender": number    // em minutos
}
```

---

## 4. MedicationSelector.tsx

### Propósito
Componente inteligente para busca, seleção e prescrição de medicações com alertas de interações e contraindicações.

### Props
```typescript
interface MedicationSelectorProps {
  pacienteId: string;
  pacienteAlergias?: string[];
  medicacoesAtuais?: string[];    // IDs de medicações em uso
  onMedicationAdd?: (medicacao: MedicacaoSelecionada) => void;
  onMedicationRemove?: (medicacaoId: string) => void;
  apiUrl?: string;
}
```

### Features
- ✅ Autocomplete com debounce (300ms)
- ✅ Busca em tempo real via API
- ✅ Exibe: nome, dosagem, via, fabricante
- ✅ Alerta de INTERAÇÕES (badges coloridos por severidade)
- ✅ Alerta de CONTRAINDICAÇÃO (alergia registrada)
- ✅ Input para posologia
- ✅ Input para duração
- ✅ Validação visual e bloqueia envio com problemas
- ✅ Lista de medicações selecionadas com remoção
- ✅ Dark mode completo
- ✅ Otimizado com useMemo e useCallback

### Uso
```typescript
import { MedicationSelector } from '@/components/MedicationSelector';

export default function PrescricaoPage({ pacienteId }: { pacienteId: string }) {
  const [medicacoes, setMedicacoes] = useState<Medicacao[]>([]);

  return (
    <MedicationSelector
      pacienteId={pacienteId}
      pacienteAlergias={['Penicilina', 'Sulfas']}
      medicacoesAtuais={['med1', 'med2']}
      onMedicationAdd={(med) => {
        setMedicacoes([...medicacoes, med]);
        console.log('Adicionado:', med);
      }}
      onMedicationRemove={(id) => {
        setMedicacoes(medicacoes.filter(m => m.id !== id));
      }}
    />
  );
}
```

### Severidade de Interações
- **Grave** (vermelho): Impossibilita prescrição
- **Moderada** (amarelo): Alerta visual, mas permite prescrição
- **Leve** (azul): Apenas informatvo

### Endpoints esperados
```
GET /api/medicamentos?search=:termo&limite=10
{
  "medicamentos": [
    {
      "id": "string",
      "nome": "string",
      "dosagem": "string",
      "via": "oral" | "injetável" | "tópica" | "intravenosa",
      "fabricante": "string"
    }
  ]
}

POST /api/medicamentos/:id/interacoes
Request: {
  "medicacoesAtuais": ["id1", "id2"]
}
Response: {
  "interacoes": [
    {
      "medicacao": "string",
      "severidade": "leve" | "moderada" | "grave",
      "descricao": "string"
    }
  ]
}
```

---

## Integração com Themes

Todos os componentes utilizam Tailwind CSS dark mode automático via classe `dark` no elemento `<html>`.

### Cores utilizadas
- **Brand**: #0F2D5E (primary dark blue)
- **Accent**: #06B6D4 (teal)
- **Success**: #22C55E (green)
- **Warning**: #EAB308 (amber)
- **Error**: #EF4444 (red)
- **Slate**: neutrals

### Exemplo de setup
```typescript
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

---

## Performance & Otimizações

### TVDisplay
- ✅ WebSocket com fallback automático
- ✅ useMemo para formatação de timestamps
- ✅ Cleanup de conexões em unmount
- ✅ Debounce em reconexão

### AdminCallPanel
- ✅ useCallback em funções críticas
- ✅ Polling a cada 10s
- ✅ Preseleciona primeiro paciente
- ✅ Toast notifications para feedback

### QueueStatus
- ✅ useMemo para cálculo de cores
- ✅ Atualização condicional
- ✅ Versão compacta otimizada

### MedicationSelector
- ✅ Debounce em search (300ms)
- ✅ useMemo para lógica de cores
- ✅ useCallback em handlers
- ✅ Cleanup de timeouts
- ✅ Validação visual antes do envio

---

## Accessibility

- ✅ Botões com aria-labels
- ✅ Form inputs com labels explícitas
- ✅ Cores de status acessíveis
- ✅ Focus rings visíveis
- ✅ Feedback visual/toast em ações

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Responsive até 320px (mobile) até 4K

---

## Troubleshooting

### WebSocket não conecta
1. Verificar NEXT_PUBLIC_WS_URL
2. Verificar se backend suporta WebSocket
3. Component fallback para polling automático

### API 404s
1. Verificar NEXT_PUBLIC_API_URL
2. Confirmar endpoints no backend
3. Verificar CORS headers

### Medicações não aparecem
1. Verificar `/api/medicamentos?search=` endpoint
2. Confirmar que API retorna `medicamentos` array
3. Verificar debounce timing

---

## Exemplos completos de página

Ver `/pages/salas-espera.example.tsx` e `/pages/admin.example.tsx` para implementações completas.
