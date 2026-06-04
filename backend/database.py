from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./orthoclinic.db")

# Render fornece postgres:// mas SQLAlchemy 2.x requer postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from models import patient, consultation, documents, whatsapp, financial, media, anamnesis, clinic, organization  # noqa
    Base.metadata.create_all(bind=engine)


def migrate_db():
    """Adiciona colunas para multi-tenant sem quebrar dados existentes."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # Mapeamento: tabela → coluna a adicionar
    migrations = []

    if "patients" in existing_tables:
        cols = [c["name"] for c in inspector.get_columns("patients")]
        if "organization_id" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN organization_id INTEGER DEFAULT 1")

    if "clinics" in existing_tables:
        cols = [c["name"] for c in inspector.get_columns("clinics")]
        if "organization_id" not in cols:
            migrations.append("ALTER TABLE clinics ADD COLUMN organization_id INTEGER DEFAULT 1")
        if "whatsapp_instance" not in cols:
            migrations.append("ALTER TABLE clinics ADD COLUMN whatsapp_instance VARCHAR(100)")

    if "appointments" in existing_tables:
        cols = [c["name"] for c in inspector.get_columns("appointments")]
        if "confirmation_token" not in cols:
            migrations.append("ALTER TABLE appointments ADD COLUMN confirmation_token VARCHAR(64)")

    if not migrations:
        return

    with engine.begin() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                print(f"✓ Migração: {sql}")
            except Exception as e:
                print(f"! Migração ignorada ({sql}): {e}")
