"""Emissor unico de documentos (27/11/2026): chave reservada no banco ANTES de gerar; documento so com a reserva.
Dados 100% inventados (o repositorio e publico). Nenhuma IA e chamada. Banco: SQLite em arquivo temporario.
Rodar (de backend/): python -m pytest -q --noconftest tests/test_emissor.py
O mesmo fluxo em Postgres de verdade (trava do banco + indice parcial): tests/test_emissor_pg.py."""
import os
import sys
import threading
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["ESCRIBA_PONTE_TOKEN"] = "chave-de-teste-da-ponte-com-mais-de-24"
os.environ["ESCRIBA_PONTE_ORG_ID"] = "1"

import fitz  # noqa: E402
import pytest  # noqa: E402
from fastapi import Depends, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import main  # noqa: E402
import deps  # noqa: E402
from database import Base, get_db  # noqa: E402
from models.documents import ExamRequest, MedicalReport  # noqa: E402
from models.emissor import EmissorChave  # noqa: E402
from models.organization import Organization, User  # noqa: E402
from models.patient import Patient  # noqa: E402
from models.patient_documents import PatientDocument  # noqa: E402
from models.patient_rx import PatientRx  # noqa: E402
import routers.patient_documents as RPD  # noqa: E402
import routers.patient_prescriptions as RPX  # noqa: E402
from services import emissor as E  # noqa: E402
from services import regua as G  # noqa: E402
from tzutil import today_br  # noqa: E402

PONTE = {"X-Escriba-Ponte": os.environ["ESCRIBA_PONTE_TOKEN"]}
MEDICO = {"X-Teste-Usuario": "10"}
MEDICO_OUTRA_ORG = {"X-Teste-Usuario": "20"}
SUPERADMIN = {"X-Teste-Usuario": "30"}
NOME = "Paciente Inventado Da Silva"
CELECOXIBE = "USO ORAL\n\nCELECOXIBE 200MG ------------ 1CX\n\nTOMAR 1 CP DE 12 EM 12H."


def montar(url):
    eng = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
                        pool_size=30, max_overflow=10) if not url.startswith("sqlite") else \
        create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})
    if url.startswith("sqlite"):
        @event.listens_for(eng, "connect")
        def _wal(con, _r):
            con.execute("PRAGMA journal_mode=WAL")
    if not url.startswith("sqlite"):   # Postgres LOCAL de teste: derruba conexoes velhas antes de recriar as tabelas
        with eng.begin() as con:
            con.exec_driver_sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                                "WHERE datname = current_database() AND pid <> pg_backend_pid()")
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    with eng.begin() as con:   # tabela do banco de producao criada fora do repositorio (routers/medicamentos.py le)
        con.exec_driver_sql("CREATE TABLE IF NOT EXISTS medicamento_termos (termo text, tipo text)")
    S = sessionmaker(bind=eng)
    db = S()
    db.add_all([Organization(id=1, name="Org Teste"), Organization(id=2, name="Outra Org")])
    db.flush()
    db.add_all([User(id=10, organization_id=1, name="Dr Teste", email="dr@x.test", password_hash="x", role="doctor",
                     active=True),
                User(id=20, organization_id=2, name="Dr Outro", email="dr2@x.test", password_hash="x", role="doctor",
                     active=True),
                User(id=30, organization_id=1, name="Dono Teste", email="su@x.test", password_hash="x",
                     role="superadmin", active=True)])
    p = Patient(name=NOME, organization_id=1, active=True, insurance="UNIMED TESTE")
    p2 = Patient(name="Outro Paciente Ficticio", organization_id=1, active=True)
    p3 = Patient(name="Paciente Da Outra Conta", organization_id=2, active=True)
    db.add_all([p, p2, p3])
    db.commit()
    ids = (p.id, p2.id, p3.id)
    db.close()
    return eng, S, ids


@pytest.fixture
def amb(tmp_path, monkeypatch):
    eng, S, ids = montar(f"sqlite:///{tmp_path / 'emissor.db'}")

    def get_db_teste():
        s = S()
        try:
            yield s
        finally:
            s.close()

    def usuario_teste(x_teste_usuario: str = Header("10"), db=Depends(get_db_teste)):
        u = db.query(User).filter(User.id == int(x_teste_usuario)).first()
        if not u:
            raise HTTPException(401, "x")
        return u

    main.app.dependency_overrides[get_db] = get_db_teste
    main.app.dependency_overrides[deps.get_current_user] = usuario_teste
    monkeypatch.setattr(RPD, "upload_file", lambda conteudo, nome, folder="x": f"/uploads/{folder}/{nome}")
    yield TestClient(main.app), S, ids
    main.app.dependency_overrides.clear()
    eng.dispose()


