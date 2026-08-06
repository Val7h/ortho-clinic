# Financeiro em três faixas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a página Financeiro por três faixas que respondem "o mês vai bem?", "onde minha hora rende mais?" e "consulta ou procedimento?", tendo R$ por hora de grade como régua principal.

**Architecture:** Uma coluna nova (`procedure_type`) em `financial_records`, preenchida por fichas de toque único no modal de registrar chegada. Um endpoint agregado `GET /financial/painel` monta as três faixas com poucas consultas `GROUP BY` (padrão já adotado em `dashboard_v2`). O frontend ganha um componente próprio consumido pela página existente.

**Tech Stack:** FastAPI + SQLAlchemy + Postgres (Neon) no backend; Next.js 14 static export + Tailwind + recharts no frontend; pytest com SQLite em memória para teste.

## Global Constraints

- Especificação de origem: `docs/superpowers/specs/2026-08-06-financeiro-tres-faixas-design.md`. Em caso de divergência, a especificação vence.
- Branch é `master`, não `main`.
- Build do frontend **sem** `.env.local` (senão vaza `localhost` no bundle); `frontend/out` é commitado junto com o código.
- Secretária (`role == "secretary"`) recebe **403** em `/financial/painel` e não vê a entrada no menu.
- Nenhum lançamento antigo (`procedure_type` nulo) pode ser contado como procedimento.
- Toda coluna nova entra por `migrate_db()` em `backend/database.py`, no padrão `if "coluna" not in cols: ALTER TABLE`. O projeto não usa Alembic.
- Datas em horário de Brasília via `tzutil.today_br()`.
- Texto de interface em português, sem jargão técnico.
- Sem biblioteca nova. `recharts` já existe.

---

### Task 1: Coluna `procedure_type` e gravação no check-in

**Files:**
- Modify: `backend/models/financial.py:22` (após `clinic_id`)
- Modify: `backend/database.py:98-101` (bloco `financial_records` do `migrate_db`)
- Modify: `backend/routers/queue.py:664-671` (`CheckinRequest`)
- Modify: `backend/routers/queue.py:835-854` (`_lancar_no_caixa`)
- Modify: `backend/routers/queue.py:1054` (chamada de `_lancar_no_caixa` no check-in)
- Create: `backend/test_financeiro_painel.py`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `FinancialRecord.procedure_type: Optional[str]`; constante `PROCEDIMENTOS: tuple[str, ...]` exportada de `backend/routers/queue.py`; `_lancar_no_caixa(db, patient, clinic_id, value_cents, payment_method, descricao, procedure_type=None)`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `backend/test_financeiro_painel.py`:

```python
"""Testes do Financeiro em tres faixas.
Executar com: pytest backend/test_financeiro_painel.py -v
"""
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.financial import FinancialRecord
from models.patient import Patient

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


@pytest.fixture
def db():
    s = TestingSessionLocal()
    yield s
    s.rollback()
    s.close()


def test_financial_record_guarda_procedimento(db):
    p = Patient(name="Teste Procedimento", organization_id=1)
    db.add(p)
    db.flush()

    r = FinancialRecord(
        organization_id=1,
        patient_id=p.id,
        amount=650.0,
        payment_method="pix",
        status="paid",
        date=date(2026, 8, 6),
        procedure_type="Infiltração",
    )
    db.add(r)
    db.flush()

    assert r.procedure_type == "Infiltração"


def test_procedure_type_e_opcional(db):
    p = Patient(name="Teste Consulta", organization_id=1)
    db.add(p)
    db.flush()

    r = FinancialRecord(
        organization_id=1,
        patient_id=p.id,
        amount=400.0,
        payment_method="dinheiro",
        status="paid",
        date=date(2026, 8, 6),
    )
    db.add(r)
    db.flush()

    assert r.procedure_type is None
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v
```

Esperado: FAIL com `TypeError: 'procedure_type' is an invalid keyword argument for FinancialRecord`.

- [ ] **Step 3: Adicionar a coluna no modelo**

Em `backend/models/financial.py`, logo após a linha do `clinic_id`:

```python
    # O QUE foi vendido (06/08): sem isso uma consulta de R$ 400 e uma
    # infiltracao de R$ 400 sao a mesma linha. Nulo = historico antigo,
    # que na faixa 3 conta como consulta e NUNCA como procedimento.
    procedure_type = Column(String(40), nullable=True, index=True)
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v
```

Esperado: 2 passed.

- [ ] **Step 5: Adicionar a migração para o banco de produção**

