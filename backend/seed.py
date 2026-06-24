"""Popula o banco com dados de exemplo para demonstração."""
from datetime import date, datetime, timedelta
import models.user_settings  # noqa — registra UserSession antes do mapper
from database import SessionLocal, init_db
from models.patient import Patient
from models.consultation import Consultation
from models.documents import Prescription, ExamRequest, PhysioRequest, MedicalReport, TreatmentLeaflet
from models.clinic import Clinic, ClinicSchedule
from models.organization import Organization, User


def _hash(password: str) -> str:
    from passlib.context import CryptContext
    return CryptContext(schemes=["argon2"], deprecated="auto").hash(password)


def seed():
    init_db()
    db = SessionLocal()

    # ── Organização demo ──────────────────────────────────────────────────────
    org = db.query(Organization).filter(Organization.name == "OrthoClinic Demo").first()
    if not org:
        org = Organization(
            name="OrthoClinic Demo",
            city="Campina Grande",
            state="PB",
            plan="pro",
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        print("✓ Organização demo criada.")

    # ── Usuários padrão ───────────────────────────────────────────────────────
    if db.query(User).count() == 0:
        users = [
            User(
                organization_id=org.id,
                name="Super Admin",
                email="super@ortho.app",
                password_hash=_hash("super123"),
                role="superadmin",
            ),
            User(
                organization_id=org.id,
                name="Administrador",
                email="admin@clinica.com",
                password_hash=_hash("admin123"),
                role="admin",
            ),
            User(
                organization_id=org.id,
                name="Dr. Ortopedista",
                email="medico@clinica.com",
                password_hash=_hash("medico123"),
                role="doctor",
            ),
            User(
                organization_id=org.id,
                name="Secretária",
                email="secretaria@clinica.com",
                password_hash=_hash("secretaria123"),
                role="secretary",
            ),
        ]
        db.add_all(users)
        db.commit()
        print("✓ Usuários padrão criados.")
        print("  super@ortho.app / super123")
        print("  admin@clinica.com / admin123")
        print("  medico@clinica.com / medico123")
        print("  secretaria@clinica.com / secretaria123")

    # ── Pacientes ─────────────────────────────────────────────────────────────
    if db.query(Patient).count() > 0:
        print("Banco já possui pacientes.")
        db.close()
        return

    patients = [
        Patient(
            organization_id=org.id,
            name="Maria Silva Santos",
            birthdate=date(1975, 3, 15),
            cpf="123.456.789-00",
            phone="(11) 98765-4321",
            email="maria.silva@email.com",
            gender="F",
            blood_type="O+",
            insurance="Unimed",
            insurance_number="UN-123456",
            allergies="Dipirona",
            chronic_conditions="Hipertensão arterial",
            emergency_contact="João Santos",
            emergency_phone="(11) 91234-5678",
        ),
        Patient(
            organization_id=org.id,
            name="Roberto Oliveira Lima",
            birthdate=date(1968, 7, 22),
            cpf="987.654.321-00",
            phone="(11) 97654-3210",
            gender="M",
            blood_type="A+",
            insurance="Bradesco Saúde",
            chronic_conditions="Diabetes tipo 2, Lombalgia crônica",
        ),
        Patient(
            organization_id=org.id,
            name="Ana Carolina Mendes",
            birthdate=date(1990, 11, 8),
            cpf="456.789.123-00",
            phone="(11) 96543-2109",
            email="ana.mendes@email.com",
            gender="F",
            insurance="SulAmérica",
        ),
    ]
    db.add_all(patients)
    db.commit()
    for p in patients:
        db.refresh(p)

    # Consultas
    c1 = Consultation(
        patient_id=patients[0].id,
        date=datetime.now() - timedelta(days=90),
        type="primeira_consulta",
        chief_complaint="Dor no joelho direito há 3 meses, piora ao subir escadas",
        diagnosis="Gonartrose grau II — CID10: M17.1",
        treatment_plan="Fisioterapia, AINE oral, revisão em 30 dias",
        cid10="M17.1",
        next_appointment=date.today() + timedelta(days=30),
    )
    c2 = Consultation(
        patient_id=patients[0].id,
        date=datetime.now() - timedelta(days=60),
        type="retorno",
        chief_complaint="Melhora parcial da dor após fisioterapia",
        evolution="Paciente refere melhora de 40% da dor. Fisioterapia em andamento.",
        diagnosis="Gonartrose grau II — evolução favorável",
        treatment_plan="Manter fisioterapia. Infiltração caso não melhore.",
        cid10="M17.1",
    )
    c3 = Consultation(
        patient_id=patients[1].id,
        date=datetime.now() - timedelta(days=45),
        type="primeira_consulta",
        chief_complaint="Lombalgia com irradiação para membro inferior direito",
        diagnosis="Hérnia de disco L4-L5 — CID10: M51.1",
        treatment_plan="RNM coluna lombar, fisioterapia, analgesia",
        cid10="M51.1",
    )
    db.add_all([c1, c2, c3])
    db.commit()
    for c in [c1, c2, c3]:
        db.refresh(c)

    # Receita
    rx = Prescription(
        patient_id=patients[0].id,
        consultation_id=c1.id,
        date=date.today() - timedelta(days=90),
        medications=[
            {"name": "Nimesulida 100mg", "dose": "1 comprimido", "frequency": "12/12h", "duration": "7 dias", "instructions": "Tomar após as refeições"},
            {"name": "Omeprazol 20mg", "dose": "1 cápsula", "frequency": "1x ao dia", "duration": "7 dias", "instructions": "Em jejum pela manhã"},
        ],
        instructions="Evitar esforço físico intenso. Retornar em caso de piora.",
    )

    ex = ExamRequest(
        patient_id=patients[0].id,
        consultation_id=c1.id,
        date=date.today() - timedelta(days=90),
        exams=[
            {"name": "Raio-X joelho direito", "laterality": "Direito", "notes": "AP e perfil com carga"},
            {"name": "Ressonância magnética joelho direito", "laterality": "Direito"},
        ],
        clinical_indication="Gonartrose — avaliação de grau e indicação de tratamento",
        urgency="eletivo",
    )

    fi = PhysioRequest(
        patient_id=patients[0].id,
        consultation_id=c1.id,
        date=date.today() - timedelta(days=90),
        diagnosis="Gonartrose grau II",
        cid10="M17.1",
        sessions=20,
        frequency="3x por semana",
        goals="Fortalecimento do quadríceps, redução da dor, melhora da função",
        precautions="Evitar impacto. Respeitar limiar de dor.",
        techniques="Eletroterapia, hidroterapia, exercícios de fortalecimento",
    )

    lr = MedicalReport(
        patient_id=patients[0].id,
        date=date.today() - timedelta(days=60),
        report_type="Atestado Médico",
        title="Atestado para fins de dispensa do trabalho",
        content="Atesto que a paciente MARIA SILVA SANTOS, portadora de gonartrose direita (CID10: M17.1), necessita de afastamento de suas atividades laborais pelo período de 15 (quinze) dias, contados desta data.",
        purpose="Dispensa de atividades laborais",
    )
    db.add_all([rx, ex, fi, lr])

    # Folhetos
    leaflets = [
        TreatmentLeaflet(
            title="Entendendo a Gonartrose (Artrose do Joelho)",
            category="Joelho",
            tags=["joelho", "artrose", "gonartrose"],
            content_html="""
<h2>O que é a Gonartrose?</h2>
<p>A gonartrose é o desgaste da cartilagem do joelho, causando dor, rigidez e limitação de movimentos. É uma das condições mais comuns em pessoas acima de 50 anos.</p>
<h2>Sintomas</h2>
<ul>
  <li>Dor ao subir e descer escadas</li>
  <li>Rigidez matinal</li>
  <li>Estalos no joelho</li>
  <li>Inchaço após atividade física</li>
</ul>
<h2>Tratamento</h2>
<p>O tratamento inclui fisioterapia para fortalecer os músculos ao redor do joelho, medicamentos anti-inflamatórios e, em casos avançados, cirurgia de prótese.</p>
<h2>O que você pode fazer</h2>
<ul>
  <li>Manter peso adequado reduz a sobrecarga no joelho</li>
  <li>Praticar exercícios de baixo impacto (natação, bike)</li>
  <li>Usar calçados com boa amortização</li>
</ul>
""",
        ),
        TreatmentLeaflet(
            title="Hérnia de Disco — Guia do Paciente",
            category="Coluna",
            tags=["coluna", "hérnia", "disco", "lombalgia"],
            content_html="""
<h2>O que é Hérnia de Disco?</h2>
<p>Ocorre quando o núcleo do disco intervertebral pressiona as raízes nervosas da coluna, causando dor local e/ou irradiada para os membros.</p>
<h2>Sintomas</h2>
<ul>
  <li>Dor lombar intensa</li>
  <li>Dor que irradia para a perna (ciatalgia)</li>
  <li>Formigamento ou dormência</li>
  <li>Fraqueza muscular na perna</li>
</ul>
<h2>Tratamento</h2>
<p>A maioria dos pacientes melhora com tratamento conservador: fisioterapia, analgésicos e modificação de atividades. A cirurgia é indicada em casos selecionados.</p>
""",
        ),
        TreatmentLeaflet(
            title="Síndrome do Manguito Rotador",
            category="Ombro",
            tags=["ombro", "manguito rotador", "tendinite"],
            content_html="""
<h2>O que é o Manguito Rotador?</h2>
<p>É um conjunto de 4 músculos e tendões que estabilizam o ombro e permitem seus movimentos. Lesões nessa estrutura são muito comuns.</p>
<h2>Causas</h2>
<ul>
  <li>Movimentos repetitivos acima da cabeça</li>
  <li>Trauma direto no ombro</li>
  <li>Degeneração com a idade</li>
</ul>
<h2>Tratamento</h2>
<p>Fisioterapia é o principal tratamento. Em casos de ruptura total, pode ser necessária cirurgia artroscópica.</p>
""",
        ),
    ]
    db.add_all(leaflets)
    db.commit()

    # ── Clínicas ───────────────────────────────────────────────────────────────
    CLINICS_DATA = [
        {
            "name": "Clínica Artro",
            "city": "Campina Grande",
            "state": "PB",
            "color": "#3B82F6",
            "slug": "artro",
            "organization_id": org.id,
            "whatsapp_instance": "cto-campina",
            "schedules": [
                {"day_of_week": 3, "start_time": "15:00", "end_time": "19:00",
                 "schedule_type": "appointment", "slot_duration": 12},
            ],
        },
        {
            "name": "Hospital Intensiva Day",
            "city": "Caruaru",
            "state": "PE",
            "color": "#10B981",
            "slug": "intensiva-day",
            "organization_id": org.id,
            "whatsapp_instance": "cto-caruaru",
            "schedules": [
                {"day_of_week": 0, "start_time": "17:00", "end_time": "21:00",
                 "schedule_type": "appointment", "slot_duration": 12},
            ],
        },
        {
            "name": "CTO",
            "city": "Campina Grande",
            "state": "PB",
            "color": "#F59E0B",
            "slug": "cto",
            "organization_id": org.id,
            "whatsapp_instance": "cto-campina",
            "schedules": [
                {"day_of_week": 0, "start_time": "08:00", "end_time": "12:00",
                 "schedule_type": "walk_in", "slot_duration": 12},
                {"day_of_week": 3, "start_time": "08:00", "end_time": "12:00",
                 "schedule_type": "walk_in", "slot_duration": 12},
            ],
        },
        {
            "name": "Clínica Mário Bento",
            "city": "Palmares",
            "state": "PE",
            "color": "#8B5CF6",
            "slug": "mario-bento",
            "organization_id": org.id,
            "whatsapp_instance": "cto-geral",
            "schedules": [
                {"day_of_week": 1, "start_time": "10:00", "end_time": "15:00",
                 "schedule_type": "walk_in", "slot_duration": 12},
            ],
        },
        {
            "name": "Instituto Pernambuco (IP)",
            "city": "Caruaru",
            "state": "PE",
            "color": "#EF4444",
            "slug": "ip",
            "organization_id": org.id,
            "whatsapp_instance": "cto-caruaru",
            "schedules": [
                {"day_of_week": 2, "start_time": "09:00", "end_time": "13:00",
                 "schedule_type": "walk_in", "slot_duration": 12},
            ],
        },
        {
            "name": "Unimagem",
            "city": "Caruaru",
            "state": "PE",
            "color": "#F97316",
            "slug": "unimagem",
            "organization_id": org.id,
            "whatsapp_instance": "cto-caruaru",
            "schedules": [
                {"day_of_week": 2, "start_time": "14:00", "end_time": "18:00",
                 "schedule_type": "walk_in", "slot_duration": 12},
            ],
        },
    ]

    if db.query(Clinic).count() == 0:
        for c_data in CLINICS_DATA:
            schedules_data = c_data.pop("schedules")
            clinic = Clinic(**c_data)
            db.add(clinic)
            db.flush()
            for s in schedules_data:
                db.add(ClinicSchedule(clinic_id=clinic.id, **s))
        db.commit()
        print(f"✓ {len(CLINICS_DATA)} clínicas cadastradas.")

    print(f"✓ Banco populado com {len(patients)} pacientes, 3 consultas e {len(leaflets)} folhetos.")
    db.close()


if __name__ == "__main__":
    seed()