def reservar(c, pid, tipo, itens=(), conteudo=None, h=MEDICO, **k):
    r = c.post("/emissor/reservar", json={"patient_id": pid, "tipo": tipo, "itens": list(itens), "conteudo": conteudo, **k},
               headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def lote_h(res, h=MEDICO):
    return {**h, "X-Emissor-Lote": res["cabecalho"]}


def gravar_receita(c, pid, res, texto=CELECOXIBE, h=MEDICO):
    return c.post(f"/patients/{pid}/prescriptions", json={"date": today_br().isoformat(), "instructions": texto},
                  headers=lote_h(res, h) if res else h)


def pdf(linhas):
    d = fitz.open()
    pg = d.new_page()
    for n, l in enumerate(linhas):
        pg.insert_text((40, 60 + 18 * n), l, fontsize=9, fontname="helv")
    b = d.tobytes()
    d.close()
    return b


def subir_guia(c, pid, res, linhas, titulo="Guia SP/SADT TESTE", h=MEDICO, indicacao="DOR NO OMBRO"):
    return c.post(f"/patients/{pid}/documents/upload", headers=lote_h(res, h) if res else h,
                  data={"title": titulo, "category": "referral", "date": today_br().isoformat(), "description": "teste",
                        "indicacao": indicacao},
                  files={"file": ("guia.pdf", pdf(linhas), "application/pdf")})


# ---------------------------------------------------------------- regua: chaves -------------------------------------
def test_fisio_tipo_e_regiao_sem_lado():
    # "FISIOTERAPIA" x "FISIOTERAPIA MOTORA - OMBRO DIREITO", nas duas ordens: o mesmo documento
    assert G.mesmo_item("fisio", "FISIOTERAPIA", "FISIOTERAPIA MOTORA - OMBRO DIREITO")
    assert G.mesmo_item("fisio", "FISIOTERAPIA MOTORA - OMBRO DIREITO", "FISIOTERAPIA")
    # ombro x joelho e RPG x motora: diferentes
    assert not G.mesmo_item("fisio", "FISIOTERAPIA MOTORA OMBRO", "FISIOTERAPIA MOTORA JOELHO")
    assert not G.mesmo_item("fisio", "RPG", "FISIOTERAPIA MOTORA")
    # decisao 2 (27/11): ombro D e ombro E no mesmo dia = UM documento (a chave nao tem lado)
    assert G.chave_fisio("FISIOTERAPIA MOTORA OMBRO DIREITO") == G.chave_fisio("FISIOTERAPIA MOTORA OMBRO ESQUERDO")
    assert G.mesmo_item("fisio", "FISIOTERAPIA OMBRO DIREITO", "FISIOTERAPIA OMBRO ESQUERDO")
    # fisio dentro de guia de exame ou de encaminhamento vira tipo fisio
    assert G.chaves_item("exame", "FISIOTERAPIA MOTORA - OMBRO|10") == [("fisio", "fisio|motora|ombro")]
    assert G.chaves_item("encaminhamento", "Encaminhamento — Fisioterapia — motora")[0][0] == "fisio"


def test_exame_mantem_lado_e_tuss_so_no_laboratorio():
    assert G.chaves_item("exame", "RNM DO JOELHO DIREITO|1") == [("exame", "ressonancia||joelho|D")]
    assert [k for _, k in G.chaves_item("exame", "RNM JOELHOS")] == ["ressonancia||joelho|D", "ressonancia||joelho|E"]
    assert G.chaves_item("exame", "HEMOGRAMA COMPLETO") == G.chaves_item("exame", "HEMOGRAMA") == [("exame", "lab|40304361")]
    assert G.chaves_item("exame", "RNM DO OMBRO ESQUERDO") != G.chaves_item("exame", "RNM DO JOELHO ESQUERDO")
    assert G.chaves_item("receita", "CIBEX 200MG") == G.chaves_item("receita", "CELECOXIBE 400MG") == [("receita", "rx|celecoxibe")]


# ---------------------------------------------------------------- reservar e gravar ---------------------------------
def test_reserva_grava_e_repeticao_devolve_o_mesmo(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert r["reservado"] and r["itens"][0]["situacao"] == "novo" and r["itens"][0]["chave"] == "rx|celecoxibe"
    # outro gerador ao mesmo tempo: em andamento, sem reserva
    r2 = reservar(c, pid, "receita", conteudo="USO ORAL\nCIBEX 200MG ---- 1CX", h=PONTE, dono="escriba")
    assert not r2["reservado"] and r2["itens"][0]["situacao"] == "em_andamento" and r2["itens"][0]["dono"] == "sessao"
    g = gravar_receita(c, pid, r)
    assert g.status_code == 201, g.text
    rx_id = g.json()["id"]
    # mesmo lote de novo: a MESMA receita
    assert gravar_receita(c, pid, r).json()["id"] == rx_id
    # pedido repetido: ja existe, com o documento e a hora
    r3 = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    it = r3["itens"][0]
    assert not r3["reservado"] and it["situacao"] == "existe" and it["doc"] == {"kind": "receita", "id": rx_id}
    assert "já existe receita" in it["aviso"] and "feito às" in it["aviso"] and it["hora"]
    db = S()
    assert db.query(PatientRx).count() == 1
    assert db.query(EmissorChave).filter(EmissorChave.estado == "pronto").count() == 1


def test_lote_de_outro_ou_inventado_da_409_e_nada_e_criado(amb):
    c, S, (pid, p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    falso = {**MEDICO, "X-Emissor-Lote": r["lote"] + ":" + "0" * 32}
    g = c.post(f"/patients/{pid}/prescriptions", json={"date": today_br().isoformat(), "instructions": CELECOXIBE},
               headers=falso)
    assert g.status_code == 409
    # o lote de um paciente nao grava em outro
    assert gravar_receita(c, p2, r).status_code == 409
    # cabecalho malformado: 422
    assert c.post(f"/patients/{pid}/prescriptions", json={"date": today_br().isoformat(), "instructions": "X"},
                  headers={**MEDICO, "X-Emissor-Lote": "abc"}).status_code == 422
    # conteudo que nao bate com a reserva: 422
    assert gravar_receita(c, pid, r, texto="USO ORAL\nDIPIRONA 1G ---- 1CX").status_code == 422
    assert S().query(PatientRx).count() == 0


def test_sem_cabecalho_tudo_igual(amb):
    c, S, (pid, _p2, _p3) = amb
    assert gravar_receita(c, pid, None).status_code == 201
    assert S().query(EmissorChave).count() == 0


def test_documento_feito_a_mao_antes_e_encontrado(amb):
    c, S, (pid, _p2, _p3) = amb
    assert gravar_receita(c, pid, None).status_code == 201          # a tela, sem reserva
    c.post(f"/patients/{pid}/exams", json={"date": today_br().isoformat(), "exams": [],
                                          "free_text": "SOLICITO: \n\n\nTOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBOSSACRA\n\nHD: DOR"},
           headers=MEDICO)
    r = reservar(c, pid, "receita", conteudo="USO ORAL\nCIBEX 200MG ---- 1CX\nTOMAR 1 CP")
    assert not r["reservado"] and r["itens"][0]["situacao"] == "existe" and r["itens"][0]["doc"]["kind"] == "receita"
    r = reservar(c, pid, "exame", ["TOMOGRAFIA DA COLUNA LOMBAR"])
    assert r["itens"][0]["situacao"] == "existe" and r["itens"][0]["doc"]["kind"] == "exame"
    # RNM da mesma regiao depois da TC e legitima
    assert reservar(c, pid, "exame", ["RNM DA COLUNA LOMBAR"])["reservado"]


def test_tudo_ou_nada_e_parcial(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "exame", ["RNM DO JOELHO DIREITO"])
    g = c.post(f"/patients/{pid}/exams", headers=lote_h(r),
               json={"date": today_br().isoformat(), "exams": [], "free_text": "SOLICITO: \n\n\nRNM DO JOELHO DIREITO SEM CONTRASTE\n\nHD: DOR"})
    assert g.status_code == 201, g.text
    r = reservar(c, pid, "exame", ["RESSONANCIA DO JOELHO DIREITO", "RNM DO OMBRO DIREITO"])
    assert not r["reservado"] and r["novos"] == ["RNM DO OMBRO DIREITO"] and "NOVOS" in r["mensagem"]
    r = reservar(c, pid, "exame", ["RESSONANCIA DO JOELHO DIREITO", "RNM DO OMBRO DIREITO"], parcial=True)
    assert r["reservado"] and [i["situacao"] for i in r["itens"]] == ["existe", "novo"]
    # lado nao dito casa com qualquer lado; outro lado e outro exame
    assert reservar(c, pid, "exame", ["RNM DO JOELHO"])["itens"][0]["situacao"] == "existe"
    assert reservar(c, pid, "exame", ["RNM DO JOELHO ESQUERDO"])["reservado"]


def test_um_lote_um_documento(amb):
    c, S, (pid, _p2, _p3) = amb
    for itens in (["RNM DO JOELHO DIREITO", "TC DO JOELHO DIREITO"], ["RNM DO JOELHO DIREITO", "FISIOTERAPIA MOTORA"]):
        assert c.post("/emissor/reservar", json={"patient_id": pid, "tipo": "exame", "itens": itens},
                      headers=MEDICO).status_code == 422
    seis = [f"RX DO {r}" for r in ("JOELHO D", "OMBRO D", "PUNHO D", "COTOVELO D", "TORNOZELO D", "QUADRIL D")]
    assert c.post("/emissor/reservar", json={"patient_id": pid, "tipo": "exame", "itens": seis, "guia": True},
                  headers=MEDICO).status_code == 422


def test_reserva_vencida_e_assumida_e_o_dono_antigo_leva_409(amb):
    c, S, (pid, _p2, _p3) = amb
    velho = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    db = S()
    db.query(EmissorChave).update({"vence_em": datetime.now(timezone.utc) - timedelta(seconds=1)})
    db.commit()
    novo = reservar(c, pid, "receita", conteudo=CELECOXIBE, h=PONTE)
    assert novo["reservado"] and novo["lote"] != velho["lote"]
    assert gravar_receita(c, pid, velho).status_code == 409             # nao sai segundo papel
    assert gravar_receita(c, pid, novo).status_code == 201
    db = S()
    assert db.query(PatientRx).count() == 1
    linha = db.query(EmissorChave).one()                                   # a MESMA linha, token novo
    assert linha.tentativas == 2 and linha.estado == "pronto"


def test_falhou_libera_a_chave_e_renovar(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert c.post(f"/emissor/lotes/{r['lote']}/renovar", json={"token": r["token"]}, headers=MEDICO).status_code == 200
    assert c.post(f"/emissor/lotes/{r['lote']}/falhou", json={"token": "x" * 32}, headers=MEDICO).status_code == 409
    assert c.post(f"/emissor/lotes/{r['lote']}/falhou", json={"token": r["token"], "motivo": "site fora"},
                  headers=MEDICO).json()["liberadas"] == 1
    assert gravar_receita(c, pid, r).status_code == 409                  # lote falhado nao grava
    r2 = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert r2["reservado"]
    assert gravar_receita(c, pid, r2).status_code == 201
    # depois de gravado nao da para marcar falha
    assert c.post(f"/emissor/lotes/{r2['lote']}/falhou", json={"token": r2["token"]}, headers=MEDICO).status_code == 409


def test_troca_so_com_a_ordem_e_nada_e_apagado(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    rx1 = gravar_receita(c, pid, r).json()["id"]
    t400 = "USO ORAL\n\nCELECOXIBE 400MG ------------ 1CX\n\nTOMAR 1 CP AO DIA."
    # sem a palavra: ja existe, feito as HH:MM
    r = reservar(c, pid, "receita", conteudo=t400, ordem="passa o celecoxibe 400")
    assert not r["reservado"] and r["itens"][0]["situacao"] == "existe" and "feito às" in r["itens"][0]["aviso"]
    # com "troca": documento novo, a chave antiga fica substituida
    r = reservar(c, pid, "receita", conteudo=t400, ordem="troca o celecoxibe para 400")
    assert r["reservado"]
    rx2 = gravar_receita(c, pid, r, texto=t400).json()["id"]
    db = S()
    assert rx2 != rx1 and db.query(PatientRx).count() == 2                 # a antiga continua la
    estados = sorted((x.estado, x.doc_id) for x in db.query(EmissorChave).all())
    assert estados == [("pronto", rx2), ("substituido", rx1)]
    # a nova vale daqui para a frente
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert r["itens"][0]["situacao"] == "existe" and r["itens"][0]["doc"]["id"] == rx2


def test_troca_que_falha_volta_a_antiga(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    rx1 = gravar_receita(c, pid, r).json()["id"]
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE, troca=True)
    c.post(f"/emissor/lotes/{r['lote']}/falhou", json={"token": r["token"]}, headers=MEDICO)
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert r["itens"][0]["situacao"] == "existe" and r["itens"][0]["doc"]["id"] == rx1


def test_receita_com_e_sem_traco(amb):
    c, S, (pid, _p2, _p3) = amb
    sem = "USO ORAL\n\nCELECOXIBE 200MG 1 CX\nTOMAR 1 CP DE 12 EM 12H\nGelo local"
    r = reservar(c, pid, "receita", conteudo=sem)
    assert [i["chave"] for i in r["itens"]] == ["rx|celecoxibe"]
    assert gravar_receita(c, pid, r, texto=sem).status_code == 201
    assert reservar(c, pid, "receita", conteudo=CELECOXIBE)["itens"][0]["situacao"] == "existe"


def test_outro_dia_sai_documento_novo(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    gravar_receita(c, pid, r)
    db = S()
    amanha = today_br() + timedelta(days=1)
    res = E.reservar(db, 1, pid, "receita", conteudo=CELECOXIBE, dia=amanha)
    assert res["reservado"] and res["itens"][0]["situacao"] == "novo"


def test_isolamento_paciente_e_conta(amb):
    c, S, (pid, p2, p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    gravar_receita(c, pid, r)
    assert reservar(c, p2, "receita", conteudo=CELECOXIBE)["reservado"]          # outro paciente
    # paciente de outra conta: 404 para o medico daqui e para a ponte (conta 1)
    assert c.post("/emissor/reservar", json={"patient_id": p3, "tipo": "receita", "conteudo": CELECOXIBE},
                  headers=MEDICO).status_code == 404
    assert c.post("/emissor/ponte/reservar", json={"patient_id": p3, "tipo": "receita", "conteudo": CELECOXIBE},
                  headers=PONTE).status_code == 404
    assert reservar(c, p3, "receita", conteudo=CELECOXIBE, h=MEDICO_OUTRA_ORG)["reservado"]
    assert c.get(f"/emissor/paciente/{pid}/hoje", headers=MEDICO_OUTRA_ORG).status_code == 404
    assert c.post("/emissor/ponte/reservar", json={"patient_id": pid, "tipo": "receita"}).status_code == 401
    hoje = c.get(f"/emissor/paciente/{pid}/hoje", headers=MEDICO).json()
    assert [h["estado"] for h in hoje] == ["pronto"]


def test_encaminhamento_atestado_justificativa(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "atestado")
    g = c.post(f"/patients/{pid}/reports", headers=lote_h(r), json={"date": today_br().isoformat(), "report_type": "atestado",
                                                                  "title": "Atestado", "content": "Atesto (texto ficticio)."})
    assert g.status_code == 201, g.text
    assert reservar(c, pid, "atestado")["itens"][0]["situacao"] == "existe"
    r = reservar(c, pid, "encaminhamento", ["Encaminhamento — Reumatologia"])
    # lote de encaminhamento nao grava atestado
    assert c.post(f"/patients/{pid}/reports", headers=lote_h(r), json={"date": today_br().isoformat(),
                  "report_type": "atestado", "title": "x", "content": "x"}).status_code == 409
    assert c.post(f"/patients/{pid}/reports", headers=lote_h(r), json={"date": today_br().isoformat(),
                  "report_type": "encaminhamento", "title": "Encaminhamento — Reumatologia",
                  "content": "Encaminho (ficticio)."}).status_code == 201
    assert reservar(c, pid, "encaminhamento", ["Reumatologia"])["itens"][0]["situacao"] == "existe"
    assert reservar(c, pid, "encaminhamento", ["Neurocirurgia"])["reservado"]


# ---------------------------------------------------------------- guia: conferencia do PDF ---------------------------
def test_upload_confere_nome_e_itens_e_grava_historico(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "fisio", ["FISIOTERAPIA MOTORA OMBRO"], guia=True)
    # PDF com o conteudo da USG (caso de 27/11) no lote da fisio: 422, nada gravado
    usg = subir_guia(c, pid, r, [NOME.upper(), "ULTRASSONOGRAFIA DO OMBRO ESQUERDO"])
    assert usg.status_code == 422 and "não traz" in usg.json()["detail"]
    db = S()
    assert db.query(PatientDocument).count() == 0 and db.query(ExamRequest).count() == 0
    ok = subir_guia(c, pid, r, [NOME.upper(), "FISIOTERAPIA MOTORA", "10"])
    assert ok.status_code == 201, ok.text
    assert "aviso" not in ok.json()
    doc_id = ok.json()["id"]
    assert subir_guia(c, pid, r, [NOME.upper(), "FISIOTERAPIA MOTORA"]).json()["id"] == doc_id   # mesmo lote: o mesmo
    db = S()
    assert db.query(PatientDocument).count() == 1
    hist = db.query(ExamRequest).one()
    assert "FISIOTERAPIA MOTORA OMBRO" in hist.free_text and "Solicitado em guia SP/SADT" in hist.free_text
    assert "HD: DOR NO OMBRO" in hist.free_text
    # fisio do ombro do outro lado no mesmo dia: o mesmo documento (decisao 2)
    r2 = reservar(c, pid, "fisio", ["FISIOTERAPIA MOTORA OMBRO ESQUERDO"], guia=True)
    assert not r2["reservado"] and r2["itens"][0]["doc"] == {"kind": "guia", "id": doc_id}


def test_upload_de_exame_aceita_descricao_cortada(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "exame", ["ULTRASSONOGRAFIA DO OMBRO ESQUERDO|1"], guia=True)
    ok = subir_guia(c, pid, r, [NOME.upper(), "22 40901220 ULTRASSONOGRAFIA DO OMBRO E... 1"])
    assert ok.status_code == 201, ok.text


# ---------------------------------------------------------------- concorrencia ---------------------------------------
def _corrida(n, alvo):
    barreira = threading.Barrier(n)
    erros = []

    def rodar(i):
        try:
            barreira.wait()
            alvo(i)
        except Exception as e:  # noqa: BLE001
            erros.append(repr(e))
    ts = [threading.Thread(target=rodar, args=(i,)) for i in range(n)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(60)
    return erros


def vinte_iguais(S, pid):
    """20 pedidos IGUAIS ao mesmo tempo (reservar + gravar, cada um com a sua sessao de banco): 1 documento."""
    from schemas.documents import ExamRequestCreate  # noqa: F401
    resultados = []

    def um(i):
        db = S()
        try:
            res = E.reservar(db, 1, pid, "receita", conteudo=CELECOXIBE, dono="sessao" if i % 2 else "escriba")
            resultados.append(res["reservado"])
            if res["reservado"]:
                u = db.query(User).filter(User.id == 10).first()
                RPX.create_prescription(pid, RPX.PatientRxCreate(date=today_br().isoformat(), instructions=CELECOXIBE),
                                        db, u, x_emissor_lote=res["cabecalho"])
        finally:
            db.close()
    erros = _corrida(20, um)
    db = S()
    try:
        return erros, resultados, db.query(PatientRx).filter(PatientRx.patient_id == pid).count(), \
            db.query(EmissorChave).filter(EmissorChave.estado.in_(("reservado", "pronto"))).count()
    finally:
        db.close()


def test_vinte_pedidos_iguais_ao_mesmo_tempo_dao_um_documento(amb):
    c, S, (pid, _p2, _p3) = amb
    erros, resultados, docs, chaves = vinte_iguais(S, pid)
    assert erros == [] and len(resultados) == 20
    assert resultados.count(True) == 1 and docs == 1 and chaves == 1


def test_dois_gravar_no_mesmo_lote_dao_um(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    ids = []

    def gravar(_i):
        db = S()
        try:
            u = db.query(User).filter(User.id == 10).first()
            rx = RPX.create_prescription(pid, RPX.PatientRxCreate(date=today_br().isoformat(), instructions=CELECOXIBE),
                                         db, u, x_emissor_lote=r["cabecalho"])
            ids.append(rx.id)
        finally:
            db.close()
    assert _corrida(5, gravar) == []
    assert len(set(ids)) == 1 and S().query(PatientRx).count() == 1


def test_caso_marina_usg_e_fisio_por_dois_geradores_ao_mesmo_tempo(amb):
    """27/11: a sessao e o "Tudo de hoje" fizeram a mesma guia no mesmo segundo. Agora: 1 guia de USG + 1 de fisio."""
    c, S, (pid, _p2, _p3) = amb
    pedidos = [("exame", "ULTRASSONOGRAFIA DO OMBRO ESQUERDO|1"), ("fisio", "FISIOTERAPIA MOTORA OMBRO ESQUERDO|10")]
    feitos, avisos = [], []

    def gerador(i):
        cli = TestClient(main.app)
        h = MEDICO if i % 2 == 0 else PONTE
        rota = "/emissor/reservar" if i % 2 == 0 else "/emissor/ponte/reservar"
        for tipo, item in (pedidos if i % 2 == 0 else list(reversed(pedidos))):
            res = cli.post(rota, json={"patient_id": pid, "tipo": tipo, "itens": [item], "guia": True,
                                       "dono": "sessao" if i % 2 == 0 else "escriba"}, headers=h).json()
            if not res["reservado"]:
                avisos.append(res["itens"][0]["situacao"])
                continue
            desc = item.split("|")[0]
            up = subir_guia(cli, pid, res, [NOME.upper(), desc, "1"], titulo=f"Guia SP/SADT - {tipo}")
            assert up.status_code == 201, up.text
            feitos.append((tipo, up.json()["id"]))
    assert _corrida(4, gerador) == []
    db = S()
    guias = db.query(PatientDocument).all()
    assert len(guias) == 2 and sorted(t for t, _ in feitos) == ["exame", "fisio"]
    hist = [h.free_text for h in db.query(ExamRequest).all()]
    assert len(hist) == 2 and any("ULTRASSONOGRAFIA" in h for h in hist) and any("FISIOTERAPIA" in h for h in hist)
    assert set(avisos) <= {"em_andamento", "existe"} and len(avisos) == 6


# ---------------------------------------------------------------- P4: o Escriba so sugere -----------------------------
def test_escriba_botao_com_documento_pronto_vira_feito_sem_pedido(amb):
    import json
    from models.escriba import EscribaPedido, EscribaSessao, EscribaSugestao
    from models.queue import WaitingRoomEntry
    c, S, (pid, _p2, _p3) = amb
    db = S()
    e = WaitingRoomEntry(patient_id=pid, position=1, entry_date=today_br(), status="attending", active_seconds=0)
    db.add(e)
    db.commit()
    s = EscribaSessao(organization_id=1, entry_id=e.id, patient_id=pid, estado="gravando")
    db.add(s)
    db.commit()
    rx = EscribaSugestao(organization_id=1, sessao_id=s.id, entry_id=e.id, patient_id=pid, chave="receita:celecoxibe",
                         tipo="receita", rotulo="Celecoxibe", conferida=True, estado="nova",
                         dados=json.dumps({"texto": "USO ORAL\nCELECOXIBE 200MG ---- 1CX\nTOMAR 1 CP", "tipo": "simples"}))
    ex = EscribaSugestao(organization_id=1, sessao_id=s.id, entry_id=e.id, patient_id=pid, chave="exame:usg",
                         tipo="exame", rotulo="USG ombro", conferida=True, estado="nova",
                         dados=json.dumps({"itens": ["ULTRASSONOGRAFIA DO OMBRO ESQUERDO"], "hd": "DOR", "classe": "Ultrassonografia"}))
    db.add_all([rx, ex])
    db.commit()
    rx_id, ex_id, eid = rx.id, ex.id, e.id
    db.close()
    # a sessao fez a receita (com reserva) e esta fazendo a USG agora
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    doc = gravar_receita(c, pid, r).json()["id"]
    reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True)
    j = c.post(f"/escriba/sugestoes/entrada/{eid}/gerar-pendentes", json={"sugestao_ids": [rx_id, ex_id]},
               headers=MEDICO).json()
    assert j["novos"] == 0 and j["feitos"] == 1 and j["gerando"] == 1 and j["terminado"] is False
    itens = {i["sugestao_id"]: i for i in j["itens"]}
    assert itens[rx_id]["estado"] == "feita" and itens[rx_id]["emissor"]["documentos"] == \
        [{"kind": "receita", "id": doc, "ja_existia": True}]
    assert itens[ex_id]["emissor"]["situacao"] == "em_andamento" and itens[ex_id]["pode_gerar"] is False
    db = S()
    assert db.query(EscribaPedido).count() == 0
    # botao "Gerar guia oficial (PC)": nao cria pedido enquanto outro gerador faz
    g = c.post(f"/escriba/sugestoes/{ex_id}/guia", headers=MEDICO).json()
    assert g["id"] is None and g["estado"] == "pego" and "em andamento" in g["resultado"]
    assert db.query(EscribaPedido).count() == 0
    # sem lista de marcados: nada
    assert c.post(f"/escriba/sugestoes/entrada/{eid}/gerar-pendentes", headers=MEDICO).json()["novos"] == 0


# ---------------------------------------------------------------- P6: contagem da IA ---------------------------------
def test_contagem_da_ia_so_numeros(amb):
    from services import ia_limits as IA
    c, S, _ids = amb
    IA.reset_para_teste()
    IA.permitir("chat", "sessao-a", "texto qualquer 1")
    IA.permitir("chat", "sessao-a", "texto qualquer 2")
    IA.registrar_uso("chat", "modelo-x", 100, 20)
    IA.registrar_falha("chat", "timeout")
    with pytest.raises(IA.AnthropicBloqueado):
        IA.permitir("chat", "sessao-a", "texto qualquer 2")   # repetido: barrado (regra de sempre)
    assert c.get("/ia/contagem", headers=MEDICO).status_code == 403          # so superadmin (contador e global)
    n = c.get("/ia/contagem", headers=SUPERADMIN).json()
    assert n["por_rota"]["chat"] == {"autorizadas": 2, "barradas": 1, "ok": 1, "falhas": 1, "tokens_entrada": 100,
                                     "tokens_saida": 20}
    assert n["sessoes"] == 1 and n["chamadas_por_sessao_mediana"] == 2
    assert "texto" not in str(n) and "sessao-a" not in str(n)
    IA.reset_para_teste()


# ---------------------------------------------------------------- revisao independente (27/11) -----------------------
def _vencer(S, **filtro):
    db = S()
    q = db.query(EmissorChave)
    for k, v in filtro.items():
        q = q.filter(getattr(EmissorChave, k) == v)
    q.update({"vence_em": datetime.now(timezone.utc) - timedelta(seconds=1)})
    db.commit()
    db.close()


def test_rev1_reserva_vencida_mais_documento_da_tela_nao_trava(amb):
    """ALTA 1: reserva vencida + o mesmo documento feito pela tela davam 409 para sempre."""
    c, S, (pid, _p2, _p3) = amb
    velho = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    _vencer(S)
    rx = gravar_receita(c, pid, None).json()["id"]                 # a tela, sem reserva
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert not r["reservado"] and r["itens"][0]["situacao"] == "existe" and r["itens"][0]["doc"]["id"] == rx
    # lote tudo-ou-nada com o item da tela + um novo: diz existe/novo (nao 409), e com parcial reserva o novo
    t2 = CELECOXIBE + "\n\nDIPIRONA 1G ---- 1CX\nTOMAR SE DOR"
    r = reservar(c, pid, "receita", conteudo=t2)
    assert [i["situacao"] for i in r["itens"]] == ["existe", "novo"]
    assert reservar(c, pid, "receita", conteudo=t2, parcial=True)["reservado"]
    assert gravar_receita(c, pid, velho).status_code == 409          # o dono antigo nao grava
    db = S()
    assert db.query(EmissorChave).filter(EmissorChave.chave == "rx|celecoxibe").one().doc_id == rx


def test_rev2_troca_so_receita_e_so_com_a_palavra(amb):
    c, S, (pid, _p2, _p3) = amb
    assert E.pediu_troca(False, "troque por 400") and E.pediu_troca(False, "faz uma nova receita")
    for ordem in ("faz de novo", "passa novo", "a nova dose", "nova", "novo"):
        assert not E.pediu_troca(False, ordem), ordem
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    gravar_receita(c, pid, r)
    assert not reservar(c, pid, "receita", conteudo=CELECOXIBE, ordem="faz de novo")["reservado"]
    # exame com troca=True: ignorado, devolve "existe"
    r = reservar(c, pid, "exame", ["RNM DO JOELHO DIREITO"])
    c.post(f"/patients/{pid}/exams", headers=lote_h(r), json={"date": today_br().isoformat(), "exams": [],
           "free_text": "SOLICITO: \n\n\nRNM DO JOELHO DIREITO\n\nHD: DOR"})
    r = reservar(c, pid, "exame", ["RNM DO JOELHO DIREITO"], troca=True, ordem="troca")
    assert not r["reservado"] and r["itens"][0]["situacao"] == "existe"
    assert S().query(EmissorChave).filter(EmissorChave.estado == "substituido").count() == 0


def test_rev3_lote_feito_em_outra_rota_da_409_e_nao_cria(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "encaminhamento", ["Encaminhamento — Reumatologia"])
    corpo = {"date": today_br().isoformat(), "report_type": "encaminhamento", "title": "Encaminhamento — Reumatologia",
             "content": "Encaminho (ficticio)."}
    assert c.post(f"/patients/{pid}/reports", headers=lote_h(r), json=corpo).status_code == 201
    # o mesmo lote, ja feito como encaminhamento, numa rota de outro tipo: 409
    assert c.post(f"/patients/{pid}/physio", headers=lote_h(r),
                  json={"date": today_br().isoformat(), "diagnosis": "x"}).status_code == 409
    db = S()
    db.query(EmissorChave).update({"doc_kind": "laudo"})   # finge que virou outro documento
    db.commit()
    assert c.post(f"/patients/{pid}/reports", headers=lote_h(r), json=corpo).status_code == 409
    db = S()
    assert db.query(MedicalReport).count() == 1
    from models.documents import PhysioRequest
    assert db.query(PhysioRequest).count() == 0
    # receita: lote feito com outro doc_kind tambem 409
    rr = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    gravar_receita(c, pid, rr)
    db.query(EmissorChave).filter(EmissorChave.lote == rr["lote"]).update({"doc_kind": "exame"})
    db.commit()
    assert gravar_receita(c, pid, rr).status_code == 409 and S().query(PatientRx).count() == 1


def test_rev4a_laboratorio_com_tuss_diferente_nao_e_o_mesmo(amb):
    assert not G.mesmo_item("exame", "TESTOSTERONA", "TESTOSTERONA LIVRE")
    assert not G.mesmo_item("exame", "PSA", "PSA LIVRE")
    assert G.mesmo_item("exame", "HEMOGRAMA", "HEMOGRAMA COMPLETO")
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "exame", ["TESTOSTERONA TOTAL"])
    c.post(f"/patients/{pid}/exams", headers=lote_h(r), json={"date": today_br().isoformat(), "exams": [],
           "free_text": "SOLICITO: \n\n\nTESTOSTERONA TOTAL\n\nHD: X"})
    assert reservar(c, pid, "exame", ["TESTOSTERONA LIVRE"])["reservado"]


def test_rev4b_encaminhamento_ignora_cabecalho_e_sem_destino_nunca_casa(amb):
    assert G.chave_encaminhamento("ENCAMINHAMENTO\nAo Dr(a).\nPrezado colega,\nEncaminho para Reumatologia") == \
        "enc|reumatologia"
    assert G.chave_encaminhamento("ENCAMINHAMENTO\nAo Dr(a).\nPrezado colega,") == "enc|?"
    assert not G.mesmo_item("encaminhamento", "ENCAMINHAMENTO", "Ao Dr(a).")
    c, S, (pid, _p2, _p3) = amb
    r1 = reservar(c, pid, "encaminhamento", conteudo="ENCAMINHAMENTO\nAo Dr(a).")
    r2 = reservar(c, pid, "encaminhamento", conteudo="ENCAMINHAMENTO\nPrezado colega")
    assert r1["reservado"] and r2["reservado"]                       # sem destino: nunca "ja existe"


def test_rev4c_atestado_por_tipo(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "atestado", conteudo="Atestado — afastamento de atividades de trabalho")
    assert c.post(f"/patients/{pid}/reports", headers=lote_h(r), json={"date": today_br().isoformat(),
                  "report_type": "atestado", "title": "Atestado — Atividades de trabalho",
                  "content": "Atesto (ficticio)."}).status_code == 201
    assert reservar(c, pid, "atestado", conteudo="atestado de afastamento")["itens"][0]["situacao"] == "existe"
    assert reservar(c, pid, "atestado", conteudo="Declaração de comparecimento")["reservado"]
    assert reservar(c, pid, "atestado", conteudo="Atestado de acompanhante")["reservado"]


def test_rev5_guia_vencida_nao_e_assumida(amb):
    c, S, (pid, _p2, _p3) = amb
    g = reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True)
    _vencer(S)
    r = reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True, h=PONTE)
    assert not r["reservado"] and r["itens"][0]["situacao"] == "em_andamento"
    # o dono renova e continua valendo; so o "falhou" libera
    assert c.post(f"/emissor/lotes/{g['lote']}/renovar", json={"token": g["token"]}, headers=MEDICO).status_code == 200
    c.post(f"/emissor/lotes/{g['lote']}/falhou", json={"token": g["token"]}, headers=MEDICO)
    assert reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True, h=PONTE)["reservado"]


def test_rev6_guia_com_nome_divergente_grava_com_aviso(amb):
    c, S, (pid, _p2, _p3) = amb
    r = reservar(c, pid, "exame", ["ULTRASSONOGRAFIA DO OMBRO ESQUERDO"], guia=True)
    up = subir_guia(c, pid, r, ["NOME ABREVIADO FICTICIO", "ULTRASSONOGRAFIA DO OMBRO ESQUERDO"])
    assert up.status_code == 201 and "nome" in up.json()["aviso"]
    doc = S().query(PatientDocument).one()
    assert "AVISO" in (doc.description or "")
    # item que nao confere continua 422
    r2 = reservar(c, pid, "exame", ["ULTRASSONOGRAFIA DO JOELHO DIREITO"], guia=True)
    assert subir_guia(c, pid, r2, [NOME.upper(), "ULTRASSONOGRAFIA DO OMBRO ESQUERDO"]).status_code == 422


def test_rev7_situacao_em_savepoint_e_falhou_nao_ressuscita(amb):
    c, S, (pid, _p2, _p3) = amb
    db = S()
    assert E.situacao(db, 1, pid, "receita", conteudo=CELECOXIBE)[0]["situacao"] == "novo"
    db.close()
    # A gravada; troca B; B vence e e assumida por C (mesma chave); o falhou tardio de B nao revive A
    r = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    rx1 = gravar_receita(c, pid, r).json()["id"]
    b = reservar(c, pid, "receita", conteudo=CELECOXIBE, troca=True)
    _vencer(S, lote=b["lote"])
    cc = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert cc["reservado"]
    assert c.post(f"/emissor/lotes/{b['lote']}/falhou", json={"token": b["token"]}, headers=MEDICO).status_code == 409
    rx3 = gravar_receita(c, pid, cc).json()["id"]
    db = S()
    est = sorted((x.estado, x.doc_id) for x in db.query(EmissorChave).all())
    assert est == [("pronto", rx3), ("substituido", rx1)]
    # e se B tivesse sido liberado (falhou) por outro lote antes: o falhou dele nao revive A
    d = reservar(c, pid, "receita", conteudo=CELECOXIBE, troca=True)            # substitui rx3
    db.query(EmissorChave).filter(EmissorChave.lote == d["lote"]).update({"estado": "falhou"})
    db.commit()
    e2 = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    assert e2["reservado"]
    c.post(f"/emissor/lotes/{d['lote']}/falhou", json={"token": d["token"]}, headers=MEDICO)
    db = S()
    ativos = db.query(EmissorChave).filter(EmissorChave.estado.in_(("reservado", "pronto"))).all()
    assert len(ativos) == 1 and ativos[0].lote == e2["lote"]


# ---------------------------------------------------------------- ressalva da aprovacao (27/11) ----------------------
def test_rev8_guia_presa_medico_libera_sem_token_e_hoje_mostra(amb):
    """PC morreu e perdeu o token: o medico ve o lote em /hoje e libera; fica 'falhou' com quem liberou."""
    c, S, (pid, _p2, _p3) = amb
    g = reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True, h=PONTE, dono="escriba")
    h = c.get(f"/emissor/paciente/{pid}/hoje", headers=MEDICO).json()
    assert h[0]["lote"] == g["lote"] and h[0]["dono"] == "escriba" and h[0]["formato"] == "guia"
    assert h[0]["idade_s"] is not None and h[0]["sem_renovar_s"] is not None and h[0]["vencida"] is False
    # outra conta nao libera; secretaria nao libera
    assert c.post(f"/emissor/lotes/{g['lote']}/liberar", headers=MEDICO_OUTRA_ORG).status_code == 409
    r = c.post(f"/emissor/lotes/{g['lote']}/liberar", json={"motivo": "PC caiu"}, headers=MEDICO)
    assert r.status_code == 200 and r.json()["liberadas"] == 1
    linha = S().query(EmissorChave).one()
    assert linha.estado == "falhou" and "liberado pelo usuario 10" in linha.origem and "PC caiu" in linha.origem
    assert subir_guia(c, pid, g, [NOME.upper(), "USG DO OMBRO ESQUERDO"]).status_code == 409   # o PC velho nao grava
    assert reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True)["reservado"]
    # lote ja gravado nao se libera
    r2 = reservar(c, pid, "receita", conteudo=CELECOXIBE)
    gravar_receita(c, pid, r2)
    assert c.post(f"/emissor/lotes/{r2['lote']}/liberar", headers=MEDICO).status_code == 409


def test_rev8_guia_sem_renovar_por_30_min_e_assumida(amb):
    c, S, (pid, _p2, _p3) = amb
    g = reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True)
    db = S()
    agora = datetime.now(timezone.utc)
    # renovou ha 20 min (vence_em = renovar + 6 min): ainda em andamento
    db.query(EmissorChave).update({"vence_em": agora - timedelta(minutes=14)})
    db.commit()
    assert reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True, h=PONTE)["itens"][0]["situacao"] == "em_andamento"
    # 31 min sem renovar: o proximo pedido assume
    db.query(EmissorChave).update({"vence_em": agora - timedelta(minutes=25)})
    db.commit()
    db.close()
    r = reservar(c, pid, "exame", ["USG DO OMBRO ESQUERDO"], guia=True, h=PONTE)
    assert r["reservado"] and r["lote"] != g["lote"]
    assert subir_guia(c, pid, g, [NOME.upper(), "USG DO OMBRO ESQUERDO"]).status_code == 409


