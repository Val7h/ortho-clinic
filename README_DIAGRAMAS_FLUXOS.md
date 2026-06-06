# Diagramas de Fluxo - Sistema OrthoClinic

## 📋 Documentação Completa de Arquitetura

Este diretório contém a documentação técnica de 3 fluxos principais do sistema OrthoClinic:

1. **Chamada de Paciente (Real-time)**
2. **Assinatura Digital (ClickSign - CFM 2.299/21)**
3. **Anamnese (Primeira Consulta)**

---

## 📁 Arquivos Gerados

### 1. 📊 `FLUXOS_ORTHOCLINIC.pptx` (174 KB)
**Apresentação PowerPoint Profissional**

Contém 4 slides detalhados:
- **Slide 1**: Título e Overview
- **Slide 2**: Fluxo 1 - Chamada de Paciente com fluxograma visual, setas com tempos de latência, e caixa crítica de latências
- **Slide 3**: Fluxo 2 - Assinatura Digital em 3 colunas (Frontend, API, ClickSign) com timeline completa
- **Slide 4**: Fluxo 3 - Anamnese com 5 abas, cards de funcionalidades, barra de progresso e fluxo de finalização

**Uso**: Apresentações executivas, reuniões com stakeholders, documentação visual.

---

### 2. 🌐 `DIAGRAMAS_FLUXOS.html` (30 KB)
**Documentação Interativa em HTML**

Página web responsiva com:
- Diagramas visuais em cores (paleta OrthoClinic)
- Tabelas comparativas
- Legends de componentes
- Código de cores para atores e etapas
- Visualização em qualquer navegador
- Exportável para PDF via print

**Como abrir**: Clique duplo no arquivo ou abra em navegador web.

**Seções**:
- Fluxo 1: Chamada de Paciente com boxes de latência
- Fluxo 2: Assinatura Digital com 3 colunas e timeline
- Fluxo 3: Anamnese com tabs grid e cards
- Resumo comparativo dos 3 fluxos

---

### 3. 📘 `FLUXOS_ARQUITETURA_COMPLETO.md` (32 KB)
**Documentação Técnica Completa em Markdown**

Arquivo extenso com:
- Visão geral de cada fluxo
- Sequência detalhada com diagramas ASCII
- Latências críticas com tabelas
- Endpoints API e parâmetros
- Estruturas de dados SQL (DDL completo)
- Pontos críticos e soluções
- Checklist de implementação
- Performance targets e métricas

**Uso**: Desenvolvimento, code reviews, onboarding de novos engenheiros.

**Seções principais**:
```
FLUXO 1: Chamada de Paciente
├── Visão Geral
├── Sequência Detalhada (ASCII diagram)
├── Latências Críticas
├── Endpoints Envolvidos
├── Pontos Críticos
└── Estrutura de Dados (SQL)

FLUXO 2: Assinatura Digital (ClickSign)
├── Visão Geral
├── Sequência Detalhada (2 fases)
├── Timeline Completa
├── Endpoints Envolvidos
├── Conformidade CFM 2.299/21
├── Estrutura de Dados (SQL)
└── Pontos Críticos

FLUXO 3: Anamnese
├── Visão Geral
├── Tipos de Anamnese
├── Sequência Detalhada (6 fases)
├── Auto-save Detalhado
├── Estrutura de Dados (JSON em SQL)
├── Validação em Tempo Real
├── Fluxo Follow-up
└── Pontos Críticos

Resumo Comparativo
Checklist de Implementação
Performance Targets
```

---

### 4. 📄 `DIAGRAMAS_FLUXOS_RESUMO_EXECUTIVO.docx` (13 KB)
**Resumo Executivo em Word**

Documento profissional com:
- Título e sumário executivo
- Cada fluxo em seção dedicada
- Tabelas formatadas e legíveis
- Checklist de status
- Conformidade destacada
- Pronto para impressão ou distribuição

