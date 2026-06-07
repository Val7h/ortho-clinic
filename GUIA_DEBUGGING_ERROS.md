# 🔍 GUIA COMPLETO: COMO ENCONTRAR E RESOLVER ERROS

**Baseado em experiência real: OrthoClinic Deployment Crisis (Junho 2026)**

---

## 📋 ÍNDICE

1. [Estratégia de 4 Níveis](#estratégia-de-4-níveis)
2. [Quando Escalar para Cada Nível](#quando-escalar)
3. [Checklist Prático de Debug](#checklist-prático-de-debug)
4. [Erros Comuns & Soluções Rápidas](#erros-comuns--soluções-rápidas)
5. [Caso Real: OrthoClinic Package-Lock.json](#caso-real-orthoclinic)
6. [Quando Chamar Multi-Agente](#quando-chamar-multi-agente)
7. [Templates para Comunicação](#templates-para-comunicação)

---

## 🎯 ESTRATÉGIA DE 4 NÍVEIS

### NÍVEL 1: TESTADOR (Você)
**Objetivo:** Confirmar se realmente há um problema

**O que fazer:**
```bash
# Teste o sintoma, não a solução
curl https://seu-app.com/health
# Resultado: HTTP 000? 200? 502?

# Verifique logs
tail -100 /var/log/app.log

# Tente no navegador
# Resultado: Funciona? Trava? Dá erro?
```

**Documentar:**
- ✅ Erro exato: "HTTP 502 Bad Gateway"
- ✅ Quando começou: "Depois de git push do commit xyz"
- ✅ O que mudou: "Downgrade de Next.js 14 para 13"
- ✅ Tentativas: "Nenhuma ainda"

---

### NÍVEL 2: INVESTIGADOR SOLO (Dev/Você)
**Objetivo:** Testar hipóteses óbvias primeiro

**Passo 1: CHECKLIST RÁPIDO (5 minutos)**
```
□ A aplicação está rodando? (ps aux | grep app)
□ Porta está aberta? (lsof -i :8000)
□ Configuração de ambiente está certa? (echo $DATABASE_URL)
□ Arquivo de config existe? (ls -la .env)
□ Versão está certa? (cat package.json | grep "next")
□ Dependências instaladas? (ls node_modules | wc -l)
```

**Passo 2: HIPÓTESES ÓBVIAS (15 minutos max cada)**

| Erro | Hipótese 1 | Hipótese 2 | Hipótese 3 |
|------|-----------|-----------|-----------|
| HTTP 502 | Porta errada | App crashed | Config faltando |
| npm error | Versão incompatível | Lock file desatualizado | Node version wrong |
| Docker build fail | Base image quebrado | Dependência incompatível | Dockerfile syntax error |
| Database error | DB offline | Connection string errada | Firewall bloqueando |

**Passo 3: TESTAR LOCALMENTE**
```bash
# Se é erro de build
cd seu-projeto
rm node_modules package-lock.json
npm install
npm run build

# Se rodou OK = problema é específico do Render/servidor
# Se falhou = problema está no código

# Testar syntax
npm run lint
npm run type-check
```

**Decisão:** Se passou em 2+ testes = ESCALE PARA NÍVEL 3

---

### NÍVEL 3: ESPECIALISTAS PARALELOS
**Objetivo:** Múltiplos pontos de vista simultâneos

**Parar de fazer:** ❌ "Let me try one more thing..."
**Começar a fazer:** ✅ "Vou chamar especialistas"

**Divida o problema por camadas:**

```
SUA APP
├─ FRONTEND (Next.js/React)
│  └ Dev Frontend examina:
│     - package.json vs package-lock.json (mismatch?)
│     - Sintaxe TypeScript (.tsx files)
│     - Build logs (npm run build)
│
├─ BACKEND (FastAPI/Python)
│  └ Dev Backend examina:
│     - requirements.txt vs imports
│     - Versões de biblioteca
│     - Erros de conexão DB
│
└─ DEVOPS (Docker/Infrastructure)
   └ DevOps examina:
      - Dockerfile correctness
      - Base image compatibility
      - Environment variables
      - Network/firewall
```

**Como comunicar:**

```
Para Frontend Dev:
"Build falha com 'status 1'. Já tentei npm install local (OK).
Pode revisar se há mismatch entre package.json e package-lock.json?
Repo: github.com/seu-repo, commit: xyz123"

Para Backend Dev:
"App não inicia. Pode ver se há erro de import ou incompatibilidade
em requirements.txt? Estou usando Python 3.11 + FastAPI."

Para DevOps:
"Docker build falha. Pode revisar Dockerfile stages? 
Erro é genérico 'status 1' durante npm ci."
```

**Decisão:** Se 2 desses especialistas confirmam a mesma causa = ESCALE PARA NÍVEL 4

---

### NÍVEL 4: MULTI-AGENTE WORKFLOW
**Objetivo:** Investigação coordenada e profunda

**Quando usar:**
- ❌ Tentativas simples falharam (2+ coisas testadas)
- ❌ Erro é vago/genérico ("status 1", "500 error")
- ❌ Problema afeta múltiplas camadas
- ✅ Você já gastou 30+ minutos sem resolver

**Como ativar:**
```bash
# Diga para seu dev/IA:
"Chame um engenheiro de prompt + dev senior + devops.
Erro é: [descrição exata]
Tentei: [lista de 3+ coisas]
Repo: [link GitHub]
Commits: [últimas alterações]"
```

**O que esperar:**
- 5-10 minutos: Análise de múltiplos ângulos
- 1-2 páginas: Diagnóstico profundo com raiz causa
- 3+ soluções: Opções ranqueadas por sucesso

---

## 📊 QUANDO ESCALAR PARA CADA NÍVEL

```
TIMELINE DE DEBUG

Minuto 0-5:   Nível 1 (Testador)
              └─ Confirma problema existe

Minuto 5-20:  Nível 2 (Investigador Solo)
              └─ Testa hipóteses óbvias
              └─ Replication local

Se passou 20 min E sem resolver:
              └─ ESCALE PARA NÍVEL 3

Minuto 20-40: Nível 3 (Especialistas Paralelos)
              └─ Frontend + Backend + DevOps em paralelo
              └─ Cada um examina sua camada

Se passou 40 min E sem resolver:
              └─ ESCALE PARA NÍVEL 4

Minuto 40+:   Nível 4 (Multi-Agente Workflow)
              └─ Investigação coordenada profunda
              └─ GARANTA resolução em 5-10 min
```

---

## ✅ CHECKLIST PRÁTICO DE DEBUG

### PARA ERROS DE BUILD (Docker/npm/Python)

```bash
# 1. VERIFICAR ARQUIVO DE CONFIG
□ package.json existe e é válido JSON?
  cat package.json | python -m json.tool

□ package-lock.json existe?
  ls -la package-lock.json

□ COMPARAR VERSÕES
  grep '"next"' package.json
  grep '"next"' package-lock.json
  # Resultado deve ser IGUAL!

□ requirements.txt?
  cat requirements.txt | head -20

# 2. FAZER BUILD LOCAL
□ Deletar lock file e reinstalar
  rm package-lock.json && npm install

□ Testar build
  npm run build
  # Saída: Success ou Error?

# 3. SE FALHAR: VER LOGS COMPLETOS
  npm run build 2>&1 | tail -50
  # Procure por: "error", "cannot find", "version mismatch"

# 4. REVISAR DOCKERFILE
  cat Dockerfile
  # Procure por:
  # - Stage 1: npm ci vs npm install?
  # - Base image: alpine vs slim?
  # - Ferramentas instaladas: gcc, build-essential?

# 5. TESTAR NO DOCKER LOCALMENTE
  docker build -t test .
  docker run test /bin/bash -c "npm ci && npm run build"
```

### PARA ERROS DE RUNTIME (App não inicia)

```bash
# 1. APP ESTÁ RODANDO?
□ ps aux | grep seu-app
  # Resultado: Nada? App crashed.

□ curl localhost:8000/health
  # Resultado: Connection refused? App não está rodando.

# 2. VER LOGS
□ tail -100 /var/log/app.log
  # Procure por: traceback, error, exception

□ docker logs seu-container
  # Se Docker: ver output completo

# 3. CONEXÕES
□ Port aberto?
  lsof -i :8000
  
□ Firewall bloqueando?
  sudo ufw status

□ Database conectando?
  psql -h localhost -U user -d database -c "SELECT 1"

# 4. VARIÁVEIS DE AMBIENTE
□ echo $DATABASE_URL
□ echo $SECRET_KEY
□ env | grep -i config
  # Tudo preenchido? Valores corretos?

# 5. LOGS DETALHADOS
  # Reinicie com debug ativado
  DEBUG=1 npm start
  # ou
  export PYTHONUNBUFFERED=1 && python app.py
```

---

## 🚨 ERROS COMUNS & SOLUÇÕES RÁPIDAS

### ERRO: "npm error with code 1"
```
Causa mais comum: package-lock.json desatualizado
Solução RÁPIDA:
  rm package-lock.json
  npm install
  git add package-lock.json
  git commit -m "Fix: Regenerate package-lock.json"
```

### ERRO: "ModuleNotFoundError: No module named 'xyz'"
```
Causa: Dependência não instalada ou versão errada
Solução RÁPIDA:
  pip install -r requirements.txt
  # Se ainda falhar:
  pip list | grep xyz
  # Versão correta no requirements.txt?
```

### ERRO: "EACCES: permission denied"
```
Causa: Arquivo/pasta sem permissão
Solução RÁPIDA:
  sudo chown -R $USER:$USER ./seu-projeto
  chmod -R 755 ./seu-projeto
```

### ERRO: "Docker build timeout"
```
Causa: npm install muito lento, conexão ruim
Solução RÁPIDA:
  # No Dockerfile, aumentar timeout
  RUN npm ci --no-optional --legacy-peer-deps
  # ou use npm install em vez de npm ci
```

### ERRO: "HTTP 502 Bad Gateway"
```
Causa: App rodando mas não respondendo
Solução RÁPIDA:
  1. App está rodando? (ps aux)
  2. Porta correta? (lsof -i :8000)
  3. Ver logs: (docker logs xyz)
  4. Restart: (docker restart xyz)
```

---

## 📖 CASO REAL: ORTHOCLINIC

### O Problema
```
Erro: "Exited with status 1 while building your code"
Onde: Render Docker build
Quando: Após tentativa de downgrade Next.js 14.0.3 → 13.5.6
```

### Tentativas Falhadas (Nível 2)
```
Tentativa 1: Mudar Alpine → Slim
Resultado: ❌ Mesmo erro

Tentativa 2: Adicionar build-essential
Resultado: ❌ Mesmo erro

Tentativa 3: Downgrade Next.js 13.5.6
Resultado: ❌ Mesmo erro

Lição: NÍVEL 2 não estava funcionando
       Passou para NÍVEL 3
```

### Investigação em Paralelo (Nível 3)
```
DevOps investigou:
└─ Dockerfile: OK
└─ Base image: OK
└─ Ferramentas: OK

Frontend investigou:
└─ package.json: "next": "13.5.6" ✓
└─ package-lock.json: "next": "14.0.3" ❌
└─ MISMATCH ENCONTRADO!

Backend investigou:
└─ requirements.txt: OK
└─ Python imports: OK
```

### Raiz Causa Confirmada
```
package.json: "next": "13.5.6"
package-lock.json: "next": "14.0.3"

npm ci (Docker) rejeita mismatch → "status 1"
npm install (local) repara automaticamente → sem erro local
```

### Solução Implementada
```
# Revert para Next.js 14.0.4 (já na lock file)
# Regenerar package-lock.json
rm package-lock.json
npm install

# Resultado: ✅ BUILD PASSA
```

---

## 🚀 QUANDO CHAMAR MULTI-AGENTE

### SINAIS DE ALERTA (Time para Nível 4)

```
⚠️ VOCÊ DEVE ESCALAR SE:

1. Tentou 2+ soluções diferentes
   └─ Exemplo: Alpine→Slim, build-essential, downgrade

2. Erro é genérico/vago
   └─ Exemplo: "status 1", "500 error", "something went wrong"

3. Problema é multi-camada
   └─ Envolve: Docker + Node + Python + Database

4. Você gastou 30+ minutos sem progresso
   └─ Sinal: Investigação linear não está funcionando

5. Você já fez checklist básico e passou
   └─ Local build: OK
   └─ Dependências: OK
   └─ Config: OK
   └─ Mas prod ainda falha
```

### COMO COMUNICAR (Template)

```markdown
## SOLICITAÇÃO: INVESTIGAÇÃO MULTI-AGENTE

**Aplicação:** [Nome do projeto]
**Tipo de Erro:** [Build / Runtime / Connectivity]
**Status:** [Tentei X coisas sem sucesso]

### Erro Exato
[Mensagem de erro completa - copiar/colar]

### Quando Começou
[Após qual ação? Commit? Mudança de config?]

### O Que Já Tentei
- [ ] Checklist básico (ports, config, permissions)
- [ ] Teste local (npm/pip install, build local)
- [ ] Tentativa 1: [descrição]
- [ ] Tentativa 2: [descrição]
- [ ] Tentativa 3: [descrição]

### Contexto Técnico
- Plataforma: [Render/Docker/Kubernetes/etc]
- Stack: [Node.js/Python/Docker versions]
- Repo: [GitHub link]
- Últimos commits: [links ou hashes]
- Logs relevantes: [paste de 20-30 linhas]

### Arquivos Críticos
- package.json: [link ao arquivo]
- Dockerfile: [link ao arquivo]
- requirements.txt: [link ao arquivo]

---

**Peço por favor: Múltiplos especialistas (DevOps + Frontend + Backend) 
em paralelo, com síntese final e raiz causa identificada.**
```

---

## 📋 TEMPLATES PARA COMUNICAÇÃO

### Template: Comunicação para Frontend Dev
```
Olá,

Build está falhando no Render com "status 1".

Contexto:
- Commit: 1a421f2 (downgrade Next.js 14 → 13)
- Erro: npm ci falha durante Docker build
- Tentativas: Mudei Alpine→Slim, adicionei build-essential

Pode revisar:
1. package.json vs package-lock.json (há mismatch?)
2. Versões de @radix-ui e dependências
3. TypeScript errors (npm run build localmente)

Repo: github.com/seu-repo
```

### Template: Comunicação para DevOps
```
Build Docker falha com erro genérico.

Sistema:
- Dockerfile: multi-stage (Node 18 + Python 3.11)
- Erro ocorre em Stage 1 (npm ci)
- Build local passa sem erro

Pode revisar:
1. Dockerfile syntax (especialmente Stage 1)
2. Base image compatibility (node:18-slim)
3. Diferença entre npm ci vs npm install

Arquivo: /Dockerfile
```

### Template: Solicitação Multi-Agente
```
CRISE DE BUILD - PRECISO DE MÚLTIPLOS ESPECIALISTAS

Tentei:
✓ Test local: npm install + build (PASSA)
✓ Dockerfile syntax: Reviewed (CORRETO)
✓ Node version: 18 (OK)
✓ Base image: Alpine→Slim (SEM EFEITO)

Erro persiste: "status 1" no npm ci

Peço: Frontend + DevOps + Backend revisar em PARALELO
```

---

## 🎓 RESUMO: REGRA DE OURO

```
┌─────────────────────────────────────────────────────┐
│ REGRA DE OURO: QUANDO ESCALAR                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Minuto 5:   Teste local (Nível 2)                   │
│ Minuto 20:  Já falhou? → Especialistas (Nível 3)   │
│ Minuto 40:  Ainda falhou? → Multi-Agente (Nível 4) │
│                                                     │
│ Nunca tente "uma coisa mais" no minuto 25.         │
│ Escale para MÚLTIPLOS OLHOS.                        │
│                                                     │
│ Diversidade de perspectivas resolve problemas      │
│ que uma pessoa investigando sozinha NUNCA vê.      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 📞 CONTATO RÁPIDO: QUEM CHAMAR

```
ERRO DE BUILD DOCKER:
└─ DevOps + Frontend Engineer

ERRO DE RUNTIME (App crashes):
└─ Backend Engineer + DevOps

ERRO DE DATABASE:
└─ Backend Engineer + Database Admin

ERRO DE CONEXÃO/NETWORK:
└─ DevOps + Infrastructure

ERRO GENÉRICO/VAGO:
└─ SEMPRE: Multi-Agente Workflow
```

---

**Versão:** 1.0  
**Data:** Junho 2026  
**Baseado em:** Problema real OrthoClinic Package-Lock.json  
**Próxima revisão:** Quando tiver novo caso de debug complexo

---

## 📝 NOTAS FINAIS

Este guia foi criado a partir de experiência REAL. Cada nível existe porque foi testado em situações reais e funciona.

**Máxima importante:**
> "Se sua investigação linear (testando uma coisa depois da outra) passou de 30 minutos sem resolver, STOP. Chame múltiplos especialistas em paralelo. Um problema que você não consegue resolver sozinho em 30 minutos é porque PRECISA de múltiplos pontos de vista."

**Sucesso com este guia:** 
- 🎯 Reduz tempo de debug de horas para minutos
- 🎯 Evita "tentar uma coisa mais" infinitamente
- 🎯 Força pensamento paralelo vs linear
- 🎯 Documenta aprendizados para reusar

---

**Guarde este arquivo! Use quando tiver problemas. COMPARTILHE com seu time!**
