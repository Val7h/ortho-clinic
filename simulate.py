"""Simulação completa: secretária cadastra clínica + 8 pacientes; médico atende e gera receitas."""
import sqlite3, requests, json
from datetime import date, datetime, timedelta
import random

DB = 'C:/Users/Admin/ortho-clinic/backend/orthoclinic.db'
BASE = 'http://localhost:8003'
ORG_ID = 3
TODAY = date.today()

def hdr(tok):
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}

# ============================================================
# 1. CRIAR CLÍNICA NO BANCO (sem endpoint POST /clinics)
# ============================================================
print('\n=== 1. CRIANDO CLÍNICA ===')
conn = sqlite3.connect(DB)
c = conn.cursor()
c.execute('SELECT id FROM clinics WHERE organization_id=?', (ORG_ID,))
cli = c.fetchone()
if not cli:
    c.execute(
        'INSERT INTO clinics (organization_id,name,city,state,address,color,slug,active) VALUES (?,?,?,?,?,?,?,1)',
        (ORG_ID, 'OrthoClinic Centro', 'Campina Grande', 'PB',
         'Rua Aprígio Veloso, 882 - Centro', '#0F2D5E', 'ortho-centro')
    )
    conn.commit()
    c.execute('SELECT id FROM clinics WHERE slug=?', ('ortho-centro',))
    cli = c.fetchone()
    print(f'   Clínica "OrthoClinic Centro" criada. ID: {cli[0]}')
else:
    print(f'   Clínica já existe. ID: {cli[0]}')
clinic_id = cli[0]
conn.close()

# ============================================================
# 2. AUTENTICAR (secretária e médico)
# ============================================================
print('\n=== 2. AUTENTICANDO ===')
def login(email, pw):
    r = requests.post(f'{BASE}/auth/login', json={'email': email, 'password': pw})
    d = r.json()
    if 'access_token' not in d:
        raise RuntimeError(f'Login falhou para {email}: {d}')
    return d['access_token']

tok_sec = login('secretaria@clinica.com', '123456')
tok_med = login('medico@clinica.com', '123456')
print('   OK Secretária autenticada')
print('   OK Médico autenticado')

