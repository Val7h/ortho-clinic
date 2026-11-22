"""A secretária não apaga nada (Valth, 22/11/2026).
Toda rota DELETE exige médico, menos o trabalho dela (agenda e sala de espera) e
coisas que não são dado de paciente. Roda: pytest -q --noconftest tests/test_secretaria_nao_apaga.py"""
import os, sys, datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite://"
from types import SimpleNamespace
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import main
from database import Base, get_db
from deps import get_current_user
from models.patient import Patient

# Liberadas de propósito (não são "apagar dado de paciente" ou são o trabalho dela):
LIBERADAS = {
    "/appointments/{appointment_id}",            # agenda: desmarcar é trabalho dela
    "/api/clinic/waiting-room/{entry_id}",       # sala de espera: trabalho dela
    "/push/tokens/{token_id}",                   # o próprio aparelho dela
    "/api/clinic/anamnesis-template/{template_id}",
    "/prescription-templates/{template_id}",
    "/exam-templates/{template_id}",
    "/leaflets/{leaflet_id}",
    "/oauth/clients/{client_id_str}",
    "/oauth/api-keys/{key_id}",
}
PROTEGE = {"require_doctor", "require_admin", "require_superadmin"}


def _deps(d, acc):
    for s in d.dependencies:
        if s.call is not None:
            acc.add(getattr(s.call, "__name__", ""))
        _deps(s, acc)
    return acc


def test_toda_rota_delete_exige_medico_salvo_as_liberadas():
    soltas = []
    for r in main.app.routes:
        if not isinstance(r, APIRoute) or "DELETE" not in r.methods:
            continue
        if r.path.startswith("/api/v1/") or r.path.startswith("/scim"):
            continue  # API pública/integração: chave própria, não é login de secretária
        if r.path in LIBERADAS:
            continue
        if not (_deps(r.dependant, set()) & PROTEGE):
            soltas.append(r.path)
    assert soltas == [], f"rotas DELETE que a secretária ainda consegue usar: {soltas}"


def test_receita_midia_documento_evolucao_laudo_exame_fisio_exigem_medico():
    alvo = {
        "/patients/{patient_id}/prescriptions/{rx_id}", "/consultations/{consultation_id}/media/{media_id}",
        "/patients/{patient_id}/documents/{doc_id}", "/patients/{patient_id}/evolutions/{evolution_id}",
        "/patients/{patient_id}/reports/{doc_id}", "/patients/{patient_id}/exams/{doc_id}",
        "/patients/{patient_id}/physio/{doc_id}", "/patients/{patient_id}", "/financial/{record_id}",
    }
    achadas = {}
    for r in main.app.routes:
        if isinstance(r, APIRoute) and "DELETE" in r.methods and r.path in alvo:
            achadas[r.path] = bool(_deps(r.dependant, set()) & PROTEGE)
    assert set(achadas) == alvo
    assert all(achadas.values()), achadas


# ── na prática ───────────────────────────────────────────────────────────────
eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(eng)
Sess = sessionmaker(bind=eng)
U = {"u": None}


def _cliente(role):
    def _db():
        db = Sess()
        try:
            yield db
        finally:
            db.close()
    U["u"] = SimpleNamespace(id=5, organization_id=1, role=role, active=True)
    main.app.dependency_overrides[get_db] = _db
    main.app.dependency_overrides[get_current_user] = lambda: U["u"]
    return TestClient(main.app)


def _paciente(**kw):
    db = Sess()
    p = Patient(name="PACIENTE FICTICIO SEC", organization_id=1, **kw)
    db.add(p); db.commit(); pid = p.id; db.close()
    return pid


def test_secretaria_nao_exclui_paciente_e_medico_exclui():
    pid = _paciente()
    assert _cliente("secretary").delete(f"/patients/{pid}").status_code == 403
    db = Sess(); assert db.query(Patient).get(pid).active is not False; db.close()
    assert _cliente("doctor").delete(f"/patients/{pid}").status_code == 204


def test_secretaria_salva_cadastro_sem_apagar_o_historico_clinico():
    clinico = {"notes": "nota do médico", "chronic_conditions": "HAS", "current_medications": "losartana",
               "surgeries_history": "artroscopia 2019", "family_history": "mãe com artrose"}
    pid = _paciente(phone="83999990000", **clinico)
    c = _cliente("secretary")
    r = c.put(f"/patients/{pid}", json={"phone": "83988887777", "notes": None, "chronic_conditions": "",
                                        "current_medications": None, "surgeries_history": "", "family_history": None})
    assert r.status_code == 200
    db = Sess(); p = db.query(Patient).get(pid); db.close()
    assert p.phone == "83988887777"
    for k, v in clinico.items():
        assert getattr(p, k) == v, k
    # o médico continua editando
    _cliente("doctor").put(f"/patients/{pid}", json={"notes": "nova"})
    db = Sess(); assert db.query(Patient).get(pid).notes == "nova"; db.close()


def test_sala_de_espera_e_agenda_continuam_abertas_para_ela():
    def guarda(path):
        for r in main.app.routes:
            if isinstance(r, APIRoute) and "DELETE" in r.methods and r.path == path:
                return _deps(r.dependant, set()) & PROTEGE
    assert guarda("/api/clinic/waiting-room/{entry_id}") == set()
    assert guarda("/appointments/{appointment_id}") == set()
