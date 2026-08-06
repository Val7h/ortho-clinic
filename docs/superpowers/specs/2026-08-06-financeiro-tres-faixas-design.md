# Financeiro em três faixas — R$ por hora de grade

Data: 06/08/2026
Autor: Claude, a pedido do Dr. Valth
Status: aprovado no desenho; aguardando plano de implementação

## O problema

A página Financeiro hoje soma o que entrou, mostra formas de pagamento e
demografia de pacientes. Nenhum desses números responde a pergunta que o Valth
faz de verdade: **onde é que a minha hora rende mais?**

Faturamento absoluto por clínica é uma métrica enganosa aqui. O CTO sempre vai
liderar, porque é onde ele passa mais horas — isso mede volume de presença, não
rentabilidade. A clínica em que ele passa 4 horas e fatura R$ 2.400 é melhor do
que aquela em que passa 8 e fatura R$ 3.000, e o painel atual esconde isso.

Além disso, o registro financeiro não sabe **o que** foi vendido: uma consulta
de R$ 400 e uma infiltração de R$ 400 são a mesma linha. Sem isso não existe
resposta para "quanto o procedimento me rende".

## A régua: R$ por hora de grade

A medida principal da página é **faturamento dividido por hora de consultório
bloqueada na grade**, por turno.

Hora de grade (e não hora efetivamente atendida) porque:

- é a hora que o Valth reservou da vida dele, esteja ela preenchida ou não —
  turno vazio *deve* pesar contra o turno;
- é estável e comparável mês a mês; hora atendida oscila com o registro da sala
  de espera, que ainda não é 100% confiável;
- não depende de nenhum dado novo: já está em `clinic_schedules`.

Uma linha de `clinic_schedules` **é** um turno. Não é preciso criar entidade
nova: `(clinic_id, day_of_week, start_time, end_time)` já identifica
"Qui tarde · Artro".

## Escopo

### O que entra

Três faixas empilhadas, sem filtro para o usuário configurar:

**Faixa 1 — O mês está indo bem?**
Frase grande com realizado + projeção + comparação com o mês anterior. Barras
dos últimos 12 meses; a barra do mês corrente mostra a parte projetada
pontilhada.

**Faixa 2 — Onde seu tempo rende mais** (o coração da página)
Uma linha por turno, ordenada por R$/hora decrescente. Colunas: turno,
R$/hora, faturamento no mês, ocupação. Barra proporcional dentro da própria
linha. Destaque em âmbar para o turno que combina ocupação alta com o pior
R$/hora — o caso que exige decisão.

**Faixa 3 — Consulta ou procedimento?**
Barra única dividida consulta × procedimento. Abaixo, uma linha por
procedimento (quantidade, faturamento, ticket). Fecha com a razão
"cada procedimento vale N consultas — na mesma hora de agenda".

### O que NÃO entra (decisões explícitas)

- **Despesas, custo e lucro.** O app continua conhecendo só entradas. Foi
  decisão do Valth: nada que exija lançamento recorrente.
- **Contas a receber de convênio.**
- **Filtros de período, exportação, relatórios configuráveis.** A página
  responde três perguntas fixas.
- **Marcação de procedimento em lote ou retroativa.** O dado nasce na chegada
  ou não existe.

## Como o procedimento passa a ser conhecido

No modal de registrar chegada, onde a secretária já digita o valor, entra uma
fileira de fichas de toque único. Uma só, obrigatória por default em
"Consulta":

`Consulta · Retorno · Infiltração · Zoledrônico · Tirzepatida · Proloterapia ·
Bloqueio geniculares · Outro`

A lista é uma constante no código, não uma tabela administrável — lista
editável vira tela de cadastro, e tela de cadastro vira manutenção.

Isso acrescenta **um toque** ao fluxo que a secretária já faz. É o único ponto
do sistema em que o dado pode nascer correto.

### Modelo de dados

`FinancialRecord` ganha uma coluna:

```
procedure_type = Column(String(40), nullable=True, index=True)
```

Nullable porque todo o histórico anterior fica NULL — e deve mesmo ficar. Na
faixa 3, registros com `procedure_type` nulo contam como "Consulta" apenas para
efeito de soma da barra, nunca como procedimento (nunca inflar procedimento com
suposição).

O valor viaja de `CheckinRequest` → `_lancar_no_caixa()` → `FinancialRecord`,
no mesmo caminho já usado por `payment_method`.

## Contrato do backend

Endpoint novo: `GET /financial/painel`

Papel: `doctor | admin | superadmin`. Secretária recebe **403** — mesmo padrão
já aplicado em `/financial/summary` e `/financial/analytics`. A secretária
continua exclusivamente com o Caixa do Dia (`GET /financial` do dia corrente).
A entrada no menu lateral não aparece para ela.

Resposta:

