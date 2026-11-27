"""Emissor unico em POSTGRES DE VERDADE (trava pg_advisory_xact_lock + indice unico parcial). Dados inventados.
So roda com EMISSOR_TEST_PG_URL apontando para um Postgres LOCAL descartavel (o teste APAGA e recria as tabelas):
  docker run -d --rm --name emissor-teste-pg -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=emissor_teste \
      -p 127.0.0.1:55439:5432 postgres:16
  EMISSOR_TEST_PG_URL=postgresql://postgres:teste@127.0.0.1:55439/emissor_teste \
      python -m pytest -q --noconftest tests/test_emissor_pg.py
Nunca aponte para o Neon/DATABASE_URL: o teste recusa qualquer host que nao seja local."""
import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

URL = os.getenv("EMISSOR_TEST_PG_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="sem EMISSOR_TEST_PG_URL (Postgres local de teste)")

import test_emissor as T  # noqa: E402
from fastapi import Depends, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

import main  # noqa: E402
import deps  # noqa: E402
from database import get_db  # noqa: E402
from models.emissor import EmissorChave  # noqa: E402
from models.organization import User  # noqa: E402
from models.patient_rx import PatientRx  # noqa: E402
import routers.patient_documents as RPD  # noqa: E402
from services import emissor as E  # noqa: E402
from tzutil import today_br  # noqa: E402


def _local(url: str) -> bool:
    h = (urlparse(url).hostname or "").lower()
    return h in ("127.0.0.1", "localhost", "::1") and os.getenv("DATABASE_URL", "") != url


@pytest.fixture
def pg(monkeypatch):
    assert _local(URL), "EMISSOR_TEST_PG_URL tem de ser um Postgres LOCAL de teste"
    eng, S, ids = T.montar(URL)

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
    from sqlalchemy.orm import close_all_sessions
    close_all_sessions()
    eng.dispose()


def test_pg_e_postgres_mesmo(pg):
    _c, S, _ids = pg
    db = S()
    assert E._eh_postgres(db)
    db.close()


def test_pg_vinte_iguais_com_as_duas_travas(pg):
    _c, S, (pid, _p2, _p3) = pg
    erros, res, docs, chaves = T.vinte_iguais(S, pid)
    assert erros == [] and res.count(True) == 1 and docs == 1 and chaves == 1


def test_pg_vinte_iguais_so_com_a_trava_do_banco(pg, monkeypatch):
    """Como se fossem 20 PROCESSOS (sem a trava em memoria): o pg_advisory_xact_lock segura sozinho."""
    _c, S, (pid, _p2, _p3) = pg
    monkeypatch.setattr(E, "USAR_TRAVA_LOCAL", False)
    erros, res, docs, chaves = T.vinte_iguais(S, pid)
    assert erros == [] and res.count(True) == 1 and docs == 1 and chaves == 1


def test_pg_sem_trava_nenhuma_o_indice_unico_ainda_segura(pg, monkeypatch):
    """Ultima linha de defesa: sem trava em memoria e sem trava do banco, o indice unico parcial nao deixa a mesma
    chave ficar ativa duas vezes (quem perde a corrida leva 409 ou ve 'em andamento')."""
    _c, S, (pid, _p2, _p3) = pg
    monkeypatch.setattr(E, "USAR_TRAVA_LOCAL", False)
    monkeypatch.setattr(E, "_eh_postgres", lambda db: False)
    erros, res, docs, chaves = T.vinte_iguais(S, pid)
    assert all("409" in e for e in erros)
    assert res.count(True) <= 1 and docs <= 1 and chaves == 1


def test_pg_indice_parcial(pg):
    _c, S, (pid, _p2, _p3) = pg
    db = S()
    base = dict(organization_id=1, patient_id=pid, dia=today_br(), tipo="receita", chave="rx|teste", token="t")
    db.add(EmissorChave(lote="a" * 32, estado="falhou", **base))
    db.add(EmissorChave(lote="b" * 32, estado="falhou", **base))       # falhou pode repetir
    db.add(EmissorChave(lote="c" * 32, estado="substituido", **base))
    db.add(EmissorChave(lote="d" * 32, estado="pronto", **base))
    db.commit()
    db.add(EmissorChave(lote="e" * 32, estado="reservado", **base))    # ativa duas vezes: o banco recusa
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.close()


def test_pg_caso_marina(pg):
    T.test_caso_marina_usg_e_fisio_por_dois_geradores_ao_mesmo_tempo(pg)


def test_pg_reserva_vencida_e_troca(pg):
    T.test_reserva_vencida_e_assumida_e_o_dono_antigo_leva_409(pg)


def test_pg_troca(pg):
    T.test_troca_so_com_a_ordem_e_nada_e_apagado(pg)


def test_pg_upload_confere_pdf(pg):
    T.test_upload_confere_nome_e_itens_e_grava_historico(pg)


def test_pg_dois_gravar_no_mesmo_lote(pg):
    T.test_dois_gravar_no_mesmo_lote_dao_um(pg)
    _c, S, (pid, _p2, _p3) = pg
    assert S().query(PatientRx).count() == 1


@pytest.mark.parametrize("nome", [n for n in dir(T) if n.startswith("test_rev")])
def test_pg_revisao(pg, nome):
    """As regressoes da revisao independente (27/11) tambem em Postgres."""
    import inspect
    f = getattr(T, nome)
    f(pg) if inspect.signature(f).parameters else f()
