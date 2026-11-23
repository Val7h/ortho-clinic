"""Leitura de documento pessoal e carteirinha (app do celular, 22/11/2026).
httpx simulado: nada sai para a internet. Roda: pytest -q --noconftest tests/test_ler_foto_tipos.py"""
import os, sys, io, json, hashlib, asyncio, threading
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ANTHROPIC_API_KEY"] = "chave-de-teste-nao-real"
from types import SimpleNamespace
from unittest import mock
from fastapi.testclient import TestClient
import main
import routers.patients as RP
from deps import get_current_user

SECRETARIA = SimpleNamespace(id=7, organization_id=1, role="secretary", active=True)
CHAMADAS = []
RESPOSTA = {"texto": "{}"}


class _Resp:
    status_code = 200

    def __init__(self, texto):
        self._t = texto

    def json(self):
        return {"content": [{"type": "text", "text": self._t}]}


class _ClienteFalso:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, headers=None, json=None):
        CHAMADAS.append(json)
        return _Resp(RESPOSTA["texto"])


def _cliente():
    main.app.dependency_overrides[get_current_user] = lambda: SECRETARIA
    return TestClient(main.app)


def _ler(tipo=None, resposta="{}"):
    RESPOSTA["texto"] = resposta
    CHAMADAS.clear()
    dados = {"tipo": tipo} if tipo else {}
    with mock.patch.object(RP.httpx, "AsyncClient", _ClienteFalso):
        return _cliente().post("/patients/ler-foto", data=dados,
                               files={"file": ("f.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")})


CPF_OK = "52998224725"


def test_prompt_da_ficha_intocado():
    # Se este teste falhar, o "Cadastro por foto" do PC mudou. Não mude sem o Valth.
    assert hashlib.sha256(RP.LER_FOTO_PROMPT.encode()).hexdigest() == \
        "d998c2bf77cff928adf5c41c003026b25128601a0efcd67f7f6828444b59aad4"


def test_sem_tipo_mesmo_prompt_e_mesmo_formato():
    r = _ler(None, json.dumps({"name": "fulano ficticio", "cpf": "529.982.247-25", "phone": "(83) 99999-0000"}))
    assert r.status_code == 200
    assert CHAMADAS[0]["messages"][0]["content"][1]["text"] == RP.LER_FOTO_PROMPT
    j = r.json()
    assert set(j) == {"campos", "cpf_valido", "lidos", "aviso"}
    assert set(j["campos"]) == set(RP.LER_FOTO_CAMPOS)
    assert j["campos"]["name"] == "FULANO FICTICIO" and j["cpf_valido"] is True


def test_tipo_ficha_explicito_igual_ao_sem_tipo():
    _ler("ficha", "{}")
    assert CHAMADAS[0]["messages"][0]["content"][1]["text"] == RP.LER_FOTO_PROMPT


def test_tipo_invalido_422():
    assert _ler("laudo").status_code == 422


def test_documento_pessoal_le_os_4_campos():
    r = _ler("identity", json.dumps({
        "name": {"valor": "maria ficticia da silva", "rotulo": "NOME", "linha": "NOME MARIA FICTICIA DA SILVA"},
        "birthdate": {"valor": "1980-05-17", "rotulo": "DATA DE NASCIMENTO", "linha": "17/05/1980"},
        "cpf": {"valor": "529.982.247-25", "rotulo": "CPF", "linha": "CPF 529.982.247-25"},
        "rg": {"valor": "1234567 SSP/PB", "rotulo": "REGISTRO GERAL", "linha": "1234567 SSP/PB"},
    }))
    j = r.json()
    assert CHAMADAS[0]["messages"][0]["content"][1]["text"] == RP.LER_DOC_PROMPTS["identity"]
    assert j["campos"] == {"name": "MARIA FICTICIA DA SILVA", "birthdate": "1980-05-17", "cpf": CPF_OK, "rg": "1234567 SSP/PB"}
    assert j["motivos"] == {}


def test_cpf_so_do_titular_fica_vazio():
    r = _ler("insurance_card", json.dumps({
        "name": {"valor": "JOAO FICTICIO JUNIOR", "rotulo": "BENEFICIÁRIO", "linha": "BENEFICIÁRIO JOAO FICTICIO JUNIOR"},
        "cpf": {"valor": CPF_OK, "rotulo": "CPF TIT.", "linha": "CPF TIT. 529.982.247-25"},
    }))
    j = r.json()
    assert j["campos"]["cpf"] is None and "titular" in j["motivos"]["cpf"]
    assert j["campos"]["name"] == "JOAO FICTICIO JUNIOR"


def test_cpf_na_carteirinha_com_resp_na_linha_de_baixo_vazio():
    r = _ler("insurance_card", json.dumps({
        "cpf": {"valor": CPF_OK, "rotulo": "CPF", "linha": "CPF 529.982.247-25", "linha_abaixo": "RESP. FINANCEIRO"},
    }))
    assert r.json()["campos"]["cpf"] is None


