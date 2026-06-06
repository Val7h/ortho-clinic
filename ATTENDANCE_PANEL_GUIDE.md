# 🏥 Painel de Atendimento em Tempo Real - Guia Completo

## 📍 Localização
**URL**: https://ortho-frontend.onrender.com/painel

**Acesso**:
1. Dashboard → Clique em "Painel de Atendimento" (botão destacado em vermelho)
2. Ou acesse direto: /painel

---

## 🎯 O que é o Painel?

Sistema **em tempo real** para gerenciar o fluxo de atendimento da clínica com:
- ✅ **Cronômetro** durante cada consulta
- ✅ **Status em tempo real** de cada paciente
- ✅ **Controle de exames** (paciente sai, volta em X minutos)
- ✅ **Histórico** de atendimentos finalizados

---

## 🎨 Layout do Painel

```
┌─────────────────────────────────────────────────────────────────┐
│ Painel de Atendimento    [+ Adicionar Paciente]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📊 ESTATÍSTICAS:                                               │
│  ┌──────────┬──────────┬──────────┬──────────┐                  │
│  │ 🟦 3     │ 🟨 2     │ 🟪 1     │ 🟩 4     │                  │
│  │Aguardando│Atendendo │Exame     │Atendidos │                  │
│  └──────────┴──────────┴──────────┴──────────┘                  │
│                                                                   │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐  │
│  │ AGUARDANDO   │  │ EM ATENDIMENTO                          │  │
│  │ (3)          │  │ (2)                                     │  │
│  ├──────────────┤  ├─────────────────────────────────────────┤  │
│  │              │  │ Maria Silva              [00:15:32]    │  │
│  │ ○ Maria 1    │  │ ⏸️ Pausado                              │  │
│  │ ○ João 2     │  │ [Retomar] [Exame] [Finalizar] [❌]     │  │
│  │ ○ Ana 3      │  │                                         │  │
│  │              │  │ João Santos              [00:08:15]    │  │
│  │ [Iniciar]    │  │ 🎯 Em andamento                         │  │
│  │ [Iniciar]    │  │ [Pausar] [Exame] [Finalizar] [❌]      │  │
│  │ [Iniciar]    │  │                                         │  │
│  └──────────────┘  └─────────────────────────────────────────┘  │
│                                                                   │
│  🟪 FAZENDO EXAME (1):                                          │
│  ┌──────────────────┬──────────────────┐                       │
│  │ Pedro Oliveira   │ Roberto Alves    │                       │
│  │ Retorna em 12:45 │ Retorna em 03:20 │                       │
│  │ [Retornou]       │ [Retornou]       │                       │
│  └──────────────────┴──────────────────┘                       │
│                                                                   │
│  🟩 ATENDIDOS (4):                                              │
│  ┌────────┬────────┬────────┬────────┐                         │
│  │Ana~    │Felipe~ │Carla~  │Marcus~ │                         │
│  │[Remov.]│[Remov.]│[Remov.]│[Remov.]│                         │
│  └────────┴────────┴────────┴────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Como Usar

### **1️⃣ Adicionar Paciente ao Painel**

```
1. Clique em: "+ Adicionar Paciente"
2. Abrirá modal com dropdown
3. Selecione: "Maria Silva"
4. Clique em: "Adicionar"
5. ✅ Paciente aparece em "Aguardando"
```

**Resultado**:
```
AGUARDANDO (1)
├─ Maria Silva
│  └─ [Iniciar Atendimento]
```

---

### **2️⃣ Iniciar Atendimento**

```
1. Clique em: "Iniciar Atendimento" (paciente na seção Aguardando)
2. Paciente se move para "EM ATENDIMENTO"
3. ⏱️ CRONÔMETRO INICIA AUTOMATICAMENTE
```

**Resultado**:
```
EM ATENDIMENTO (1)
├─ Maria Silva              [00:00:15]  ← Cronômetro
│  └─ [Pausar] [Exame] [Finalizar] [❌]
```

**O Cronômetro mostra:**
- Minutos:Segundos em tempo real
- Atualiza a cada 1 segundo
- Horas (se consulta > 60 min)

---

### **3️⃣ Controlar a Consulta**

#### **Pausar Consulta** (se paciente temporariamente chamado)
```
1. Clique: [Pausar]
2. Cronômetro CONGELA
3. Badge mostra: "⏸️ Pausado"
4. Botão muda para: [Retomar]
```

#### **Retomar Consulta**
```
1. Clique: [Retomar]
2. Cronômetro CONTINUA de onde parou
3. Badge desaparece
4. Botão volta para: [Pausar]
```

#### **Enviar para Exame** (RX, ultrassom, etc)
```
1. Clique: [Enviar para Exame]
2. Paciente se move para seção "FAZENDO EXAME"
3. Inicia COUNTDOWN: "Retorna em 15:00"
4. ✅ Decresce a cada segundo
```

#### **Paciente Retorna de Exame**
```
1. Quando paciente volta, clique: [Retornou]
2. Paciente volta para seção "ATENDIDOS"
3. Badge "⏸️ Pausado" limpa
```

#### **Finalizar Atendimento**
```
1. Clique: [Finalizar]
2. Paciente se move para "ATENDIDOS" (cinza)
3. Mostra nome com strikethrough
4. Aparece [Remover] para limpar
```

#### **Remover Paciente**
```
1. Clique: [❌] ou [Remover]
2. Paciente é removido do painel
3. Desaparece de todas as seções
```

---

## 📊 Visão Detalhada das Seções

### **🔵 AGUARDANDO (Azul)**
- Pacientes na sala de espera
- Ordem: 1º a chegar é o 1º a atender
- **Ação**: [Iniciar Atendimento]

```
Estado: waiting
Cronômetro: ❌ Não
Ações: Iniciar, Remover
```

---

### **🟨 EM ATENDIMENTO (Amarelo)**
- Pacientes sendo atendidos AGORA
- **CRONÔMETRO RODANDO** ⏱️
- Botões de controle
- **Ação**: Pausar, Enviar para Exame, Finalizar

```
Estado: attending
Cronômetro: ✅ SIM (atualiza a cada 1s)
Ações: Pausar/Retomar, Enviar para Exame, Finalizar, Remover
Destaque: CARD GRANDE com cronômetro em destaque
```

---

### **🟪 FAZENDO EXAME (Roxo)**
- Pacientes saíram para exame
- **COUNTDOWN REGRESSIVO** (até o retorno)
- Padrão: 15 minutos
- **Ação**: [Retornou] quando volta

```
Estado: exam
Cronômetro: ✅ SIM (regressivo, decresce até 00:00)
Ações: Marcar como "Retornou"
Layout: Cards menores, lado a lado
Exemplo: "Retorna em 12:45"
```

---

### **🟩 ATENDIDOS (Verde)**
- Consultas finalizadas
- Nomes aparecem com strikethrough
- Background cinzento (desativado)
- **Ação**: [Remover] da lista

```
Estado: completed
Cronômetro: ❌ Não (consulta acabou)
Ações: Remover
Layout: Cards pequenos em grid
Aparência: Opaca/cinza
```

---

## ⏱️ Detalhes do Cronômetro

### **Formato**
```
HH:MM:SS (se consulta > 1 hora)
MM:SS   (se consulta < 1 hora)
```

### **Exemplos**
```
Tempo            Display
0 segundos    →  00:00
5 segundos    →  00:05
30 segundos   →  00:30
1 minuto      →  01:00
5 minutos     →  05:00
15 minutos    →  15:00
1 hora        →  01:00:00
1h 23min 45s  →  01:23:45
```

### **Atualizações**
- Atualiça **a cada 1 segundo** automaticamente
- Funciona mesmo se pausado
- Persiste ao recarregar página
- Armazenado em localStorage

---

## 💾 Dados Persistentes

### **O que é salvo:**
- ✅ Lista de pacientes no painel
- ✅ Status de cada paciente (waiting/attending/exam/completed)
- ✅ Tempo decorrido (cronômetro)
- ✅ Se está pausado ou não
- ✅ Tempo de retorno do exame

### **Onde é salvo:**
- localStorage do navegador
- Automaticamente a cada mudança
- **Persiste ao atualizar página**
- **Não persiste se limpar cache** (Ctrl+Shift+Delete)

### **Como recuperar:**
```javascript
// Abre DevTools (F12)
// Digita no console:
localStorage.getItem('painel_pacientes')
```

---

## 🎮 Exemplos de Fluxo Completo

### **Exemplo 1: Consulta Normal (15 min)**
```
1. [+ Adicionar] Maria Silva
   Status: waiting

