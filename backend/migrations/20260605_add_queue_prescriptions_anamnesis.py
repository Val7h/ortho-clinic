"""
Alembic Migration: Add Queue, Prescription Signatures, and Anamnesis Templates
Date: 2026-06-05
Description:
  - Add clinic_queue table for real-time waiting room management
  - Add prescription_signatures table for digital signature tracking
  - Add anamnesis_templates table for structured anamnesis templates
  - Enhance patients table with critical medical fields
"""

from sqlalchemy import text


def upgrade(connection):
    """Apply all migrations."""

    # 1. CREATE clinic_queue TABLE
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS clinic_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id INTEGER NOT NULL,
            appointment_id INTEGER NOT NULL,
            patient_id INTEGER NOT NULL,
            room VARCHAR(50),
            called_at TIMESTAMP,
            called_by_user_id INTEGER,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (clinic_id) REFERENCES clinics(id),
            FOREIGN KEY (appointment_id) REFERENCES appointments(id),
            FOREIGN KEY (patient_id) REFERENCES patients(id),
            FOREIGN KEY (called_by_user_id) REFERENCES users(id)
        )
    """))

    # Create indices for clinic_queue
    connection.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_clinic_queue_clinic_called
        ON clinic_queue(clinic_id, called_at)
    """))

    connection.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_clinic_queue_status
        ON clinic_queue(status)
    """))

    connection.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_clinic_queue_appointment
        ON clinic_queue(appointment_id)
    """))

    # 2. CREATE prescription_signatures TABLE
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS prescription_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_id INTEGER NOT NULL,
            clicksign_doc_id VARCHAR(255),
            signed_at TIMESTAMP,
            signature_proof JSON,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE
        )
    """))

    connection.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_prescription_signatures_prescription
        ON prescription_signatures(prescription_id)
    """))

    connection.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_prescription_signatures_status
        ON prescription_signatures(status)
    """))

    # 3. CREATE anamnesis_templates TABLE
    connection.execute(text("""
        CREATE TABLE IF NOT EXISTS anamnesis_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clinic_id INTEGER,
            name VARCHAR(255) NOT NULL,
            specialty VARCHAR(100),
            structure JSON,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (clinic_id) REFERENCES clinics(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    """))

    connection.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_anamnesis_templates_clinic
        ON anamnesis_templates(clinic_id)
    """))

    # 4. ALTER patients TABLE - Add critical medical fields
    try:
        connection.execute(text("""
            ALTER TABLE patients
            ADD COLUMN alergias TEXT
        """))
    except Exception:
        pass  # Column may already exist

    try:
        connection.execute(text("""
            ALTER TABLE patients
            ADD COLUMN medicacoes_uso_continuo JSON
        """))
    except Exception:
        pass

    try:
        connection.execute(text("""
            ALTER TABLE patients
            ADD COLUMN contraindicacoes TEXT
        """))
    except Exception:
        pass

    try:
        connection.execute(text("""
            ALTER TABLE patients
            ADD COLUMN peso_kg NUMERIC(5,2)
        """))
    except Exception:
        pass

    try:
        connection.execute(text("""
            ALTER TABLE patients
            ADD COLUMN altura_cm NUMERIC(5,2)
        """))
    except Exception:
        pass

    try:
        connection.execute(text("""
            ALTER TABLE patients
            ADD COLUMN comorbidades JSON
        """))
    except Exception:
        pass


def downgrade(connection):
    """Revert all migrations."""

    # Drop tables in reverse order
    connection.execute(text("DROP TABLE IF EXISTS anamnesis_templates"))
    connection.execute(text("DROP TABLE IF EXISTS prescription_signatures"))
    connection.execute(text("DROP TABLE IF EXISTS clinic_queue"))

    # Remove columns from patients table
    try:
        connection.execute(text("ALTER TABLE patients DROP COLUMN alergias"))
    except Exception:
        pass

    try:
        connection.execute(text("ALTER TABLE patients DROP COLUMN medicacoes_uso_continuo"))
    except Exception:
        pass

    try:
        connection.execute(text("ALTER TABLE patients DROP COLUMN contraindicacoes"))
    except Exception:
        pass

    try:
        connection.execute(text("ALTER TABLE patients DROP COLUMN peso_kg"))
    except Exception:
        pass

    try:
        connection.execute(text("ALTER TABLE patients DROP COLUMN altura_cm"))
    except Exception:
        pass

    try:
        connection.execute(text("ALTER TABLE patients DROP COLUMN comorbidades"))
    except Exception:
        pass
