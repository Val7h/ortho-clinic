"""Insert 5 months of historical financial records (Jan-May 2026) for chart data."""
import sqlite3
from datetime import date

DB = 'C:/Users/Admin/ortho-clinic/backend/orthoclinic.db'

# 5 months of data x ~8 consultations each, R$400 each
# Using existing patient_ids 5-12 and org from current records
MONTHLY_COUNTS = {
    1: [5, 6, 7, 8],          # Jan: 4 consultas = R$1.600
    2: [5, 6, 7, 8, 9, 10],  # Fev: 6 consultas = R$2.400
    3: [5, 6, 7, 8, 9, 10, 11],  # Mar: 7 consultas = R$2.800
    4: [5, 6, 7, 8, 9],      # Abr: 5 consultas = R$2.000
    5: [5, 6, 7, 8, 9, 10, 11, 12],  # Mai: 8 consultas = R$3.200
}
METHODS = ['pix', 'cartao_credito', 'dinheiro', 'cartao_debito', 'pix', 'pix', 'cartao_credito', 'dinheiro']

conn = sqlite3.connect(DB)
c = conn.cursor()

# Check existing records
c.execute('SELECT COUNT(*), MIN(date), MAX(date) FROM financial_records')
row = c.fetchone()
print(f'Existing: {row[0]} records, from {row[1]} to {row[2]}')

# Don't insert if we already have Jan-May data
c.execute("SELECT COUNT(*) FROM financial_records WHERE date >= '2026-01-01' AND date <= '2026-05-31'")
existing_jan_may = c.fetchone()[0]
if existing_jan_may > 0:
    print(f'Already have {existing_jan_may} records for Jan-May 2026. Skipping.')
    conn.close()
    exit()

total = 0
for month, patient_ids in MONTHLY_COUNTS.items():
    day = 15  # mid-month
    pay_date = date(2026, month, day).isoformat()
    for i, pid in enumerate(patient_ids):
        method = METHODS[i % len(METHODS)]
        c.execute(
            '''INSERT INTO financial_records
               (patient_id, amount, payment_method, status, description, date)
               VALUES (?,?,?,?,?,?)''',
            (pid, 400.0, method, 'paid', 'Consulta ortopedica', pay_date)
        )
        total += 400
    print(f'  [OK] {date(2026, month, 1).strftime("%b")}: {len(patient_ids)} registros = R${len(patient_ids)*400:,}')

conn.commit()

# Verify
c.execute('SELECT COUNT(*), SUM(amount) FROM financial_records WHERE status="paid"')
row = c.fetchone()
print(f'\nTotal no banco: {row[0]} registros | R${row[1]:,.2f}')

conn.close()
print(f'Inseridos: R${total:,.2f}')