2. Clique: [Iniciar Atendimento]
   Status: attending
   Timer: 00:00 → 00:15

3. Clique: [Finalizar]
   Status: completed
   (Maria Silva aparece em ATENDIDOS com strikethrough)
```

---

### **Exemplo 2: Consulta com Pausa**
```
1. Adicionado João Santos
   Status: waiting

2. Clique: [Iniciar Atendimento]
   Status: attending
   Timer: 00:00 → 00:05

3. Médico precisa atender telefone
   Clique: [Pausar]
   Timer: CONGELA em 00:05
   Badge: "⏸️ Pausado"

4. Retorna ao paciente
   Clique: [Retomar]
   Timer: CONTINUA de 00:05 → 00:08

5. Clique: [Finalizar]
   Status: completed
```

---

### **Exemplo 3: Consulta com Exame**
```
1. Adicionado Pedro Oliveira
   Status: waiting

2. Clique: [Iniciar Atendimento]
   Status: attending
   Timer: 00:00 → 00:12

3. Precisa fazer RX
   Clique: [Enviar para Exame]
   Status: exam
   Countdown: "Retorna em 15:00" → 14:59 → ... → 00:01 → 00:00

4. Paciente retorna com RX
   Clique: [Retornou]
   Status: completed
   (Muda para ATENDIDOS)
