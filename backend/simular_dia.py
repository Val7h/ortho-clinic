"""
Simulação de um dia clínico completo:
  - Secretária cadastra 10 pacientes
  - Médico atende 10 pacientes (consulta completa)
  - Relatório final impresso no terminal
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, date, timedelta
import models.user_settings  # noqa — registra UserSession antes do mapper
from database import SessionLocal, init_db
from models.patient import Patient
from models.consultation import Consultation
from models.organization import User, Organization

# ── Dados fictícios realistas ─────────────────────────────────────────────────

PACIENTES = [
    {
        "name": "Carlos Eduardo Mota",
        "birthdate": date(1968, 3, 14),
        "cpf": "111.222.333-01",
        "phone": "(81) 99101-0001",
        "gender": "M",
        "blood_type": "A+",
        "insurance": "Unimed",
        "chief_complaint": "Dor no joelho direito há 3 meses, piora ao subir escadas",
        "diagnosis": "Gonartrose grau II — joelho direito (M17.1)",
        "cid10": "M17.1",
        "treatment_plan": "Fisioterapia 2x/semana + infiltração intra-articular de corticoide",
        "pain_scale": 6,
        "pain_location": "Joelho direito",
        "next_days": 30,
    },
    {
        "name": "Fernanda Lima Souza",
        "birthdate": date(1985, 7, 22),
        "cpf": "111.222.333-02",
        "phone": "(81) 99101-0002",
        "gender": "F",
        "blood_type": "O+",
        "insurance": "Amil",
        "chief_complaint": "Lombalgia crônica com irradiação para membro inferior esquerdo",
        "diagnosis": "Hérnia de disco L4-L5 com lombociatalgia esquerda (M51.1)",
        "cid10": "M51.1",
        "treatment_plan": "RPG + analgesia + reavaliação com RNM coluna em 45 dias",
        "pain_scale": 7,
        "pain_location": "Região lombar e face posterior da perna esquerda",
        "next_days": 45,
    },
    {
        "name": "Roberto Alves Pereira",
        "birthdate": date(1952, 11, 5),
        "cpf": "111.222.333-03",
        "phone": "(81) 99101-0003",
        "gender": "M",
        "blood_type": "B+",
        "insurance": "SUS",
        "chief_complaint": "Dor e limitação funcional no ombro direito há 6 meses",
        "diagnosis": "Síndrome do manguito rotador com ruptura parcial (M75.1)",
        "cid10": "M75.1",
        "treatment_plan": "Fisioterapia intensiva 3x/semana. Se não houver melhora em 3 meses, indicação cirúrgica",
        "pain_scale": 8,
        "pain_location": "Ombro direito",
        "next_days": 90,
    },
    {
        "name": "Ana Paula Ferreira",
        "birthdate": date(1993, 4, 17),
        "cpf": "111.222.333-04",
        "phone": "(81) 99101-0004",
        "gender": "F",
        "blood_type": "AB-",
        "insurance": "Bradesco Saúde",
        "chief_complaint": "Dor no pé após corrida — piora ao primeiro passo pela manhã",
        "diagnosis": "Fasciíte plantar bilateral (M72.2)",
        "cid10": "M72.2",
        "treatment_plan": "Palmilha ortopédica + alongamentos específicos + ondas de choque",
        "pain_scale": 5,
        "pain_location": "Planta dos pés bilateralmente",
        "next_days": 21,
    },
    {
        "name": "Marcos Henrique Costa",
        "birthdate": date(1976, 9, 30),
        "cpf": "111.222.333-05",
        "phone": "(81) 99101-0005",
        "gender": "M",
        "blood_type": "O-",
        "insurance": "Unimed",
        "chief_complaint": "Cervicalgia com formigamento nos dedos das mãos",
        "diagnosis": "Espondilose cervical com radiculopatia C6 bilateral (M47.12)",
        "cid10": "M47.12",
        "treatment_plan": "Colar cervical noturno 4 semanas + fisioterapia cervical + pregabalina 75mg",
        "pain_scale": 6,
        "pain_location": "Cervical com irradiação para MMSS",
        "next_days": 28,
    },
    {
        "name": "Juliana Ramos Barros",
        "birthdate": date(1962, 1, 8),
        "cpf": "111.222.333-06",
        "phone": "(81) 99101-0006",
        "gender": "F",
        "blood_type": "A-",
        "insurance": "SulAmérica",
        "chief_complaint": "Dor no quadril esquerdo com dificuldade para andar mais de 500m",
        "diagnosis": "Coxartrose grau III — quadril esquerdo (M16.1)",
        "cid10": "M16.1",
        "treatment_plan": "Indicação de artroplastia total de quadril esquerdo. Encaminhada para avaliação pré-operatória",
        "pain_scale": 9,
        "pain_location": "Quadril esquerdo com irradiação para coxa",
        "next_days": 14,
    },
    {
        "name": "Pedro Henrique Nunes",
        "birthdate": date(2001, 6, 12),
        "cpf": "111.222.333-07",
        "phone": "(81) 99101-0007",
        "gender": "M",
        "blood_type": "B-",
        "insurance": "Hapvida",
        "chief_complaint": "Trauma em tornozelo direito durante futebol — dor e edema há 2 dias",
        "diagnosis": "Entorse grave do tornozelo direito com lesão do ligamento talofibular anterior (S93.0)",
        "cid10": "S93.0",
        "treatment_plan": "Imobilização com bota Walker por 3 semanas + gelo + AINE. Fisioterapia após imobilização",
        "pain_scale": 7,
        "pain_location": "Tornozelo direito",
        "next_days": 21,
    },
    {
        "name": "Cristina Moura Lopes",
        "birthdate": date(1957, 12, 3),
        "cpf": "111.222.333-08",
        "phone": "(81) 99101-0008",
        "gender": "F",
        "blood_type": "A+",
        "insurance": "Amil",
        "chief_complaint": "Deformidade progressiva nas mãos com dor articular matinal > 1 hora",
        "diagnosis": "Artrite Reumatoide com acometimento das mãos (M05.8)",
        "cid10": "M05.8",
        "treatment_plan": "Encaminhamento para reumatologista. Metotrexate + protetor gástrico. Fisioterapia para MMSS",
        "pain_scale": 7,
        "pain_location": "Articulações das mãos e punhos bilateralmente",
        "next_days": 30,
    },
    {
        "name": "Luiz Carlos Andrade",
        "birthdate": date(1979, 8, 19),
        "cpf": "111.222.333-09",
        "phone": "(81) 99101-0009",
        "gender": "M",
        "blood_type": "O+",
        "insurance": "SUS",
        "chief_complaint": "Dor no calcanhar direito após longa caminhada",
        "diagnosis": "Esporão calcâneo com bursite retrocalcânea (M77.3)",
        "cid10": "M77.3",
        "treatment_plan": "Palmilha com recorte para calcanhar + ondas de choque 5 sessões + AINE tópico",
        "pain_scale": 5,
        "pain_location": "Calcanhar direito",
        "next_days": 35,
    },
    {
        "name": "Beatriz Cavalcante Silva",
        "birthdate": date(1988, 2, 25),
        "cpf": "111.222.333-10",
        "phone": "(81) 99101-0010",
        "gender": "F",
        "blood_type": "AB+",
        "insurance": "Bradesco Saúde",
        "chief_complaint": "Dor e inchaço no joelho esquerdo após queda — bloqueio articular",
        "diagnosis": "Lesão de menisco medial — joelho esquerdo (S83.2)",
        "cid10": "S83.2",
        "treatment_plan": "RNM de joelho urgente. Se confirmar lesão meniscal complexa → artroscopia",
        "pain_scale": 8,
        "pain_location": "Joelho esquerdo",
        "next_days": 7,
    },
]

# ── Helpers ──────────────────────────────────────────────────────────────────

LINE = "─" * 72

def titulo(texto):
    print(f"\n{LINE}")
    print(f"  {texto}")
    print(LINE)

def ok(msg):
    print(f"  ✓  {msg}")

def info(msg):
    print(f"     {msg}")

# ── Simulação ─────────────────────────────────────────────────────────────────

def main():
    init_db()
    db = SessionLocal()

    # Garante que existe uma organização e usuários padrão
    org = db.query(Organization).first()
    if not org:
        print("[!] Nenhuma organização encontrada. Execute seed.py primeiro.")
        sys.exit(1)

    secretary = db.query(User).filter(User.role == "secretary", User.active == True).first()
    doctor    = db.query(User).filter(User.role == "doctor",    User.active == True).first()

    if not secretary or not doctor:
        # Tenta admin como fallback
        secretary = doctor = db.query(User).filter(User.active == True).first()
        if not secretary:
            print("[!] Nenhum usuário encontrado. Execute seed.py primeiro.")
            sys.exit(1)

    # ── FASE 1: Secretária cadastra 10 pacientes ──────────────────────────────

    titulo("FASE 1 — SECRETÁRIA: Cadastro de pacientes")
    print(f"  Usuária : {secretary.name or secretary.email}  [{secretary.role}]")
    print(f"  Clínica : {org.name}")

    agora = datetime.now()
    hora_secretaria = agora.replace(hour=7, minute=30, second=0, microsecond=0)

    pacientes_criados = []
    for i, dados in enumerate(PACIENTES, start=1):
        # Verifica duplicata de CPF na organização
        existente = db.query(Patient).filter(
            Patient.cpf == dados["cpf"],
            Patient.organization_id == org.id
        ).first()
        if existente:
            ok(f"#{i:02d} {dados['name']} — já existe (id={existente.id}), reutilizando")
            pacientes_criados.append(existente)
            continue

        patient = Patient(
            organization_id=org.id,
            name=dados["name"],
            birthdate=dados["birthdate"],
            cpf=dados["cpf"],
            phone=dados["phone"],
            gender=dados["gender"],
            blood_type=dados["blood_type"],
            insurance=dados["insurance"],
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        pacientes_criados.append(patient)

        tempo_cadastro = hora_secretaria + timedelta(minutes=(i - 1) * 8)
        ok(f"#{i:02d} {patient.name:<30}  CPF {patient.cpf}  [{tempo_cadastro.strftime('%H:%M')}]")

    # ── FASE 2: Médico atende 10 pacientes ───────────────────────────────────

    titulo("FASE 2 — MÉDICO: Consultas")
    print(f"  Médico  : {doctor.name or doctor.email}  [{doctor.role}]")

    hora_medico = agora.replace(hour=8, minute=0, second=0, microsecond=0)
    consultas_criadas = []

    for i, (patient, dados) in enumerate(zip(pacientes_criados, PACIENTES), start=1):
        hora_consulta = hora_medico + timedelta(minutes=(i - 1) * 12)
        next_appt = date.today() + timedelta(days=dados["next_days"])

        # Determina tipo (1ª consulta ou retorno)
        count_anterior = db.query(Consultation).filter(
            Consultation.patient_id == patient.id
        ).count()
        tipo = "primeira_consulta" if count_anterior == 0 else "retorno"

        consulta = Consultation(
            patient_id=patient.id,
            date=hora_consulta,
            type=tipo,
            chief_complaint=dados["chief_complaint"],
            pain_scale=dados["pain_scale"],
            pain_location=dados["pain_location"],
            diagnosis=dados["diagnosis"],
            cid10=dados["cid10"],
            treatment_plan=dados["treatment_plan"],
            next_appointment=next_appt,
            next_appointment_notes=f"Retorno em {dados['next_days']} dias para reavaliação.",
            physical_exam=f"Exame físico realizado. Região acometida: {dados['pain_location']}. "
                          f"Grau de dor: {dados['pain_scale']}/10.",
            evolution="Primeira avaliação. Paciente orientado sobre diagnóstico e plano terapêutico.",
        )
        db.add(consulta)
        db.commit()
        db.refresh(consulta)
        consultas_criadas.append(consulta)

        tipo_label = "1ª Consulta" if tipo == "primeira_consulta" else "Retorno"
        ok(f"#{i:02d} {patient.name:<30}  [{hora_consulta.strftime('%H:%M')}]  {tipo_label}")
        info(f"       Diagnóstico: {dados['diagnosis']}")
        info(f"       CID-10: {dados['cid10']}  |  Dor: {dados['pain_scale']}/10  |  Retorno: {next_appt}")

    # ── RELATÓRIO FINAL ───────────────────────────────────────────────────────

    titulo("RELATÓRIO — RESUMO DO DIA CLÍNICO")
    print(f"  Data           : {date.today().strftime('%d/%m/%Y')}")
    print(f"  Clínica        : {org.name}")
    print(f"  Secretária     : {secretary.name or secretary.email}")
    print(f"  Médico         : {doctor.name or doctor.email}")

    print(f"\n  {'PACIENTE':<32} {'CID-10':<10} {'DOR':>5}  PLANO")
    print(f"  {'─'*32} {'─'*10} {'─'*5}  {'─'*24}")

    total_dor = 0
    por_plano = {}
    por_convenio = {}
    por_cid = {}

    for consulta, dados in zip(consultas_criadas, PACIENTES):
        patient = next(p for p in pacientes_criados if p.id == consulta.patient_id)
        print(f"  {patient.name:<32} {dados['cid10']:<10} {dados['pain_scale']:>4}/10  {dados['treatment_plan'][:50]}…")
        total_dor += dados["pain_scale"]

        # Agrupa por tipo de plano
        plano = patient.insurance or "SUS"
        por_convenio[plano] = por_convenio.get(plano, 0) + 1

        # Agrupa por CID-10 (3 dígitos)
        cid3 = dados["cid10"][:3]
        por_cid[cid3] = por_cid.get(cid3, 0) + 1

    print(f"\n  Total de pacientes cadastrados  : {len(pacientes_criados):>3}")
    print(f"  Total de consultas realizadas   : {len(consultas_criadas):>3}")
    print(f"  Média de dor (EVA 0–10)         : {total_dor / len(consultas_criadas):.1f}")

    print(f"\n  Convênios:")
    for conv, qtd in sorted(por_convenio.items(), key=lambda x: -x[1]):
        barra = "█" * qtd
        print(f"    {conv:<20} {qtd:>2}  {barra}")

    print(f"\n  CID-10 mais frequentes:")
    for cid, qtd in sorted(por_cid.items(), key=lambda x: -x[1]):
        print(f"    {cid}   {qtd} paciente(s)")

    print(f"\n  Próximos retornos agendados:")
    proximos = sorted(zip(consultas_criadas, PACIENTES), key=lambda x: x[0].next_appointment)
    for consulta, dados in proximos[:5]:
        patient = next(p for p in pacientes_criados if p.id == consulta.patient_id)
        dias   = (consulta.next_appointment - date.today()).days
        print(f"    {consulta.next_appointment.strftime('%d/%m/%Y')}  ({dias:>3} dias)  {patient.name}")

    print(f"\n{LINE}")
    print(f"  Simulação concluída com sucesso.")
    print(LINE)

    db.close()


if __name__ == "__main__":
    main()