def test_rev9_encaminhamento_pelo_destino_nunca_pelo_nome():
    a = G.chave_encaminhamento("Encaminho o paciente Fulano de Tal ao cardiologista")
    b = G.chave_encaminhamento("Encaminho o paciente Fulano de Tal ao neurologista")
    assert a == "enc|cardiologista" and b == "enc|neurologista" and a != b
    assert not G.mesmo_item("encaminhamento", "Encaminho o paciente Fulano de Tal ao cardiologista",
                            "Encaminho o paciente Fulano de Tal ao neurologista")
    assert "fulano" not in G.chave_encaminhamento("Encaminho o paciente Fulano de Tal")
    assert G.chave_encaminhamento("Encaminho a paciente Beltrana Ficticia para avaliação com reumatologista") == \
        "enc|reumatologista"
    assert G.chave_encaminhamento("Encaminhamento — Reumatologia") == "enc|reumatologia"


def test_rev10_atestado_tipo_pelo_texto_inteiro(amb):
    c, S, (pid, _p2, _p3) = amb
    assert G.tipo_atestado("Atestado em acompanhamento ortopédico, afastar 3 dias") == "afastamento"
    # feito pela tela, titulo generico: o tipo sai do corpo
    c.post(f"/patients/{pid}/reports", headers=MEDICO, json={"date": today_br().isoformat(), "report_type": "atestado",
           "title": "Atestado", "content": "Paciente ficticio.\nAtesto que compareceu a esta consulta das 9h as 10h."})
    assert reservar(c, pid, "atestado", conteudo="Declaração de comparecimento")["itens"][0]["situacao"] == "existe"
    assert reservar(c, pid, "atestado", conteudo="Atestado de afastamento do trabalho")["reservado"]