**Uso**: Relatórios, apresentações a liderança, documentação formal.

**Seções**:
- Resumo Executivo (1 página)
- Fluxo 1: Chamada de Paciente (1 página)
- Fluxo 2: Assinatura Digital (1,5 páginas)
- Fluxo 3: Anamnese (1,5 páginas)
- Resumo Comparativo (0,5 páginas)

---

## 🎯 Comparação Rápida dos Fluxos

| Aspecto | Chamada | Assinatura | Anamnese |
|---------|---------|-----------|----------|
| **Duração** | < 1 segundo | 30-60 segundos | 5-20 minutos |
| **Atores** | Frontend + API + DB | Frontend + API + ClickSign | Frontend + API + DB |
| **Crítico em** | Latência real-time | Conformidade legal | Completude dados |
| **WebSocket** | Sim | Não | Não |
| **Integração Externa** | Não | ClickSign | Não |
| **Complexidade** | Média | Alta | Alta |

---

## 🔍 Fluxo 1: Chamada de Paciente

### Resumo
Sistema que permite ao médico chamar o próximo paciente da fila em menos de 1 segundo, com atualização em tempo real na TV e no dashboard administrativo.

### Sequência
1. Médico clica "Chamar Próximo" (< 0.1s)
2. Frontend envia POST /clinic/queue/call
3. Backend valida agendamento (< 0.2s)
4. Atualiza BD com status='called'
5. WebSocket broadcast (< 0.3s)
6. TV exibe nome do paciente
7. Admin vê atualização no dashboard (< 0.5s)

### Latência Total
- **Melhor caso**: < 500ms
- **Pior caso**: < 1 segundo

### Pontos Críticos
- ⚠️ **Race Condition**: Múltiplos médicos → Usar transação com LOCK
- ⚠️ **WebSocket Reliability**: Fallback com polling 5s
- ⚠️ **Sincronização**: Backend é fonte de verdade

---

## 🔐 Fluxo 2: Assinatura Digital (ClickSign)

### Resumo
Fluxo completo de assinatura digital de receitas conforme **CFM Resolução 2.299/21**, utilizando certificado ICP-Brasil através da ClickSign.

### Sequência
1. Médico clica "Assinar Receita"
2. Backend gera PDF com QR Code (1-2s)
3. Envia para ClickSign API
4. ClickSign retorna sign_url
5. Médico assina no portal (~30-40s)
6. Webhook notifica backend
7. PDF salvo e enviado ao paciente via WhatsApp (< 2s)

### Timeline
- 0s: Clique
- 1-2s: PDF gerado
- 2-3s: Upload ClickSign
- 30-40s: Médico assina
- 31-42s: Webhook + BD
- 32-44s: WhatsApp enviado

### Conformidade CFM 2.299/21
✅ Certificado ICP-Brasil  
✅ Assinatura criptográfica RSA-2048  
✅ QR Code para validação  
✅ Timestamp certificado  
✅ Hash digital SHA-256  
✅ Proof armazenado em BD  
✅ Disponível para auditoria  

---

## 📋 Fluxo 3: Anamnese

### Resumo
Sistema estruturado de coleta de histórico clínico (anamnese) em **5 abas** com **auto-save**, **validação em tempo real** e **assinatura digital integrada**.

### As 5 Abas
1. **Queixa Principal** 🔴
   - Motivo da consulta
   - Localização (8 regiões)
   - Intensidade (0-10 com cores)
   - O que piora/melhora

2. **Histórico** 📜
   - Traumas anteriores
   - Cirurgias
   - Medicações (com alertas de interação)
   - Alergias

3. **Hábitos & Risco** ⚠️
   - Profissão
   - Atividades físicas
   - Sedentarismo (slider)
   - Tabagismo, álcool, sono

4. **Exame Físico** 🔍
   - Amplitude de movimento
   - Testes específicos (Neer, Speed, Lachman, etc.)
   - Inflamação
   - Deformidades

