"""Laudo INSS (revisão 19/11): lado que não está no ditado gera AVISO; prompt sem dedução.
IA simulada com httpx.MockTransport — nada sai para a internet.
Roda: pytest -q --noconftest tests/test_laudo_inss_lado.py"""
import os, sys, asyncio, json
from types import SimpleNamespace
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
import httpx
import routers.laudo_inss as L

DITADO = ("paciente com dor no ombro, piora aos esforcos. Ultrassonografia do ombro com "
          "tendinite do supraespinhal. Solicito afastamento.")


class _DB:
    def __init__(self, pac): self.pac = pac
    def query(self, *_a): return self
    def filter(self, *_a): return self
    def first(self): return self.pac


def _rodar(monkeypatch, texto_ia, ditado=DITADO):
    pedidos = []

    def responder(req):
        pedidos.append(json.loads(req.content))
        return httpx.Response(200, json={"content": [{"type": "text", "text": texto_ia}],
                                         "stop_reason": "end_turn"})

    real = httpx.AsyncClient

    class Falso(real):
        def __init__(self, *a, **k):
            k["transport"] = httpx.MockTransport(responder)
            super().__init__(*a, **k)

    monkeypatch.setattr(L.httpx, "AsyncClient", Falso)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "chave-de-teste")
    pac = SimpleNamespace(id=1, name="[PACIENTE TESTE]", organization_id=1, birthdate=None, occupation=None)
    user = SimpleNamespace(role="doctor", organization_id=1)
    data = L.LaudoINSSIn(patient_id=1, ditado=ditado, conclusoes=[])
    out = asyncio.run(L.gerar_laudo(data, db=_DB(pac), current_user=user))
    return out, pedidos


def test_lado_inventado_gera_aviso(monkeypatch):
    out, pedidos = _rodar(monkeypatch, "Atesto que o paciente apresenta dor no ombro esquerdo.")
    assert len(pedidos) == 1
    assert out.aviso and "esquerdo" in out.aviso
    assert out.texto.startswith("Atesto")          # não bloqueia


def test_sem_lado_inventado_sem_aviso(monkeypatch):
    out, _ = _rodar(monkeypatch, "Atesto que o paciente apresenta dor no ombro.")
    assert out.aviso is None


def test_lado_ditado_nao_avisa(monkeypatch):
    d = DITADO.replace("dor no ombro", "dor no ombro direito")
    out, _ = _rodar(monkeypatch, "Atesto dor no ombro direito, com teste positivo à direita.", ditado=d)
    assert out.aviso is None


def test_conferir_lado_acento_e_feminino():
    assert L.conferir_lado("Lasègue positivo à ESQUERDA", "lasegue positivo") is not None
    assert L.conferir_lado("joelho direito", "joelho direito") is None
    assert "direito" in L.conferir_lado("mão direita e pé esquerdo", "pe esquerdo")


def test_prompt_exemplo_nao_deduz_lado_nem_manda_vocabulario():
    sp = L.SYSTEM_PROMPT
    assert "ultrassonografia do ombro esquerdo" not in sp
    assert "A ultrassonografia do ombro evidencia" in sp
    assert "[CONFERIR]" in sp
    assert "use quando o contexto ditado corresponder" not in sp


def test_direito_ao_beneficio_nao_e_lado():
    d = "dor no ombro, sem lado ditado"
    assert L.conferir_lado("O paciente tem direito ao benefício por incapacidade.", d) is None
    assert L.conferir_lado("Solicito, por ser seu direito, a avaliação de auxílio-doença.", d) is None
    assert L.conferir_lado("É direito de o segurado ser reavaliado.", d) is None
    # perto de região do corpo continua avisando
    assert L.conferir_lado("Tem direito ao benefício. Dor no ombro direito.", d) is not None
    assert L.conferir_lado("Teste de Lasègue positivo à direita.", "lasegue positivo") is not None