Em `backend/database.py`, dentro do bloco `if "financial_records" in existing_tables:` (linha ~98), após a checagem de `clinic_id`:

```python
        if "procedure_type" not in fin_cols:
            migrations.append("ALTER TABLE financial_records ADD COLUMN procedure_type VARCHAR(40)")
```

- [ ] **Step 6: Aceitar o procedimento no check-in**

Em `backend/routers/queue.py`, antes de `class CheckinRequest` (linha ~664), criar a constante:

```python
# Fichas de toque unico no registro da chegada (06/08). Lista fixa no codigo:
# lista editavel vira tela de cadastro, e tela de cadastro vira manutencao.
PROCEDIMENTOS = (
    "Consulta",
    "Retorno",
    "Infiltração",
    "Zoledrônico",
    "Tirzepatida",
    "Proloterapia",
    "Bloqueio geniculares",
    "Outro",
)
```

E dentro de `CheckinRequest`, após `payment_method`:

```python
    # O que foi vendido (06/08) — default "Consulta" quando nao vier nada
    procedure_type: Optional[str] = None
```

- [ ] **Step 7: Gravar o procedimento no lançamento do caixa**

Em `backend/routers/queue.py`, alterar a assinatura e o corpo de `_lancar_no_caixa`:

```python
def _lancar_no_caixa(db: Session, patient: Patient, clinic_id: Optional[int],
                     value_cents: int, payment_method: Optional[str],
                     descricao: str, procedure_type: Optional[str] = None) -> None:
    """Joga o valor recebido na chegada direto no Caixa do Dia (erro E3).

    Antes, o valor ficava preso no registro da fila e o financeiro do dia
    ficava zerado (terça: 17 atendimentos, R$ 0 no caixa).
    """
    if not value_cents or value_cents <= 0:
        return
    proc = procedure_type if procedure_type in PROCEDIMENTOS else "Consulta"
    db.add(FinancialRecord(
        organization_id=patient.organization_id,
        patient_id=patient.id,
        clinic_id=clinic_id,
        amount=round(value_cents / 100.0, 2),
        payment_method=(payment_method or "dinheiro"),
        status="paid",
        description=descricao,
        date=today_br(),
        procedure_type=proc,
    ))
```

E na chamada dentro do check-in (linha ~1054), acrescentar o argumento:

```python
        procedure_type=request.procedure_type,
```

- [ ] **Step 8: Escrever o teste do default**

Acrescentar em `backend/test_financeiro_painel.py`:

```python
def test_ficha_invalida_ou_ausente_vira_consulta():
    from routers.queue import PROCEDIMENTOS

    assert "Consulta" in PROCEDIMENTOS
    assert "Infiltração" in PROCEDIMENTOS

    def resolver(valor):
        return valor if valor in PROCEDIMENTOS else "Consulta"

    assert resolver(None) == "Consulta"
    assert resolver("qualquer coisa") == "Consulta"
    assert resolver("Zoledrônico") == "Zoledrônico"
```

- [ ] **Step 9: Rodar os testes**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v
```

Esperado: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add backend/models/financial.py backend/database.py backend/routers/queue.py backend/test_financeiro_painel.py
git commit -m "feat(financeiro): registra o que foi vendido no lancamento da chegada"
```

---

### Task 2: Fichas de procedimento no modal de chegada

**Files:**
- Modify: `frontend/app/painel/page.tsx:361` (estado), `:544-545` (envio), `:944-973` (bloco de formas de pagamento)
- Modify: `frontend/lib/api.ts` (tipo do payload de check-in, se tipado)

**Interfaces:**
- Consumes: campo `procedure_type` do `CheckinRequest` (Task 1).
- Produces: nada para tasks seguintes — é a ponta de entrada do dado.

- [ ] **Step 1: Adicionar o estado do procedimento**

Em `frontend/app/painel/page.tsx`, junto de `checkinPayment` (linha ~361):

```tsx
  const [checkinProcedure, setCheckinProcedure] = useState('Consulta'); // 06/08: o que foi vendido
```

- [ ] **Step 2: Enviar no check-in**

Na chamada de check-in (linha ~544), junto de `payment_method`:

```tsx
        procedure_type: parseReaisToCents(checkinValue) ? checkinProcedure : undefined,
```

- [ ] **Step 3: Desenhar as fichas**

Em `frontend/app/painel/page.tsx`, dentro do mesmo `{checkinValue.trim() !== '' && (` que já mostra as formas de pagamento, logo **acima** do bloco "Forma de pagamento":