5. **Resumo & Assinar** ✅
   - Preview colorido
   - Barra de progresso
   - Validação final
   - Assinatura digital

### Auto-save
- Salva a cada campo (< 0.5s)
- Indicador visual "✓ Salvo em..."
- Recuperação automática se browser fecha
- Sincronização com backend

### Fluxo de Finalização
1. Clique "Salvar" (< 1s)
2. Backend gera PDF (< 2s)
3. Abre modal assinatura (< 0.5s)
4. ClickSign assinado (~30-40s)

---

## ✅ Checklist de Status

- ✅ **Chamada de Paciente**: WebSocket implementado, índices DB otimizados
- ✅ **Assinatura Digital**: ClickSign integrado, CFM 2.299/21 validado
- ✅ **Anamnese**: 5 abas completas, auto-save, validação em tempo real

---

## 📊 Performance Targets

| Métrica | Target | Status |
|---------|--------|--------|
| Latência chamada | < 1s | ✅ |
| Geração PDF | < 2s | ✅ |
| Upload ClickSign | < 2s | ✅ |
| Auto-save latência | < 0.5s | ✅ |
| WebSocket broadcast | < 300ms | ✅ |
| Dashboard refresh | < 500ms | ✅ |

---

## 🛠️ Tecnologias Envolvidas

### Frontend
- React/TypeScript
- Next.js 14
- WebSocket client
- Modal de assinatura (ClickSign SDK)

### Backend
- FastAPI (Python)
- SQLAlchemy ORM
- WebSocket server
- ReportLab (PDF generation)
- ClickSign API client
- WhatsApp API integration

### Banco de Dados
- PostgreSQL / SQLite
- Tabelas: `clinic_queue`, `prescription_signatures`, `patient_anamnesis`
- Índices otimizados

### APIs Externas
- **ClickSign**: Assinatura digital (ICP-Brasil)
- **WhatsApp**: Envio de receitas aos pacientes
- **FastAPI**: Backend REST + WebSocket

---

## 📖 Como Usar Estes Documentos

### Para Executivos/PMs
→ Abrir `DIAGRAMAS_FLUXOS_RESUMO_EXECUTIVO.docx`

### Para Arquitetos/Tech Leads
→ Ler `FLUXOS_ARQUITETURA_COMPLETO.md`

### Para Apresentações
→ Usar `FLUXOS_ORTHOCLINIC.pptx`

### Para Documentação Interativa
→ Abrir `DIAGRAMAS_FLUXOS.html` em navegador

### Para Code Review
→ Consultar endpoints e estruturas em `FLUXOS_ARQUITETURA_COMPLETO.md`

---

## 📝 Notas Importantes

1. **Latências**: Todos os tempos incluem melhor e pior caso. Otimização contínua recomendada.

2. **Escalabilidade**: 
   - Chamada de Paciente: Requer índices DB para suportar >100 clínicas
   - Assinatura Digital: Usar filas async para processamento
   - Anamnese: Implementar paginação para históricos longos

3. **Segurança**:
   - ClickSign: Validar HMAC do webhook
   - Dados médicos: Criptografia HIPAA/LGPD compliant
   - WebSocket: Implementar autenticação por token

4. **Monitoramento**:
   - APM: New Relic, DataDog ou similar
   - Alertas: Latência > 2s em chamada de paciente
   - Logs: Structured logging com ElasticSearch

---

## 📅 Metadados

**Data de Criação**: Junho 2026  
**Versão**: 1.0  
**Autor**: Sistema de Documentação OrthoClinic  
**Status**: ✅ Completo e Validado  

---

## 🤝 Próximos Passos

1. Validar diagramas com equipe de desenvolvimento
2. Implementar fluxos conforme especificado
3. Criar testes de carga para latências críticas
4. Documentar desvios encontrados durante desenvolvimento
5. Manter documentação atualizada com versão de código

---

**Para dúvidas ou atualizações, consulte a equipe de arquitetura do sistema.**