# ============================================================
# 3. CRIAR 8 PACIENTES (como secretária)
# ============================================================
print('\n=== 3. CRIANDO 8 PACIENTES (secretária) ===')
pacientes_data = [
    {
        'name': 'Carlos Eduardo Ferreira',
        'birthdate': '1975-03-15',
        'cpf': '123.456.789-01',
        'phone': '(83) 99901-1111',
        'gender': 'masculino',
        'blood_type': 'O+',
        'address_street': 'Rua das Flores, 100',
        'address_city': 'Campina Grande',
        'address_state': 'PB',
        'occupation': 'Engenheiro civil',
        'allergies': 'AAS',
        'insurance': 'Unimed',
        'insurance_plan': 'Nacional Pleno',
        'emergency_contact': 'Luciana Ferreira',
        'emergency_phone': '(83) 99901-0000',
        'emergency_relation': 'Esposa',
    },
    {
        'name': 'Maria das Graças Santos',
        'birthdate': '1982-07-22',
        'cpf': '234.567.890-02',
        'phone': '(83) 99902-2222',
        'gender': 'feminino',
        'blood_type': 'A+',
        'address_city': 'Lagoa Seca',
        'address_state': 'PB',
        'occupation': 'Professora',
        'chronic_conditions': 'Osteoporose leve',
        'current_medications': 'Alendronato 70mg semanal, Cálcio + Vitamina D',
        'insurance': 'Bradesco Saúde',
        'insurance_plan': 'Top Nacional',
    },
    {
        'name': 'João Victor Lima',
        'birthdate': '1990-11-08',
        'cpf': '345.678.901-03',
        'phone': '(83) 99903-3333',
        'gender': 'masculino',
        'blood_type': 'B-',
        'address_city': 'Campina Grande',
        'address_state': 'PB',
        'occupation': 'Personal trainer / atleta amador',
        'allergies': 'Dipirona',
        'referral_source': 'Indicação de paciente',
    },
    {
        'name': 'Ana Paula Rodrigues',
        'birthdate': '1968-05-30',
        'cpf': '456.789.012-04',
        'phone': '(83) 99904-4444',
        'gender': 'feminino',
        'blood_type': 'AB+',
        'address_city': 'Queimadas',
        'address_state': 'PB',
        'occupation': 'Doméstica',
        'chronic_conditions': 'Gonartrose grau II joelho direito, Hipertensão',
        'current_medications': 'Enalapril 10mg, Paracetamol SOS',
        'insurance': 'SulAmérica',
        'insurance_plan': 'Especial',
    },
    {
        'name': 'Roberto Alves Melo',
        'birthdate': '1955-09-12',
        'cpf': '567.890.123-05',
        'phone': '(83) 99905-5555',
        'gender': 'masculino',
        'blood_type': 'A-',
        'address_city': 'Campina Grande',
        'address_state': 'PB',
        'occupation': 'Comerciante (aposentado)',
        'chronic_conditions': 'Hipertensão arterial, Diabetes mellitus tipo 2',
        'current_medications': 'Losartana 50mg, Metformina 850mg, AAS 100mg',
        'allergies': 'Sulfas',
        'insurance': 'Unimed',
        'insurance_plan': 'Unipart Flex',
    },
    {
        'name': 'Fernanda Cristina Souza',
        'birthdate': '1995-01-25',
        'cpf': '678.901.234-06',
        'phone': '(83) 99906-6666',
        'gender': 'feminino',
        'blood_type': 'O-',
        'address_city': 'Campina Grande',
        'address_state': 'PB',
        'occupation': 'Professora de educação física',
        'referral_source': 'Google',
    },
    {
        'name': 'Antonio José Pereira',
        'birthdate': '1948-06-18',
        'cpf': '789.012.345-07',
        'phone': '(83) 99907-7777',
        'gender': 'masculino',
        'blood_type': 'B+',
        'address_city': 'Massaranduba',
        'address_state': 'PB',
        'occupation': 'Agricultor (aposentado)',
        'chronic_conditions': 'Hérnia de disco L4-L5, DPOC moderada',
        'current_medications': 'Aerolin inalador, Symbicort',
        'allergies': 'Penicilina',
        'insurance': 'IPSEMG',
        'emergency_contact': 'Filha: Maria Pereira',
        'emergency_phone': '(83) 99908-0001',
    },
    {
        'name': 'Juliana Beatriz Costa',
        'birthdate': '2000-12-03',
        'cpf': '890.123.456-08',
        'phone': '(83) 99908-8888',
        'gender': 'feminino',
        'blood_type': 'A+',
        'address_city': 'Campina Grande',
        'address_state': 'PB',
        'occupation': 'Estudante universitária',
        'referral_source': 'Instagram',
    },
]

patient_ids = []
for p in pacientes_data:
    r = requests.post(f'{BASE}/patients', json=p, headers=hdr(tok_sec))
    if r.status_code == 201:
        pid = r.json()['id']
        patient_ids.append(pid)
        print(f'   [OK] {p["name"]} → ID {pid}')
    elif r.status_code == 400 and 'CPF' in r.text:
        # Already exists, fetch it
        r2 = requests.get(f'{BASE}/patients?search={p["cpf"]}', headers=hdr(tok_sec))
        if r2.ok and r2.json():
            pid = r2.json()[0]['id']
            patient_ids.append(pid)
            print(f'   [=] {p["name"]} já existe → ID {pid}')
        else:
            print(f'   [!] {p["name"]} CPF duplicado, buscando por nome...')
            r3 = requests.get(f'{BASE}/patients?search={p["name"].split()[0]}', headers=hdr(tok_sec))
            if r3.ok and r3.json():
                pid = r3.json()[0]['id']
                patient_ids.append(pid)
                print(f'       Encontrado ID {pid}')
    else:
        print(f'   [ERRO] {p["name"]}: {r.status_code} {r.text[:120]}')