```tsx
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">O que foi</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {['Consulta', 'Retorno', 'Infiltração', 'Zoledrônico', 'Tirzepatida', 'Proloterapia', 'Bloqueio geniculares', 'Outro'].map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setCheckinProcedure(op)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          checkinProcedure === op
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
```

- [ ] **Step 4: Voltar o padrão ao fechar o modal**

Onde o modal de chegada é resetado (mesma função que limpa `checkinValue`), acrescentar:

```tsx
      setCheckinProcedure('Consulta');
```

- [ ] **Step 5: Verificar tipos e build**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sem saída (0 erros).

- [ ] **Step 6: Commit**

```bash
git add frontend/app/painel/page.tsx frontend/lib/api.ts
git commit -m "feat(chegada): fichas de procedimento no registro do valor"
```

---

### Task 3: Endpoint `/financial/painel` — faixa 2 (turnos por R$/hora)

**Files:**
- Modify: `backend/routers/financial.py` (novo endpoint no fim do arquivo, antes do DELETE)
- Modify: `backend/test_financeiro_painel.py`

**Interfaces:**
- Consumes: `FinancialRecord.clinic_id`, `ClinicSchedule(clinic_id, day_of_week, start_time, end_time, slot_duration, active)`.
- Produces:
  - `_horas_do_turno(sched, inicio: date, fim: date) -> float`
  - `_periodo(start_time: str) -> str` (`"manhã"` ou `"tarde"`)
  - `GET /financial/painel` devolvendo a chave `turnos` no formato da especificação.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `backend/test_financeiro_painel.py`:

```python
def test_periodo_pela_hora_de_inicio():
    from routers.financial import _periodo

    assert _periodo("08:00") == "manhã"
    assert _periodo("12:59") == "manhã"
    assert _periodo("13:00") == "tarde"
    assert _periodo("14:30") == "tarde"


def test_horas_do_turno_conta_ocorrencias_do_dia_da_semana():
    from routers.financial import _horas_do_turno

    class FakeSched:
        day_of_week = 3      # quinta
        start_time = "14:00"
        end_time = "18:00"   # 4 horas

    # 01/08/2026 a 06/08/2026: quintas em 06/08 apenas -> 4h
    assert _horas_do_turno(FakeSched(), date(2026, 8, 1), date(2026, 8, 6)) == 4.0

    # 01/08/2026 a 31/08/2026: quintas em 06, 13, 20, 27 -> 16h
    assert _horas_do_turno(FakeSched(), date(2026, 8, 1), date(2026, 8, 31)) == 16.0


def test_horas_do_turno_com_horario_invalido_devolve_zero():
    from routers.financial import _horas_do_turno

    class FakeSched:
        day_of_week = 0
        start_time = None
        end_time = "12:00"

    assert _horas_do_turno(FakeSched(), date(2026, 8, 1), date(2026, 8, 31)) == 0.0
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v -k "periodo or horas"
```

Esperado: FAIL com `ImportError: cannot import name '_periodo' from 'routers.financial'`.

- [ ] **Step 3: Implementar os dois auxiliares**

No fim de `backend/routers/financial.py`, antes do endpoint DELETE:

```python
def _periodo(start_time: Optional[str]) -> str:
    """Turno da manha ou da tarde, pela hora de inicio da grade."""
    try:
        hora = int((start_time or "08:00").split(":")[0])
    except (ValueError, AttributeError):
        hora = 8
    return "manhã" if hora < 13 else "tarde"


def _horas_do_turno(sched, inicio: date, fim: date) -> float:
    """Horas de consultorio que o turno reservou no periodo.

    Regua do painel (06/08): a hora e a que o medico bloqueou na vida dele,
    esteja ela preenchida ou nao — turno vazio DEVE pesar contra o turno.
    Feriado nao e descontado: o app nao tem calendario de feriados e inventar
    um seria manutencao.
    """
    try:
        h1, m1 = map(int, (sched.start_time or "").split(":"))
        h2, m2 = map(int, (sched.end_time or "").split(":"))
    except (ValueError, AttributeError):
        return 0.0
    minutos = (h2 * 60 + m2) - (h1 * 60 + m1)
    if minutos <= 0:
        return 0.0
    ocorrencias = 0
    d = inicio
    while d <= fim:
        if d.weekday() == sched.day_of_week:
            ocorrencias += 1
        d += timedelta(days=1)
    return round(ocorrencias * minutos / 60.0, 2)
```