def test_cpf_na_carteirinha_sem_rotulo_vazio():
    r = _ler("insurance_card", json.dumps({"cpf": {"valor": CPF_OK, "rotulo": None, "linha": "529.982.247-25"}}))
    assert r.json()["campos"]["cpf"] is None


def test_nome_na_linha_do_titular_vazio():
    r = _ler("insurance_card", json.dumps({"name": {"valor": "PAI FICTICIO", "rotulo": "TITULAR", "linha": "TITULAR PAI FICTICIO"}}))
    assert r.json()["campos"]["name"] is None


def test_cpf_digito_errado_vazio_com_motivo():
    r = _ler("identity", json.dumps({"cpf": {"valor": "52998224726", "rotulo": "CPF", "linha": "CPF"}}))
    j = r.json()
    assert j["campos"]["cpf"] is None and j["motivos"]["cpf"] == "CPF com dígito errado"


def test_data_impossivel_vazia():
    for d in ("1899-12-31", "2099-01-01", "1980-02-30", "17/05/1980"):
        r = _ler("identity", json.dumps({"birthdate": {"valor": d, "rotulo": "NASCIMENTO", "linha": d}}))
        assert r.json()["campos"]["birthdate"] is None, d


def test_numero_da_carteirinha_so_digitos_6_a_20():
    r = _ler("insurance_card", json.dumps({
        "insurance": {"valor": "UNIMED CAMPINA GRANDE", "linha": "UNIMED CAMPINA GRANDE"},
        "insurance_plan": {"valor": "UNIPART EMPRESARIAL", "linha": "PLANO UNIPART EMPRESARIAL"},
        "insurance_number": {"valor": "0 123 456789012-3", "rotulo": "CARTEIRA", "linha": "0 123 456789012-3"},
    }))
    j = r.json()["campos"]
    assert j["insurance_number"] == "01234567890123" and j["insurance"] == "UNIMED CAMPINA GRANDE"
    assert _ler("insurance_card", json.dumps({"insurance_number": {"valor": "123", "linha": "123"}})).json()["campos"]["insurance_number"] is None


def test_duvidoso_volta_vazio_com_motivo():
    r = _ler("identity", json.dumps({"rg": {"valor": "99", "linha": "99", "duvidoso": True}}))
    j = r.json()
    assert j["campos"]["rg"] is None and j["motivos"]["rg"] == "leitura duvidosa"


def test_resposta_sem_json_avisa_e_nao_grava():
    j = _ler("identity", "não consegui").json()
    assert j["lidos"] == [] and j["aviso"]


def test_fila_cheia_tente_de_novo():
    async def cenario():
        trava = RP._trava_leitura()
        await trava.acquire()          # outra leitura em andamento
        try:
            arq = SimpleNamespace(content_type="image/jpeg")
            async def ler():
                return b"\xff\xd8\xff123"
            arq.read = ler
            with mock.patch.object(RP, "LER_DOC_ESPERA_S", 0.05):
                try:
                    await RP._ler_documento(arq, "identity")
                    return None
                except RP.HTTPException as e:
                    return e
        finally:
            trava.release()
    e = asyncio.run(cenario())
    assert e is not None and e.status_code == 429 and "Tente de novo" in e.detail


def test_rg_maior_que_20_volta_vazio_com_motivo():
    j = _ler("identity", json.dumps({"rg": {"valor": "1234567890 SSP/PB 2a VIA", "rotulo": "RG", "linha": "x"}})).json()
    assert j["campos"]["rg"] is None and "20" in j["motivos"]["rg"]
    j = _ler("identity", json.dumps({"rg": {"valor": "1234567 SSP/PB", "rotulo": "RG", "linha": "x"}})).json()
    assert j["campos"]["rg"] == "1234567 SSP/PB"


def test_foto_que_nao_e_o_documento_e_recusada():
    # 22/11: Valth fotografou um comprovante de compra como "Documento pessoal".
    for tipo in ("identity", "insurance_card"):
        r = _ler(tipo, json.dumps({"e_documento": False, "name": {"valor": "LOJA FICTICIA"}}))
        j = r.json()
        assert r.status_code == 200 and j["nao_e_documento"] is True
        assert all(v is None for v in j["campos"].values()) and j["lidos"] == []
        assert "não parece" in j["aviso"]


def test_documento_de_verdade_segue_igual():
    r = _ler("identity", json.dumps({"e_documento": True, "cpf": {"valor": CPF_OK, "rotulo": "CPF", "linha": "CPF " + CPF_OK}}))
    j = r.json()
    assert "nao_e_documento" not in j and j["campos"]["cpf"] == CPF_OK

