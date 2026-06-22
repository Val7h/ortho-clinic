"""Insert financial records directly into SQLite (bypassing the broken 'date' validator)."""
import sqlite3
from datetime import date, timedelta

DB = 'C:/Users/Admin/ortho-clinic/backend/orthoclinic.db'
TODAY = date.today()

patient_ids     = [5, 6, 7, 8, 9, 10, 11, 12]
consultation_ids= [1, 2, 3,  4, 5,  6,  7,  8]
payment_methods = ['cartao_credito','pix','dinheiro','cartao_debito','pix','pix','cartao_credito','dinheiro']
offsets         = [7, 5, 2, 4, 1, 3, 7, 10]

conn = sqlite3.connect(DB)
c = conn.cursor()

# Check table columns
c.execute("PRAGMA table_info(financial_records)")
cols = [row[1] for row in c.fetchall()]
print('Columns:', cols)

# Check if records already exist
c.execute('SELECT COUNT(*) FROM financial_records')
count = c.fetchone()[0]
print(f'Existing records: {count}')
if count > 0:
    print('Records already exist, skipping.')
    conn.close()
    exit()

total = 0
for i, (pid, cid) in enumerate(zip(patient_ids, consultation_ids)):
    pay_date = (TODAY - timedelta(days=offsets[i])).isoformat()
    method = payment_methods[i]
    c.execute(
        '''INSERT INTO financial_records
           (patient_id, consultation_id, amount, payment_method, status, description, date)
           VALUES (?,?,?,?,?,?,?)''',
        (pid, cid, 400.0, method, 'paid', 'Consulta ortopedica', pay_date)
    )
    total += 400
    print(f'  [OK] Paciente {pid} | R$400 | {method} | {pay_date}')

conn.commit()

# Verify
c.execute('SELECT COUNT(*), SUM(amount) FROM financial_records WHERE status="paid"')
row = c.fetchone()
print(f'\nRegistros no banco: {row[0]} | Total: R${row[1]:,.2f}')

conn.close()
print(f'\nTotal inserido: R${total:,.2f}')