print(f'\n   Total: {len(patient_ids)} pacientes → IDs: {patient_ids}')

# ============================================================
# 4. CRIAR CONSULTAS (como médico) — dias diferentes
# ============================================================
print('\n=== 4. CRIANDO CONSULTAS ORTOPÉDICAS (médico) ===')

diagnoses = [
    ('Lesão do manguito rotador grau II - ombro direito', 'M75.1',
     'Dor em ombro direito há 3 meses, piora com abduação. Fisioterapia anterior sem melhora.',
     'Força diminuída em rotação externa. Teste de Neer +. Arco doloroso 70-120°.',
     'Fisioterapia intensiva 3x/semana + Anti-inflamatório por 14 dias. Reavaliação em 30 dias.'),
    ('Gonartrose grau II joelho direito', 'M17.1',
     'Dor progressiva em joelho direito há 6 meses. Piora ao subir escadas.',
     'Crepitação articular. Derrame leve. Extensão completa com dor. Graus de flexão: 110°.',
     'Viscosuplementação com ácido hialurônico (3 aplicações). Fortalecimento de quadríceps.'),
    ('Hérnia de disco L4-L5 com radiculopatia', 'M51.1',
     'Lombalgia há 2 anos com irradiação para MMII. Piora ao permanecer sentado.',
     'Lasègue + em 45°. Força preservada. Sensibilidade diminuída em L4 esq.',
     'Repouso relativo + AINE + Fisioterapia coluna. RNM solicitada. Retorno em 3 semanas.'),
    ('Epicondilite lateral (cotovelo de tenista)', 'M77.1',
     'Dor em face lateral do cotovelo direito há 1 mês. Relacionada ao trabalho.',
     'Dor à palpação de epicôndilo lateral. Teste de Cozen +.',
     'Infiltração com corticoide + Órtese de cotovelo + Fisio. Afastamento 15 dias.'),
    ('Fasciíte plantar bilateral', 'M72.2',
     'Dor plantar intensa ao levantar pela manhã. Piora progressiva há 4 meses.',
     'Dor à palpação da tuberosidade calcânea medial. Teste de estiramento +.',
     'Palmilha ortopédica personalizada + Fisioterapia (ondas de choque). Corticoide local se necessário.'),
    ('Ruptura parcial LCA - joelho esquerdo', 'M23.6',
     'Trauma esportivo (futebol) há 2 semanas. Joelho instável.',
     'Gaveta anterior leve +. Lachman ++ . Pivot shift negativo. Edema moderado.',
     'RNM de joelho solicitada. Imobilização + Fisio conservadora. Reavaliação com exames.'),
    ('Síndrome do impacto subacromial', 'M75.1',
     'Dor em ombro esquerdo com limitação de amplitude há 2 meses.',
     'Teste de Hawkins +. Teste de Neer +. Rotação interna preservada.',
     'Infiltração subacromial com corticoide + Fisioterapia. Evitar elevação do membro.'),
    ('Cervicalgia crônica com braquialgia C5-C6', 'M54.2',
     'Dor cervical há 1 ano com irradiação para braço direito. Formigamento em indicador.',
     'Teste de Spurling +. Reflexo bicipital diminuído. Força preservada em pinça.',
     'RNM cervical solicitada. AINE + Fisio + Tração cervical. Retorno em 21 dias.'),
]