```jsonc
{
  "mes": {
    "label": "08/2026",
    "realizado": 52400.0,
    "projecao": 82300.0,
    "dias_uteis_decorridos": 14,
    "dias_uteis_total": 22,
    "variacao_vs_anterior": 0.09,      // null se não houver mês anterior
    "serie_12m": [{ "label": "03/2026", "valor": 41200.0 }]
  },
  "turnos": [
    {
      "clinic_id": 9,
      "clinica": "Artro",
      "dia_semana": 3,
      "periodo": "tarde",              // derivado de start_time < 13:00
      "label": "Qui tarde · Artro",
      "horas_mes": 16.0,
      "receita_mes": 9360.0,
      "receita_por_hora": 585.0,
      "ocupacao": 0.66,
      "ticket": 468.0,
      "atencao": false                 // ver regra abaixo
    }
  ],
  "mix": {
    "consulta": { "valor": 37200.0, "qtd": 95 },
    "procedimento": { "valor": 15200.0, "qtd": 24 },
    "razao_ticket": 1.6,               // ticket proc ÷ ticket consulta
    "linhas": [
      { "tipo": "Infiltração", "qtd": 12, "valor": 7800.0, "ticket": 650.0 }
    ]
  }
}
```

### Regra do destaque em âmbar (`atencao`)

Recebe `true` **no máximo um turno**: aquele que, ao mesmo tempo, tem ocupação
igual ou acima de 60% e o menor R$/hora entre todos. Se o turno de pior R$/hora
estiver com ocupação abaixo de 60%, ninguém recebe destaque — aí o problema é
agenda vazia, não preço, e a própria coluna de ocupação já conta essa história.

### Cálculo de horas do turno no mês

Para cada `ClinicSchedule` ativo: duração em horas × número de ocorrências
daquele dia da semana no período decorrido do mês. Feriado não é descontado —
o app não tem calendário de feriados, e inventar um seria manutenção.

A receita do turno vem de `FinancialRecord` filtrando por `clinic_id` e pela
faixa de horário do turno. `FinancialRecord` não tem hora, só `date`; o turno é
resolvido pelo par (dia da semana, clínica). Quando uma clínica tem dois turnos
no mesmo dia (quarta: IP manhã / Unimagem tarde), são clínicas diferentes, então
não há ambiguidade. Se um dia surgir a mesma clínica em dois turnos do mesmo
dia, os dois turnos serão fundidos numa linha só — comportamento aceito,
documentado aqui para não virar bug surpresa.

### Desempenho

Teto de 6 consultas agregadas com `GROUP BY`, no padrão já adotado em
`dashboard_v2` (que caiu de 4,5s para 2,7s). Nada de consulta por turno dentro
de laço.

## Frontend

Arquivo novo `frontend/components/FinanceiroPainel.tsx`, consumido por
`frontend/app/financeiro/page.tsx`. A página hoje tem 694 linhas e mistura o
Caixa do Dia (secretária) com as análises do médico; a separação em componente
mantém cada arquivo com um propósito.

Enquanto carrega, esqueleto com os títulos das três faixas — mesma decisão do
dashboard, onde o bloco cinza único parecia tela em branco.

Sem biblioteca nova: barras em CSS. `recharts` já está no projeto e é usado
para a série de 12 meses.

## Estados vazios (importantes — a página nasce parcialmente vazia)

| Faixa | No dia 1 | Fica útil em |
|---|---|---|
| 1 | Só o mês corrente e a projeção; sem comparação | ~60 dias |
| 2 | Funciona completa desde o primeiro dia | agora |
| 3 | Vazia; procedimento só existe daqui pra frente | ~30 dias |

Cada faixa vazia mostra uma frase dizendo *por que* está vazia e a partir de
quando terá conteúdo. Nunca um zero sem explicação — zero sem explicação parece
defeito.

## Riscos assumidos

1. **O R$/hora sai menor que o real enquanto houver pagamento não registrado.**
   Foi o que aconteceu com terça e quarta de agosto. O número melhora conforme o
   Caixa vira rotina; não há como corrigir isso por software.
2. **A ocupação vem de agendamentos, a receita vem do financeiro.** Se um for
   registrado e o outro não, a linha do turno fica incoerente. Aceito: ambos já
   alimentam o dashboard hoje.
3. **Um toque a mais para a secretária.** Se ela ignorar as fichas, tudo cai em
   "Consulta" e a faixa 3 perde valor — degrada silenciosamente, sem quebrar.

## Critérios de aceite

- Secretária logada recebe 403 no endpoint e não vê a entrada no menu.
- Turnos ordenados por R$/hora decrescente; o de maior faturamento absoluto
  **não** precisa ser o primeiro.
- Registrar uma chegada com ficha "Infiltração" faz o valor aparecer na faixa 3
  como procedimento, e no total do mês da faixa 1.
- Registrar chegada sem tocar em ficha nenhuma grava "Consulta".
- Painel responde em menos de 3 segundos em produção.
- Nenhuma faixa mostra zero sem frase explicativa.