```

---

## 📱 Dados dos 10 Pacientes de Teste

```
ID  Nome                    Telefone        Email
1   Maria Silva             11999999001     maria@email.com
2   João Santos             11999999002     joao@email.com
3   Ana Costa               11999999003     ana@email.com
4   Pedro Oliveira          11999999004     pedro@email.com
5   Carla Mendes            11999999005     carla@email.com
6   Roberto Alves           11999999006     roberto@email.com
7   Juliana Rocha           11999999007     juliana@email.com
8   Felipe Gomes            11999999008     felipe@email.com
9   Luciana Ferreira        11999999009     luciana@email.com
10  Marcus Vieira           11999999010     marcus@email.com
```

---

## 🎨 Design & Dark Mode

- ✅ **Dark Mode Completo** - Funciona em light/dark
- ✅ **Cores Semânticas** - Cada status tem cor própria
- ✅ **Responsive** - Funciona em mobile/tablet/desktop
- ✅ **Acessível** - WCAG AAA compliant
- ✅ **Tema Persiste** - Não reseta ao abrir painel

---

## 🔧 Funcionalidades Futuras (Roadmap)

- [ ] Sincronizar com API backend
- [ ] Salvar histórico de atendimentos
- [ ] Gráficos de tempo médio por consulta
- [ ] Alertas sonoros quando paciente retorna de exame
- [ ] QR Code para check-in de pacientes
- [ ] Integração com agenda
- [ ] Relatórios diários
- [ ] Múltiplas salas de atendimento

---

## 🆘 Troubleshooting

### **Cronômetro não aparece**
- ✅ Verifique se paciente está em "EM ATENDIMENTO"
- ✅ Clique em [Iniciar Atendimento]

### **Painel vazio**
- ✅ Clique em [+ Adicionar Paciente]
- ✅ Selecione qualquer paciente da lista

### **Dados desapareceram ao atualizar**
- ✅ Se limpou cache (Ctrl+Shift+Delete), dados foram perdidos
- ✅ Adicione pacientes novamente
- ✅ localStorage é limpo ao limpar dados do navegador

### **Timer parou**
- ✅ Atualize a página (F5)
- ✅ Se pausado, clique [Retomar]

---

## 📞 Support

Para dúvidas ou melhorias, comunique ao desenvolvedor!

---

**Status**: 🟢 LIVE E OPERACIONAL  
**Data**: 2026-06-05  
**Versão**: 1.0

Aproveite o painel! 🏥✨