medications_list = [
    [{'name': 'Nimesulida 100mg', 'instructions': '1 comprimido 2x ao dia por 7 dias, após refeição'},
     {'name': 'Omeprazol 20mg', 'instructions': '1 cápsula pela manhã em jejum por 14 dias'},
     {'name': 'Cloridrato de ciclobenzaprina 5mg', 'instructions': '1 comprimido à noite por 5 dias'}],
    [{'name': 'Meloxicam 15mg', 'instructions': '1 comprimido 1x ao dia por 10 dias, após refeição'},
     {'name': 'Paracetamol 750mg', 'instructions': '1 comprimido de 6/6h se dor, máximo 4 dias'}],
    [{'name': 'Ibuprofeno 600mg', 'instructions': '1 comprimido 3x ao dia por 5 dias'},
     {'name': 'Metocarbamol + AAS (Mioflex-A)', 'instructions': '1 comprimido 3x ao dia por 7 dias'},
     {'name': 'Omeprazol 20mg', 'instructions': '1 cápsula pela manhã em jejum'}],
    [{'name': 'Naproxeno 500mg', 'instructions': '1 comprimido 2x ao dia por 10 dias, com alimento'},
     {'name': 'Pantoprazol 40mg', 'instructions': '1 comprimido em jejum pela manhã'}],
    [{'name': 'Celecoxibe 200mg', 'instructions': '1 cápsula 1x ao dia por 14 dias'},
     {'name': 'Vitamina D3 10.000UI', 'instructions': '1 cápsula por semana — 8 semanas'}],
    [{'name': 'Diclofenaco sódico 50mg', 'instructions': '1 comprimido 3x ao dia por 5 dias, após refeição'},
     {'name': 'Cloridrato de tramadol 50mg', 'instructions': '1 cápsula de 8/8h se dor intensa — máx 3 dias'},
     {'name': 'Omeprazol 20mg', 'instructions': '1 cápsula 2x ao dia'}],
    [{'name': 'Betametasona 1mg + Clotrimazol creme', 'instructions': 'Aplicar na região 2x ao dia por 7 dias'},
     {'name': 'Dipirona sódica 500mg', 'instructions': '2 comprimidos de 6/6h se febre ou dor'}],
    [{'name': 'Gabapentina 300mg', 'instructions': '1 cápsula à noite por 14 dias (aumentar gradualmente)'},
     {'name': 'Amitriptilina 25mg', 'instructions': '1 comprimido à noite por 30 dias'},
     {'name': 'Omeprazol 20mg', 'instructions': '1 cápsula pela manhã em jejum'}],
]

payment_methods = ['cartao_credito', 'pix', 'dinheiro', 'cartao_debito', 'transferencia', 'pix', 'cartao_credito', 'dinheiro']

consultation_ids = []
for i, pid in enumerate(patient_ids):
    # Distribuir consultas pelos últimos 12 dias
    days_ago = random.randint(0, 12)
    consult_date = TODAY - timedelta(days=days_ago)
    consult_datetime = f'{consult_date.isoformat()}T{8 + i:02d}:00:00'

    diag = diagnoses[i]
    payload = {
        'date': consult_datetime,
        'type': 'primeira_consulta' if i < 5 else 'retorno',
        'chief_complaint': diag[0],
        'history_of_illness': diag[1 + 1] if i < 3 else diag[1],
        'physical_exam': diag[3],
        'diagnosis': diag[0],
        'cid10': diag[1],
        'treatment_plan': diag[4],
        'pain_scale': random.randint(4, 9),
        'pain_location': diag[0].split('–')[0].split('-')[0].strip(),
        'next_appointment': (consult_date + timedelta(days=30)).isoformat(),
        'next_appointment_notes': 'Retorno para avaliação + resultado de exames',
    }
    r = requests.post(f'{BASE}/patients/{pid}/consultations', json=payload, headers=hdr(tok_med))
    if r.status_code == 201:
        cid = r.json()['id']
        consultation_ids.append(cid)
        print(f'   [OK] Paciente ID {pid} → Consulta ID {cid} ({consult_date}) | {diag[0][:55]}...')
    else:
        print(f'   [ERRO] Paciente {pid}: {r.status_code} {r.text[:120]}')
        consultation_ids.append(None)

print(f'\n   Total: {len([x for x in consultation_ids if x])} consultas criadas')

