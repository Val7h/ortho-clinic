# OrthoClinic Testing Guide

Guia completo para executar, entender e manter a suite de testes do OrthoClinic Phase 1.

## Índice
1. [Início Rápido](#início-rápido)
2. [Estrutura de Testes](#estrutura-de-testes)
3. [Executar Testes](#executar-testes)
4. [Entender Resultados](#entender-resultados)
5. [Escrever Novos Testes](#escrever-novos-testes)
6. [Troubleshooting](#troubleshooting)

---

## Início Rápido

### Backend (Python)

```bash
cd backend

# Instalar dependências de teste
pip install -r requirements-test.txt

# Executar TODOS os testes
pytest tests/ -v

# Executar com coverage report (HTML)
pytest tests/ --cov=app --cov-report=html
# Abrir: htmlcov/index.html
```

### Frontend (Node.js)

```bash
cd frontend

# Instalar dependências
npm install

# Executar testes unitários
npm test

# Executar com coverage
npm run test:coverage

# Executar testes E2E
npm run e2e

# Executar E2E com interface gráfica
npm run e2e:ui
```

---

## Estrutura de Testes

### Backend Structure

```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py                    # Fixtures e configuração pytest
│   ├── unit/
│   │   ├── test_queue.py              # Testes de fila
│   │   ├── test_prescriptions.py      # Testes de prescrição
│   │   └── test_anamnesis.py          # Testes de anamnese
│   └── integration/
│       ├── test_api_endpoints.py      # Testes de endpoints
│       ├── test_performance.py        # Testes de performance
│       └── test_reliability.py        # Testes de confiabilidade
├── pytest.ini                          # Configuração pytest
└── requirements-test.txt               # Dependências de teste
```

### Frontend Structure

```
frontend/
├── __tests__/
│   └── unit/
│       ├── queue.test.tsx             # Testes painel TV
│       ├── anamnesis.test.tsx         # Testes anamnese
│       └── prescription.test.tsx      # Testes prescrição
├── e2e/
│   ├── queue-tv-panel.spec.ts        # E2E painel TV
│   ├── anamnesis.spec.ts             # E2E anamnese
│   └── prescription.spec.ts          # E2E prescrição
├── jest.config.js                     # Configuração Jest
├── jest.setup.js                      # Setup Jest
└── playwright.config.ts               # Configuração Playwright
```

---

## Executar Testes

### Opções Básicas

#### Backend - Todos os testes

```bash
pytest tests/ -v
```

#### Backend - Categoria específica

```bash
# Apenas unit tests
pytest tests/unit -v

# Apenas integration tests
pytest tests/integration -v

# Apenas testes de performance
pytest -m performance -v

# Apenas testes de confiabilidade
pytest -m reliability -v
```

#### Backend - Teste específico

```bash
# Teste individual
pytest tests/unit/test_queue.py::TestQueueCallEndpoint::test_call_patient_success -v

# Todos os testes de fila
pytest tests/unit/test_queue.py -v

# Com padrão (match)
pytest tests/ -k "queue" -v
```

#### Backend - Modo Watch

```bash
pytest tests/ --looponfail
# Executa novamente quando arquivos mudam
```

#### Frontend - Testes Unitários

```bash
# Todos
npm test

# Modo watch
npm run test:watch

# Arquivo específico
npm test -- queue.test.tsx

# Com coverage
npm run test:coverage
```

#### Frontend - Testes E2E

```bash
# Modo headed (vê o navegador)
npm run e2e -- --headed

# Interface gráfica
npm run e2e:ui

# Debug mode
npm run e2e:debug

# Teste específico
npx playwright test queue-tv-panel.spec.ts

# Teste específico em debug
npx playwright test queue-tv-panel.spec.ts --debug
```

### Opções Avançadas

#### Backend - Com métricas

```bash
# Mostrar 10 testes mais lentos
pytest tests/ -v --durations=10

# Parar no primeiro erro
pytest tests/ -x

# Mostrar prints/logs
pytest tests/ -v -s

# Execução paralela (requer pytest-xdist)
pytest tests/ -n auto
```

#### Backend - Cobertura detalhada

```bash
# Relatório HTML
pytest tests/ --cov=app --cov-report=html

# Relatório terminal
pytest tests/ --cov=app --cov-report=term-missing

# Arquivo XML (CI/CD)
pytest tests/ --cov=app --cov-report=xml
```

#### Frontend - Reportes

```bash
# Gerar relatório HTML
npx playwright show-report

# Vídeo e screenshots
npm run e2e -- --record

# JSON report
npm run e2e -- --reporter=json
```

---

## Entender Resultados

### Exemplo: Saída Pytest

```
backend/tests/unit/test_queue.py::TestQueueCallEndpoint::test_call_patient_success PASSED [ 10%]
backend/tests/unit/test_queue.py::TestQueueCallEndpoint::test_call_patient_not_found PASSED [ 20%]
backend/tests/unit/test_queue.py::TestQueueCallEndpoint::test_call_patient_response_time PASSED [ 30%]

============================== 3 passed in 0.25s ==============================
```

**Interpretação:**
- ✅ PASSED = Teste passou
- ❌ FAILED = Teste falhou
- ⊘ SKIPPED = Teste pulado
- ⚠ WARNING = Aviso (geralmente não é falha)

### Exemplo: Saída Jest

```
PASS  __tests__/unit/queue.test.tsx
  Queue TV Panel
    ✓ should connect to WebSocket on mount (15ms)
    ✓ should display called patient information (8ms)
    ✓ should update queue status in real-time (12ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        2.345s
```

### Exemplo: Saída Coverage

```
Name                     Stmts   Miss  Cover   Missing
------------------------------------------------------
app/routers/queue.py      120     12    90%   45-47, 89-91
app/models/queue.py        45      2    95%   23-24
------------------------------------------------------
TOTAL                     500     25    95%
```

**Meta:** 80%+ coverage

---

## Escrever Novos Testes

### Template: Teste Unitário (Python)

```python
# tests/unit/test_feature.py
import pytest
from sqlalchemy.orm import Session
from models.feature import Feature

class TestFeature:
    """Testes para Feature."""

    def test_create_feature_success(self, db: Session):
        """Testa criação bem-sucedida."""
        feature = Feature(name="Test")
        db.add(feature)
        db.commit()
        db.refresh(feature)

        assert feature.id is not None
        assert feature.name == "Test"

    def test_feature_validation(self):
        """Testa validação de dados."""
        invalid_data = {"name": None}

        with pytest.raises(ValueError):
            Feature(**invalid_data)

    @pytest.mark.performance
    def test_feature_query_speed(self, db: Session):
        """Testa performance de query."""
        import time
        start = time.time()
        result = db.query(Feature).first()
        elapsed = time.time() - start

        assert elapsed < 0.1  # 100ms
```

**Convenções:**
- Nome: `test_<what_is_being_tested>`
- Class: `Test<Feature>`
- Docstring: Explicar o que testa

### Template: Teste Unitário (TypeScript)

```typescript
// __tests__/unit/feature.test.tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

describe('Feature Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render feature name', () => {
    const props = { name: 'Test Feature' }
    // render component
    expect(screen.getByText('Test Feature')).toBeVisible()
  })

  it('should handle user interaction', async () => {
    const mockHandler = vi.fn()
    // render component with handler
    // fireEvent.click(button)
    expect(mockHandler).toHaveBeenCalled()
  })
})
```

### Template: Teste E2E (Playwright)

```typescript
// e2e/feature.spec.ts
import { test, expect, Page } from '@playwright/test'

test.describe('Feature E2E', () => {
  let page: Page

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await page.goto('http://localhost:3000/feature')
  })

  test('should load feature page', async () => {
    await expect(page.locator('h1')).toContainText('Feature')
  })

  test('should submit form', async () => {
    await page.fill('input[name="field"]', 'value')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Success')).toBeVisible()
  })
})
```

### Usando Fixtures

```python
# tests/conftest.py - Fixtures compartilhadas
@pytest.fixture
def my_data(db: Session):
    """Cria dados de teste."""
    data = MyModel(field="value")
    db.add(data)
    db.commit()
    db.refresh(data)
    return data

# tests/unit/test_feature.py - Usando fixture
def test_with_fixture(my_data):
    """Testa usando fixture."""
    assert my_data.field == "value"
```

---

## Troubleshooting

### Backend

#### Erro: "ModuleNotFoundError"

```bash
# Solução: Instalar dependências
pip install -r requirements-test.txt

# Ou adicionar ao PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
```

#### Erro: "Database connection failed"

```bash
# Solução 1: Usar SQLite em-memória (padrão em testes)
# Já configurado em conftest.py

# Solução 2: Se usar PostgreSQL, verificar variável
export DATABASE_URL=postgresql://user:pass@localhost/test_db
```

#### Erro: "WebSocket not supported in test mode"

```python
# Solução: Mock WebSocket
from unittest.mock import MagicMock
mock_ws = MagicMock()
# ou pular teste
@pytest.mark.skip(reason="WebSocket requires async runner")
```

#### Testes lentos

```bash
# Ver testes mais lentos
pytest tests/ --durations=10

# Paralelizar
pytest tests/ -n auto
```

### Frontend

#### Erro: "Cannot find module '@testing-library/react'"

```bash
# Solução: Instalar dependências
npm install

# Ou instalar específico
npm install --save-dev @testing-library/react
```

#### Erro: "ReferenceError: window is not defined"

```javascript
// Solução: Jest config já tem jest-environment-jsdom
// Se ainda ocorrer, adicionar ao topo:
/**
 * @jest-environment jsdom
 */
```

#### E2E timeout

```typescript
// Aumentar timeout em playwright.config.ts
timeout: 60 * 1000, // 60 segundos

// Ou em teste específico
test('slow test', async ({ page }) => {
  test.setTimeout(120000);
  // ...
})
```

#### WebSocket em teste

```javascript
// Mock WebSocket
global.WebSocket = class {
  constructor(url) { this.url = url }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}
```

### CI/CD

#### GitHub Actions falha

1. **Verificar logs:** Actions tab → workflow → job output
2. **Dependências Python:** Garantir `requirements-test.txt` existe
3. **Dependências Node:** Garantir `package-lock.json` existe
4. **Variáveis de ambiente:** Configurar secrets do repositório
5. **Timeouts:** Aumentar se testes lentos

#### Cobertura baixa em CI

```bash
# Gerar relatório local
pytest tests/ --cov=app --cov-report=html
# Enviar para codecov
```

---

## Best Practices

### ✅ Fazer

```python
# ✅ Bom: Nome descritivo e claro
def test_queue_call_with_valid_data_transitions_status_to_called():
    pass

# ✅ Bom: Teste uma coisa
def test_queue_status_returns_count():
    result = get_queue_status(clinic_id=1)
    assert result.total == 10

# ✅ Bom: Usar fixtures
def test_with_clinic_and_patient(clinic, patient, db):
    pass

# ✅ Bom: Seguir AAA pattern (Arrange, Act, Assert)
def test_feature():
    # Arrange
    data = create_test_data()
    
    # Act
    result = function(data)
    
    # Assert
    assert result == expected
```

### ❌ Evitar

```python
# ❌ Ruim: Nome vago
def test_it():
    pass

# ❌ Ruim: Testar múltiplas coisas
def test_queue_and_prescription():
    # Testar queue
    # Testar prescription
    pass

# ❌ Ruim: Lógica complexa em teste
def test_complex():
    for i in range(100):
        for j in range(100):
            # lógica complexa
            pass

# ❌ Ruim: Testes interdependentes
def test_first():
    global state = create_data()

def test_second():  # Depende de test_first
    use(global state)
```

---

## Performance Tips

### Backend

```bash
# Executar apenas testes rápidos
pytest tests/ -m "not slow"

# Paralelizar testes
pytest tests/ -n auto

# Cache de fixtures
@pytest.fixture(scope="session")
def expensive_fixture():
    # Executado uma vez por sessão
    pass
```

### Frontend

```bash
# Build otimizado para testes
npm test -- --detectOpenHandles

# Coverage apenas de arquivos alterados
npm test -- --onlyChanged

# Parallelizar em CI
# GitHub Actions já faz isso automaticamente
```

---

## Integração com Editor

### VSCode - Extensions

1. Install: `Python` extension (Microsoft)
2. Install: `Jest` extension (firsttris)
3. Install: `Playwright Test for VSCode` extension

**Shortcuts:**
- `Ctrl+Shift+P` → `Python: Run Tests`
- `Ctrl+Shift+P` → `Jest: Run All`

### Configuração .vscode/settings.json

```json
{
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": [
    "backend/tests"
  ],
  "jest.runMode": "on-demand"
}
```

---

## Recursos Adicionais

### Documentação
- [Pytest Docs](https://docs.pytest.org/)
- [Jest Docs](https://jestjs.io/)
- [Playwright Docs](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/react)

### Exemplo Completo

Veja `TEST_SUITE_REPORT.md` para:
- Todos os testes implementados
- Exemplos de execução
- Resultados esperados
- Coverage report

---

## Support

Para problemas ou dúvidas:
1. Verificar este documento (TESTING.md)
2. Revisar TEST_SUITE_REPORT.md
3. Checar logs do GitHub Actions
4. Consultar docstrings dos testes
5. Abrir issue no repositório

---

**Última atualização:** June 6, 2026  
**Versão:** 1.0