Conferir que `date`, `timedelta` e `Optional` estão importados no topo do arquivo; se não, acrescentar.

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v -k "periodo or horas"
```

Esperado: 3 passed.

- [ ] **Step 5: Escrever o teste do 403 da secretária**

Acrescentar em `backend/test_financeiro_painel.py`:

```python
def test_secretaria_nao_ve_o_painel():
    from fastapi.testclient import TestClient
    from database import get_db
    from deps import get_current_user
    from main import app
    from models.organization import User

    class FakeSecretaria:
        id = 99
        role = "secretary"
        organization_id = 1

    app.dependency_overrides[get_current_user] = lambda: FakeSecretaria()
    app.dependency_overrides[get_db] = lambda: TestingSessionLocal()
    try:
        resposta = TestClient(app).get("/financial/painel")
        assert resposta.status_code == 403
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 6: Rodar para confirmar que falha**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v -k secretaria
```

Esperado: FAIL com status 404 (rota ainda não existe).

- [ ] **Step 7: Implementar o endpoint com a faixa 2**

No fim de `backend/routers/financial.py`:

```python
@router.get("/painel")
def get_painel(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Financeiro em tres faixas (06/08). Regua = R$ por hora de grade.

    Faturamento absoluto engana: a clinica onde o medico passa mais horas
    sempre lidera, o que mede presenca e nao rentabilidade.
    """
    if current_user.role == "secretary":
        raise HTTPException(403, "Painel financeiro disponível apenas para o médico/administração")

    hoje = _br_today()
    mes_inicio = hoje.replace(day=1)

    clinics_q = db.query(Clinic).filter(Clinic.active == True)
    if current_user.role != "superadmin":
        clinics_q = clinics_q.filter(Clinic.organization_id == current_user.organization_id)
    clinicas = {c.id: c for c in clinics_q.all()}
    ids = list(clinicas)

    receita_por_clinica: dict[int, float] = {}
    qtd_por_clinica: dict[int, int] = {}
    if ids:
        for cid, soma, n in (
            db.query(FinancialRecord.clinic_id,
                     func.coalesce(func.sum(FinancialRecord.amount), 0),
                     func.count(FinancialRecord.id))
            .filter(FinancialRecord.clinic_id.in_(ids),
                    FinancialRecord.date >= mes_inicio,
                    FinancialRecord.date <= hoje,
                    FinancialRecord.status == "paid")
            .group_by(FinancialRecord.clinic_id).all()
        ):
            receita_por_clinica[cid] = float(soma or 0)
            qtd_por_clinica[cid] = int(n or 0)

    marcados: dict[int, int] = {}
    if ids:
        for cid, n in (
            db.query(Appointment.clinic_id, func.count(Appointment.id))
            .filter(Appointment.clinic_id.in_(ids),
                    Appointment.date >= mes_inicio, Appointment.date <= hoje,
                    Appointment.status.in_(("pending", "confirmed", "completed")))
            .group_by(Appointment.clinic_id).all()
        ):
            marcados[cid] = n

    scheds = (
        db.query(ClinicSchedule)
        .filter(ClinicSchedule.clinic_id.in_(ids), ClinicSchedule.active == True)
        .all()
    ) if ids else []

    DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    turnos = []
    horas_por_clinica: dict[int, float] = {}
    for s in scheds:
        horas_por_clinica[s.clinic_id] = horas_por_clinica.get(s.clinic_id, 0.0) + _horas_do_turno(s, mes_inicio, hoje)

    vistos: set[int] = set()
    for s in scheds:
        c = clinicas.get(s.clinic_id)
        if c is None:
            continue
        horas = _horas_do_turno(s, mes_inicio, hoje)
        if horas <= 0:
            continue
        horas_totais = horas_por_clinica.get(s.clinic_id, 0.0) or horas
        fatia = horas / horas_totais
        receita = round(receita_por_clinica.get(s.clinic_id, 0.0) * fatia, 2)
        qtd = qtd_por_clinica.get(s.clinic_id, 0)
        slot = s.slot_duration or 12
        capacidade = int(horas * 60 // slot) if slot else 0
        booked = round(marcados.get(s.clinic_id, 0) * fatia)
        nome = c.name.replace("Clínica ", "")
        periodo = _periodo(s.start_time)
        turnos.append({
            "clinic_id": c.id,
            "clinica": nome,
            "dia_semana": s.day_of_week,
            "periodo": periodo,
            "label": f"{DIAS[s.day_of_week]} {periodo} · {nome}",
            "horas_mes": horas,
            "receita_mes": receita,
            "receita_por_hora": round(receita / horas, 2) if horas else 0.0,
            "ocupacao": round(booked / capacidade, 3) if capacidade else None,
            "ticket": round(receita / qtd, 2) if qtd else None,
            "atencao": False,
        })
        vistos.add(s.clinic_id)

    turnos.sort(key=lambda t: t["receita_por_hora"], reverse=True)

    # Destaque em ambar: no maximo UM turno — o de pior R$/hora, e so se
    # estiver com ocupacao >= 60%. Se o pior turno estiver vazio, o problema
    # e agenda e nao preco, e a coluna de ocupacao ja conta essa historia.
    if turnos:
        pior = turnos[-1]
        if (pior["ocupacao"] or 0) >= 0.6:
            pior["atencao"] = True

    return {"turnos": turnos}
```

Conferir os imports no topo do arquivo: `Clinic`, `ClinicSchedule`, `Appointment`, `func`. Acrescentar os que faltarem.

- [ ] **Step 8: Rodar os testes**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v
```

Esperado: 7 passed.

- [ ] **Step 9: Commit**

```bash
git add backend/routers/financial.py backend/test_financeiro_painel.py
git commit -m "feat(financeiro): endpoint do painel com R$ por hora de grade por turno"
```

---

### Task 4: Faixa 1 (o mês) e faixa 3 (mix) no mesmo endpoint

**Files:**
- Modify: `backend/routers/financial.py` (função `get_painel`)
- Modify: `backend/test_financeiro_painel.py`

**Interfaces:**
- Consumes: `get_painel` (Task 3), `FinancialRecord.procedure_type` (Task 1).
- Produces: chaves `mes` e `mix` na resposta de `GET /financial/painel`, no formato da especificação.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `backend/test_financeiro_painel.py`:

```python
def test_registro_sem_etiqueta_nunca_conta_como_procedimento():
    from routers.financial import _classificar_mix

    linhas = [
        ("Consulta", 400.0, 2),
        (None, 400.0, 5),
        ("Infiltração", 650.0, 1),
        ("Outro", 300.0, 1),
    ]
    mix = _classificar_mix(linhas)

    assert mix["consulta"]["qtd"] == 7          # 2 etiquetados + 5 sem etiqueta
    assert mix["procedimento"]["qtd"] == 2      # Infiltração + Outro
    assert [l["tipo"] for l in mix["linhas"]] == ["Infiltração", "Outro"]
    assert mix["razao_ticket"] == 1.19          # (950/2) / (2800/7)
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v -k mix
```

Esperado: FAIL com `ImportError: cannot import name '_classificar_mix'`.

- [ ] **Step 3: Implementar `_classificar_mix`**

Em `backend/routers/financial.py`, junto dos outros auxiliares:

```python
# Etiquetas que NAO sao procedimento. Registro sem etiqueta (historico antigo)
# entra como consulta e nunca como procedimento: melhor a faixa 3 nascer
# modesta do que mostrar uma infiltracao que ninguem sabe se aconteceu.
NAO_PROCEDIMENTO = ("Consulta", "Retorno", None)


def _classificar_mix(linhas) -> dict:
    """Divide o faturamento entre consulta e procedimento.

    `linhas` = lista de (procedure_type, soma, quantidade).
    """
    c_valor, c_qtd = 0.0, 0
    p_valor, p_qtd = 0.0, 0
    detalhe = []
    for tipo, soma, qtd in linhas:
        soma = float(soma or 0)
        qtd = int(qtd or 0)
        if tipo in NAO_PROCEDIMENTO:
            c_valor += soma
            c_qtd += qtd
        else:
            p_valor += soma
            p_qtd += qtd
            detalhe.append({
                "tipo": tipo,
                "qtd": qtd,
                "valor": round(soma, 2),
                "ticket": round(soma / qtd, 2) if qtd else None,
            })
    detalhe.sort(key=lambda l: l["valor"], reverse=True)
    ticket_c = (c_valor / c_qtd) if c_qtd else 0.0
    ticket_p = (p_valor / p_qtd) if p_qtd else 0.0
    return {
        "consulta": {"valor": round(c_valor, 2), "qtd": c_qtd},
        "procedimento": {"valor": round(p_valor, 2), "qtd": p_qtd},
        "razao_ticket": round(ticket_p / ticket_c, 2) if ticket_c and ticket_p else None,
        "linhas": detalhe,
    }
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v -k mix
```

Esperado: 1 passed.

- [ ] **Step 5: Montar as faixas 1 e 3 no endpoint**

Dentro de `get_painel`, antes do `return`:

```python
    # ── FAIXA 1: o mes ──────────────────────────────────────────────────────
    def _org_q(q):
        if current_user.role != "superadmin":
            q = q.join(Patient, FinancialRecord.patient_id == Patient.id).filter(
                Patient.organization_id == current_user.organization_id
            )
        return q

    doze_meses_atras = (mes_inicio - timedelta(days=340)).replace(day=1)
    serie_bruta = (
        _org_q(db.query(
            func.extract("year", FinancialRecord.date),
            func.extract("month", FinancialRecord.date),
            func.coalesce(func.sum(FinancialRecord.amount), 0),
        ))
        .filter(FinancialRecord.date >= doze_meses_atras,
                FinancialRecord.date <= hoje,
                FinancialRecord.status == "paid")
        .group_by(func.extract("year", FinancialRecord.date),
                  func.extract("month", FinancialRecord.date))
        .all()
    )
    por_mes = {(int(a), int(m)): float(v or 0) for a, m, v in serie_bruta}

    serie_12m = []
    ref = doze_meses_atras
    while ref <= mes_inicio:
        serie_12m.append({
            "label": f"{ref.month:02d}/{ref.year}",
            "valor": round(por_mes.get((ref.year, ref.month), 0.0), 2),
        })
        ref = (ref.replace(day=28) + timedelta(days=7)).replace(day=1)

    realizado = round(por_mes.get((hoje.year, hoje.month), 0.0), 2)

    def _uteis(inicio: date, fim: date) -> int:
        n, d = 0, inicio
        while d <= fim:
            if d.weekday() < 5:
                n += 1
            d += timedelta(days=1)
        return n

    ultimo_dia = hoje.replace(day=monthrange(hoje.year, hoje.month)[1])
    uteis_ate_hoje = _uteis(mes_inicio, hoje)
    uteis_total = _uteis(mes_inicio, ultimo_dia)
    projecao = round(realizado / uteis_ate_hoje * uteis_total, 2) if uteis_ate_hoje else realizado

    anterior_ref = (mes_inicio - timedelta(days=1))
    anterior = por_mes.get((anterior_ref.year, anterior_ref.month), 0.0)
    variacao = round((projecao - anterior) / anterior, 3) if anterior else None

    # ── FAIXA 3: consulta x procedimento ────────────────────────────────────
    linhas_mix = (
        _org_q(db.query(
            FinancialRecord.procedure_type,
            func.coalesce(func.sum(FinancialRecord.amount), 0),
            func.count(FinancialRecord.id),
        ))
        .filter(FinancialRecord.date >= mes_inicio,
                FinancialRecord.date <= hoje,
                FinancialRecord.status == "paid")
        .group_by(FinancialRecord.procedure_type)
        .all()
    )
    mix = _classificar_mix(linhas_mix)
```

E trocar o `return` por:

```python
    return {
        "mes": {
            "label": f"{hoje.month:02d}/{hoje.year}",
            "realizado": realizado,
            "projecao": projecao,
            "dias_uteis_decorridos": uteis_ate_hoje,
            "dias_uteis_total": uteis_total,
            "variacao_vs_anterior": variacao,
            "serie_12m": serie_12m,
        },
        "turnos": turnos,
        "mix": mix,
    }
```

Conferir os imports: `monthrange` de `calendar`, `Patient`. Acrescentar os que faltarem.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd backend && python -m pytest test_financeiro_painel.py -v
```

Esperado: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/financial.py backend/test_financeiro_painel.py
git commit -m "feat(financeiro): faixas do mes e do mix consulta x procedimento"
```

---

### Task 5: Componente `FinanceiroPainel.tsx`

**Files:**
- Create: `frontend/components/FinanceiroPainel.tsx`
- Modify: `frontend/lib/api.ts` (função `financialApi.painel()`)

**Interfaces:**
- Consumes: `GET /financial/painel` (Tasks 3 e 4).
- Produces: `export function FinanceiroPainel(): JSX.Element` — usado pela página na Task 6.

- [ ] **Step 1: Adicionar a chamada de API**

Em `frontend/lib/api.ts`, dentro do objeto `financialApi`:

```ts
  painel: () => get<any>('/financial/painel'),
```

Se o arquivo usar outro nome de helper (`apiGet`, `request`), seguir o padrão vizinho em vez deste.

- [ ] **Step 2: Criar o componente com as três faixas**

Criar `frontend/components/FinanceiroPainel.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { financialApi } from '@/lib/api';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FinanceiroPainel() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    financialApi.painel().then(setDados).catch(() => setErro('Não consegui carregar o painel.'));
  }, []);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;

  // Esqueleto com os titulos das faixas: o bloco cinza unico parecia tela
  // em branco no dashboard, e o Valth achou que tinha quebrado.
  if (!dados) {
    return (
      <div className="space-y-4">
        {['O mês', 'Onde seu tempo rende mais', 'Consulta ou procedimento?'].map((t) => (
          <div key={t} className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <p className="text-sm font-semibold text-slate-500">{t}</p>
            <div className="mt-3 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        ))}
        <p className="text-center text-sm text-slate-400">Carregando os números…</p>
      </div>
    );
  }

  const { mes, turnos, mix } = dados;
  const maxSerie = Math.max(1, ...(mes.serie_12m || []).map((p: any) => p.valor));
  const totalMix = (mix?.consulta?.valor || 0) + (mix?.procedimento?.valor || 0);
  const pctConsulta = totalMix ? Math.round((mix.consulta.valor / totalMix) * 100) : 100;
  const maxHora = Math.max(1, ...(turnos || []).map((t: any) => t.receita_por_hora));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          {mes.label} · dia {mes.dias_uteis_decorridos} de {mes.dias_uteis_total} úteis
        </p>
        <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-50">
          {brl(mes.realizado)} até agora
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          No ritmo atual, fecha em <strong>{brl(mes.projecao)}</strong>
          {mes.variacao_vs_anterior != null && (
            <> — {Math.abs(Math.round(mes.variacao_vs_anterior * 100))}% {mes.variacao_vs_anterior >= 0 ? 'acima' : 'abaixo'} do mês anterior</>
          )}
        </p>
        {mes.variacao_vs_anterior == null && (
          <p className="mt-2 text-xs text-slate-500">
            Ainda não há mês anterior fechado para comparar. Esta faixa fica útil em cerca de 60 dias.
          </p>
        )}
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {(mes.serie_12m || []).map((p: any) => (
            <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-blue-500/70"
                style={{ height: `${Math.max(4, (p.valor / maxSerie) * 100)}%` }}
              />
              <span className="text-[10px] text-slate-400">{p.label.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Onde seu tempo rende mais</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Faturamento por hora de consultório — a mesma hora sua, em cada turno
        </p>
        <div className="mt-4 space-y-0">
          {(turnos || []).map((t: any) => (
            <div
              key={`${t.clinic_id}-${t.dia_semana}-${t.periodo}`}
              className="grid grid-cols-[1fr_84px_84px_72px] items-center gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800"
            >
              <div>
                <p className="text-sm text-slate-900 dark:text-slate-100">{t.label}</p>
                <div className="mt-1 h-1.5 rounded-full" style={{
                  width: `${Math.max(6, (t.receita_por_hora / maxHora) * 100)}%`,
                  backgroundColor: t.atencao ? '#d97706' : '#2563eb',
                }} />
              </div>
              <p className={`text-right text-sm font-semibold ${t.atencao ? 'text-amber-600' : 'text-slate-900 dark:text-slate-100'}`}>
                {brl(t.receita_por_hora)}/h
              </p>
              <p className="text-right text-sm text-slate-500">{brl(t.receita_mes)}</p>
              <p className="text-right text-sm text-slate-500">
                {t.ocupacao != null ? `${Math.round(t.ocupacao * 100)}%` : '—'}
              </p>
            </div>
          ))}
        </div>
        {(turnos || []).some((t: any) => t.atencao) && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Este turno tem ocupação alta e o pior retorno por hora. Agenda cheia não é o problema — preço ou mix é.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Consulta ou procedimento?</h3>
        <p className="mt-0.5 text-sm text-slate-500">De onde veio o faturamento do mês</p>

        {mix.procedimento.qtd === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Ainda não há procedimento registrado neste mês. A etiqueta é escolhida no momento de
            registrar a chegada, então esta faixa começa a valer com os atendimentos daqui em diante.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-9 overflow-hidden rounded-lg">
              <div className="flex items-center bg-blue-100 pl-3 text-xs text-blue-800 dark:bg-blue-950" style={{ width: `${pctConsulta}%` }}>
                Consulta · {brl(mix.consulta.valor)}
              </div>
              <div className="flex items-center bg-blue-600 pl-3 text-xs text-white" style={{ width: `${100 - pctConsulta}%` }}>
                Proc. · {brl(mix.procedimento.valor)}
              </div>
            </div>
            <div className="mt-3">
              {mix.linhas.map((l: any) => (
                <div key={l.tipo} className="grid grid-cols-[1fr_48px_80px_72px] gap-2 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
                  <span className="text-slate-900 dark:text-slate-100">{l.tipo}</span>
                  <span className="text-right text-slate-500">{l.qtd}</span>
                  <span className="text-right text-slate-900 dark:text-slate-100">{brl(l.valor)}</span>
                  <span className="text-right text-slate-500">{l.ticket ? brl(l.ticket) : '—'}</span>
                </div>
              ))}
            </div>
            {mix.razao_ticket && (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Cada procedimento vale {mix.razao_ticket.toString().replace('.', ',')} consultas — na mesma hora de agenda.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: sem saída.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/FinanceiroPainel.tsx frontend/lib/api.ts
git commit -m "feat(financeiro): componente das tres faixas"
```

---

### Task 6: Ligar o painel na página e publicar

**Files:**
- Modify: `frontend/app/financeiro/page.tsx` (bloco de análises do médico)
- Modify: `frontend/out/**` (saída do build)

**Interfaces:**
- Consumes: `FinanceiroPainel` (Task 5).
- Produces: a página `/financeiro` em produção.

- [ ] **Step 1: Substituir o bloco "📊 Análises" pelo painel**

Em `frontend/app/financeiro/page.tsx`, importar no topo:

```tsx
import { FinanceiroPainel } from '@/components/FinanceiroPainel';
```

E, no trecho visível apenas ao médico/admin (o mesmo que hoje envolve o cabeçalho `📊 Análises`, por volta da linha 434), renderizar `<FinanceiroPainel />` **acima** dos gráficos atuais. Não remover os gráficos existentes nesta task — a remoção é decisão do Valth depois de ver as duas coisas lado a lado.

- [ ] **Step 2: Verificar tipos e buildar**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Esperado: `tsc` sem saída; build com exit code 0. **Confirmar que `frontend/.env.local` não existe** antes de buildar — ele vaza `localhost` no bundle.

- [ ] **Step 3: Commit e publicar**

```bash
git add frontend/app/financeiro/page.tsx frontend/out
git commit -m "feat(financeiro): painel de tres faixas na pagina"
git push origin master
```

- [ ] **Step 4: Verificar em produção**

Aguardar o deploy do Render (2 a 5 min) e conferir a resposta real:

```bash
python "$SCRATCH/ver_painel.py"
```

Onde `ver_painel.py` faz login em `https://ortho-clinic-ldcd.onrender.com/auth/login` e chama `/financial/painel`, imprimindo `mes`, `turnos` e `mix`.

Checar, contra os critérios de aceite da especificação:
- turnos ordenados por `receita_por_hora` decrescente;
- o turno de maior `receita_mes` **não** precisa ser o primeiro;
- no máximo um turno com `atencao: true`;
- resposta em menos de 3 segundos.

- [ ] **Step 5: Verificar o 403 da secretária em produção**

Logar com uma conta de secretária e confirmar HTTP 403 em `/financial/painel`, e que a página `/financeiro` continua mostrando apenas o Caixa do Dia.

- [ ] **Step 6: Teste de ponta a ponta do procedimento**

Registrar uma chegada de teste com valor e ficha "Infiltração", conferir que aparece na faixa 3 como procedimento e no total da faixa 1, e **apagar o registro de teste do banco em seguida**.

---

## Auto-revisão do plano

**Cobertura da especificação:** faixa 1 → Task 4; faixa 2 → Task 3; faixa 3 → Tasks 1, 2 e 4; coluna `procedure_type` → Task 1; fichas na chegada → Task 2; 403 da secretária → Task 3 (teste) e Task 6 (produção); regra do âmbar → Task 3; estados vazios → Task 5; esqueleto de carregamento → Task 5; desempenho → Task 6.

**Fora do escopo, conforme a especificação:** despesas, contas a receber de convênio, filtros de período e exportação.

**Ponto de atenção conhecido:** a especificação prevê receita do turno filtrando por clínica e faixa de horário, mas `financial_records` não guarda hora — só data. A Task 3 resolve rateando a receita da clínica entre os turnos dela na proporção das horas. Para as clínicas do Valth isso é exato, porque cada turno é uma clínica diferente (quarta: IP de manhã, Unimagem à tarde). Só deixa de ser exato se um dia a mesma clínica tiver dois turnos no mesmo dia — e a especificação já registra esse caso como comportamento aceito.