# ============================================================
# 5. LANÇAR FINANCEIRO — R$400 por consulta
# ============================================================
print('\n=== 5. LANÇANDO FINANCEIRO (R$400/consulta) ===')
total = 0
for i, (pid, cid) in enumerate(zip(patient_ids, consultation_ids)):
    if cid is None:
        continue
    days_ago = random.randint(0, 12)
    pay_date = (TODAY - timedelta(days=days_ago)).isoformat()
    payload = {
        'patient_id': pid,
        'consultation_id': cid,
        'amount': 400.0,
        'payment_method': payment_methods[i % len(payment_methods)],
        'status': 'paid',
        'description': 'Consulta ortopédica',
        'notes': f'Pagamento referente consulta {cid}',
    }
    r = requests.post(f'{BASE}/financial', json=payload, headers=hdr(tok_med))
    if r.status_code in (200, 201):
        total += 400
        method = payment_methods[i % len(payment_methods)]
        print(f'   [OK] Paciente ID {pid} → R$400,00 ({method})')
    else:
        print(f'   [ERRO] Financeiro paciente {pid}: {r.status_code} {r.text[:120]}')

print(f'\n   Receita total lançada: R${total:,.2f}')

# ============================================================
# 6. CRIAR RECEITAS (médico prescreve para cada paciente)
# ============================================================
print('\n=== 6. CRIANDO RECEITAS MÉDICAS ===')
for i, (pid, cid) in enumerate(zip(patient_ids, consultation_ids)):
    meds = medications_list[i % len(medications_list)]
    payload = {
        'date': TODAY.isoformat(),
        'medications': meds,
        'instructions': 'Em caso de dúvidas ou piora dos sintomas, retornar imediatamente. '
                        'Não suspender medicação sem orientação médica.',
        'validity_days': 30,
        'consultation_id': cid,
    }
    r = requests.post(f'{BASE}/patients/{pid}/prescriptions', json=payload, headers=hdr(tok_med))
    if r.status_code == 201:
        rid = r.json().get('id', '?')
        mnames = ', '.join(m['name'] for m in meds[:2])
        if len(meds) > 2:
            mnames += f' +{len(meds)-2}'
        print(f'   [OK] Paciente ID {pid} → Receita ID {rid} | {mnames}')
    else:
        print(f'   [ERRO] Receita paciente {pid}: {r.status_code} {r.text[:120]}')

# ============================================================
# 7. CHECAR DASHBOARD
# ============================================================
print('\n=== 7. DASHBOARD (dados gerais) ===')
r = requests.get(f'{BASE}/dashboard', headers=hdr(tok_med))
if r.ok:
    d = r.json()
    print(json.dumps(d, indent=2, ensure_ascii=False))
else:
    print(f'   Erro: {r.status_code} {r.text[:200]}')

# ============================================================
# 8. FINANCEIRO SUMMARY
# ============================================================
print('\n=== 8. RESUMO FINANCEIRO ===')
r = requests.get(f'{BASE}/financial/summary', headers=hdr(tok_med))
if r.ok:
    print(json.dumps(r.json(), indent=2, ensure_ascii=False))
else:
    print(f'   {r.status_code}: {r.text[:200]}')

# ============================================================
# 9. LISTA FINANCEIRA COMPLETA
# ============================================================
print('\n=== 9. REGISTROS FINANCEIROS ===')
r = requests.get(f'{BASE}/financial', headers=hdr(tok_med))
if r.ok:
    recs = r.json()
    print(f'   Total de registros: {len(recs)}')
    for rec in recs:
        print(f'   R${rec["amount"]:.2f} | {rec["payment_method"]} | {rec["date"]} | {rec["status"]}')
else:
    print(f'   {r.status_code}: {r.text[:200]}')

print('\n\nDONE SIMULAÇÃO CONCLUÍDA COM SUCESSO!')
print(f'   Clínica: OrthoClinic Centro (ID {clinic_id})')
print(f'   Pacientes criados: {len(patient_ids)}')
print(f'   Consultas: {len([x for x in consultation_ids if x])}')
print(f'   Receita total: R$ {total:,.2f}')
