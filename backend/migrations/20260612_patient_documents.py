"""
Migration: tabelas de gerenciamento de documentos do paciente.
Sprint 6 / Day 7 — 2026-06-12

Cria:
  - patient_documents
  - document_shares
  - document_cache

Adiciona coluna desnecessária ao init_db() pois Base.metadata.create_all
já cria as tabelas. Este arquivo serve como referência e para ambientes
onde init_db não é executado (ex: Render com banco já existente).
"""
from sqlalchemy import text


def upgrade(engine):
    with engine.begin() as conn:
        # ── patient_documents ────────────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS patient_documents (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                consultation_id     INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
                uploaded_by_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
                title               VARCHAR(300) NOT NULL,
                category            VARCHAR(50) NOT NULL DEFAULT 'other',
                description         TEXT,
                date                DATE NOT NULL,
                tags                JSON DEFAULT '[]',
                file_url            VARCHAR(1000),
                file_name           VARCHAR(300),
                mime_type           VARCHAR(100),
                file_size_kb        INTEGER,
                generated_doc_type  VARCHAR(50),
                generated_doc_id    INTEGER,
                signature_data_url  TEXT,
                signature_at        DATETIME,
                signed_by_name      VARCHAR(200),
                is_deleted          BOOLEAN NOT NULL DEFAULT 0,
                created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME
            )
        """))

        # ── document_shares ──────────────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_shares (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES patient_documents(id) ON DELETE CASCADE,
                channel     VARCHAR(20) NOT NULL,
                recipient   VARCHAR(200),
                share_token VARCHAR(64) UNIQUE,
                expires_at  DATETIME,
                sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                opened_at   DATETIME
            )
        """))

        # ── document_cache ───────────────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_cache (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL UNIQUE REFERENCES patient_documents(id) ON DELETE CASCADE,
                cached_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                cache_key   VARCHAR(200)
            )
        """))

        print("✓ Migration 20260612_patient_documents: tabelas criadas")


def downgrade(engine):
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS document_cache"))
        conn.execute(text("DROP TABLE IF EXISTS document_shares"))
        conn.execute(text("DROP TABLE IF EXISTS patient_documents"))
        print("✓ Migration 20260612_patient_documents: tabelas removidas")
