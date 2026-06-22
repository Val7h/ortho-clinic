"""Seed financial records after backend fix."""
import requests, json
from datetime import date, timedelta

BASE = 'http://localhost:8003'
TODAY = date.today()

def login(email, pw):
    r = requests.post(f'{BASE}/auth/login', json={'email': email, 'password': pw})
    return r.json()['access_token']

tok_med = login('medico@clinica.com', '123456')
h = {'Authorization': f'Bearer {tok_med}'}

patient_ids = [5, 6, 7, 8, 9, 10, 11, 12]
consultation_ids = [1, 2, 3, 4, 5, 6, 7, 8]
payment_methods = ['cartao_credito', 'pix', 'dinheiro', 'cartao_debito', 'pix', 'pix', 'cartao_credito', 'dinheiro']
offsets = [7, 5, 2, 4, 1, 3, 7, 10]
total = 0

print('=== FINANCEIRO ===')
for i, (pid, cid) in enumerate(zip(patient_ids, consultation_ids)):
    pay_date = (TODAY - timedelta(days=offsets[i])).isoformat()
    payload = {
        'patient_id': pid,
        'consultation_id': cid,
        'amount': 400.0,
        'payment_method': payment_methods[i],
        'status': 'paid',
        'description': 'Consulta ortopedica - R$400',
        'date': pay_date,
    }
    r = requests.post(f'{BASE}/financial', json=payload, headers=h)
    if r.status_code in (200, 201):
        total += 400
        print(f'  [OK] P{pid} | R$400 | {payment_methods[i]} | {pay_date}')
    else:
        print(f'  [ERRO {r.status_code}] {r.text[:200]}')

print(f'\nTotal lancado: R${total:,.2f}')

print('\n=== RESUMO FINANCEIRO ===')
r = requests.get(f'{BASE}/financial/summary', headers=h)
print(json.dumps(r.json(), indent=2, ensure_ascii=False))

print('\n=== DASHBOARD ===')
r = requests.get(f'{BASE}/dashboard', headers=h)
d = r.json()
print(json.dumps(d, indent=2, ensure_ascii=False))
