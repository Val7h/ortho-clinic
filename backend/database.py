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
    from models import patient, consultation, documents, whatsapp, financial, media, anamnesis, clinic, organization, queue, push_notification, patient_documents, oauth2, patient_rx, prescription_template  # noqa
    from models import webhook  # noqa — WebhookEndpoint, WebhookDeliveryLog, WebhookDeadLetter
    from models import billing  # noqa — Sprint 8 Enterprise Billing
    from models import audit_log  # noqa — Sprint 8 Immutable Audit Log
    from models import clinical_evolution  # noqa — Prontuário evolutivo em folha corrida
    from models import messages  # noqa — DirectMessage (chat medico <-> secretaria)
    Base.metadata.create_all(bind=engine)
    # Register SQLAlchemy event hooks for automatic webhook fan-out
    try:
        from services.webhook_events import register_webhook_hooks
        register_webhook_hooks()
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning("Could not register webhook hooks: %s", _e)


def migrate_db():
    """Adiciona colunas para multi-tenant sem quebrar dados existentes."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # Mapeamento: tabela → coluna a adicionar
    migrations = []

    if "consultations" in existing_tables:
        cons_cols = [c["name"] for c in inspector.get_columns("consultations")]
        if "doctor_id" not in cons_cols:
            migrations.append("ALTER TABLE consultations ADD COLUMN doctor_id INTEGER REFERENCES users(id)")

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
        if "phone" not in cols:
            migrations.append("ALTER TABLE clinics ADD COLUMN phone VARCHAR(30)")

    if "appointments" in existing_tables:
        cols = [c["name"] for c in inspector.get_columns("appointments")]
        if "confirmation_token" not in cols:
            migrations.append("ALTER TABLE appointments ADD COLUMN confirmation_token VARCHAR(64)")

    if "patients" in existing_tables:
        cols = [c["name"] for c in inspector.get_columns("patients")]
        # Adicionar campos de saúde críticos
        if "alergias" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN alergias TEXT")
        if "medicacoes_uso_continuo" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN medicacoes_uso_continuo JSON")
        if "contraindicacoes" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN contraindicacoes TEXT")
        if "peso_kg" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN peso_kg NUMERIC(5,2)")
        if "altura_cm" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN altura_cm NUMERIC(5,2)")
        if "comorbidades" not in cols:
            migrations.append("ALTER TABLE patients ADD COLUMN comorbidades JSON")

    # Push notification tables — Sprint 6
    # These tables are created by Base.metadata.create_all via init_db.
    # The migration block below handles adding new columns to push tables
    # in databases that already existed before Sprint 6.
    if "device_tokens" in existing_tables:
        dt_cols = [c["name"] for c in inspector.get_columns("device_tokens")]
        if "dnd_start" not in dt_cols:
            migrations.append("ALTER TABLE device_tokens ADD COLUMN dnd_start VARCHAR(5)")
        if "dnd_end" not in dt_cols:
            migrations.append("ALTER TABLE device_tokens ADD COLUMN dnd_end VARCHAR(5)")

    # Sprint 6 Day 7 — patient_documents (criadas por init_db, mas garantimos aqui)
    for table_name, ddl in [
        ("patient_documents", """
            CREATE TABLE IF NOT EXISTS patient_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL,
                consultation_id INTEGER,
                uploaded_by_id INTEGER,
                title VARCHAR(300) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'other',
                description TEXT,
                date DATE NOT NULL,
                tags JSON DEFAULT '[]',
                file_url VARCHAR(1000),
                file_name VARCHAR(300),
                mime_type VARCHAR(100),
                file_size_kb INTEGER,
                generated_doc_type VARCHAR(50),
                generated_doc_id INTEGER,
                signature_data_url TEXT,
                signature_at DATETIME,
                signed_by_name VARCHAR(200),
                is_deleted BOOLEAN NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
        ("document_shares", """
            CREATE TABLE IF NOT EXISTS document_shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                channel VARCHAR(20) NOT NULL,
                recipient VARCHAR(200),
                share_token VARCHAR(64) UNIQUE,
                expires_at DATETIME,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                opened_at DATETIME
            )
        """),
        ("document_cache", """
            CREATE TABLE IF NOT EXISTS document_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL UNIQUE,
                cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                cache_key VARCHAR(200)
            )
        """),
    ]:
        if table_name not in existing_tables:
            migrations.append(ddl)

    # Patient prescriptions (patient-scoped, simple model)
    for table_name, ddl in [
        ("patient_prescriptions", """
            CREATE TABLE IF NOT EXISTS patient_prescriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                prescription_type VARCHAR(30) NOT NULL DEFAULT 'simples',
                medications JSON DEFAULT '[]',
                instructions TEXT,
                memed_id VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
    ]:
        if table_name not in existing_tables:
            migrations.append(ddl)

    # Adiciona prescription_type se tabela já existia (migration incremental)
    if "patient_prescriptions" in existing_tables:
        pp_cols = [c["name"] for c in inspector.get_columns("patient_prescriptions")]
        if "prescription_type" not in pp_cols:
            migrations.append("ALTER TABLE patient_prescriptions ADD COLUMN prescription_type VARCHAR(30) NOT NULL DEFAULT 'simples'")

    # Prescription templates (modelos reutilizáveis de receitas)
    for table_name, ddl in [
        ("prescription_templates", """
            CREATE TABLE IF NOT EXISTS prescription_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(200) NOT NULL,
                prescription_type VARCHAR(30) DEFAULT 'simples',
                medications JSON DEFAULT '[]',
                instructions TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
    ]:
        if table_name not in existing_tables:
            migrations.append(ddl)

    # Sprint 7 — OAuth2 Authorization Server tables
    for table_name, ddl in [
        ("oauth_scopes", """
            CREATE TABLE IF NOT EXISTS oauth_scopes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        VARCHAR(100) UNIQUE NOT NULL,
                description VARCHAR(500),
                category    VARCHAR(50),
                sensitive   BOOLEAN NOT NULL DEFAULT 0,
                active      BOOLEAN NOT NULL DEFAULT 1
            )
        """),
        ("oauth_clients", """
            CREATE TABLE IF NOT EXISTS oauth_clients (
                id                         INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id                  VARCHAR(64) UNIQUE NOT NULL,
                client_secret              VARCHAR(255),
                name                       VARCHAR(200) NOT NULL,
                description                TEXT,
                logo_url                   VARCHAR(500),
                website_url                VARCHAR(500),
                privacy_url                VARCHAR(500),
                tos_url                    VARCHAR(500),
                organization_id            INTEGER REFERENCES organizations(id),
                developer_email            VARCHAR(200) NOT NULL,
                client_type                VARCHAR(20) NOT NULL DEFAULT 'confidential',
                grant_types                JSON DEFAULT '["authorization_code","refresh_token"]',
                redirect_uris              JSON DEFAULT '[]',
                allowed_scopes             JSON DEFAULT '[]',
                status                     VARCHAR(20) NOT NULL DEFAULT 'pending',
                reviewed_by                INTEGER REFERENCES users(id),
                reviewed_at                DATETIME,
                review_notes               TEXT,
                requires_review            BOOLEAN NOT NULL DEFAULT 0,
                pkce_required              BOOLEAN NOT NULL DEFAULT 1,
                access_token_ttl_seconds   INTEGER NOT NULL DEFAULT 3600,
                refresh_token_ttl_seconds  INTEGER NOT NULL DEFAULT 2592000,
                created_at                 DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at                 DATETIME,
                active                     BOOLEAN NOT NULL DEFAULT 1
            )
        """),
        ("oauth_auth_codes", """
            CREATE TABLE IF NOT EXISTS oauth_auth_codes (
                id                     INTEGER PRIMARY KEY AUTOINCREMENT,
                code                   VARCHAR(128) UNIQUE NOT NULL,
                client_id              INTEGER NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
                user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code_challenge         VARCHAR(128),
                code_challenge_method  VARCHAR(10),
                redirect_uri           VARCHAR(500) NOT NULL,
                scopes                 JSON DEFAULT '[]',
                state                  VARCHAR(256),
                nonce                  VARCHAR(256),
                expires_at             DATETIME NOT NULL,
                used_at                DATETIME,
                created_at             DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("oauth_tokens", """
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id           INTEGER NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
                user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
                jti                 VARCHAR(64) UNIQUE NOT NULL,
                refresh_token       VARCHAR(256) UNIQUE,
                grant_type          VARCHAR(64) NOT NULL,
                scopes              JSON DEFAULT '[]',
                access_expires_at   DATETIME NOT NULL,
                refresh_expires_at  DATETIME,
                created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                revoked             BOOLEAN NOT NULL DEFAULT 0,
                revoked_at          DATETIME,
                revocation_reason   VARCHAR(100),
                parent_jti          VARCHAR(64) REFERENCES oauth_tokens(jti),
                ip_address          VARCHAR(45),
                user_agent          VARCHAR(500)
            )
        """),
        ("oauth_device_codes", """
            CREATE TABLE IF NOT EXISTS oauth_device_codes (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                device_code      VARCHAR(128) UNIQUE NOT NULL,
                user_code        VARCHAR(10)  UNIQUE NOT NULL,
                client_id        INTEGER NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
                scopes           JSON DEFAULT '[]',
                interval_seconds INTEGER NOT NULL DEFAULT 5,
                expires_at       DATETIME NOT NULL,
                last_poll_at     DATETIME,
                status           VARCHAR(20) NOT NULL DEFAULT 'pending',
                user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
                authorized_at    DATETIME,
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("oauth_api_keys", """
            CREATE TABLE IF NOT EXISTS oauth_api_keys (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id        INTEGER REFERENCES oauth_clients(id) ON DELETE CASCADE,
                user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
                organization_id  INTEGER REFERENCES organizations(id),
                key_prefix       VARCHAR(20) NOT NULL,
                key_hash         VARCHAR(255) UNIQUE NOT NULL,
                name             VARCHAR(200) NOT NULL,
                description      TEXT,
                scopes           JSON DEFAULT '[]',
                environment      VARCHAR(10) NOT NULL DEFAULT 'live',
                rate_limit_rpm   INTEGER,
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at     DATETIME,
                expires_at       DATETIME,
                revoked          BOOLEAN NOT NULL DEFAULT 0,
                revoked_at       DATETIME
            )
        """),
    ]:
        if table_name not in existing_tables:
            migrations.append(ddl)

    # Sprint 7 Public API — webhook tables
    for table_name, ddl in [
        ("webhook_endpoints", """
            CREATE TABLE IF NOT EXISTS webhook_endpoints (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key_id           INTEGER REFERENCES oauth_api_keys(id) ON DELETE CASCADE,
                client_id            INTEGER REFERENCES oauth_clients(id) ON DELETE CASCADE,
                org_id               INTEGER,
                url                  VARCHAR(2000) NOT NULL,
                events               JSON DEFAULT '[]',
                secret               VARCHAR(500),
                description          TEXT,
                active               BOOLEAN NOT NULL DEFAULT 1,
                consecutive_failures INTEGER NOT NULL DEFAULT 0,
                circuit_opened_at    DATETIME,
                ip_allowlist         JSON,
                mtls_cert_pem        TEXT,
                created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at           DATETIME
            )
        """),
        ("webhook_delivery_logs", """
            CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_id      INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
                evt_id           VARCHAR(36) NOT NULL,
                event_type       VARCHAR(100) NOT NULL,
                attempt_number   INTEGER NOT NULL DEFAULT 1,
                status           VARCHAR(20) NOT NULL,
                http_status      INTEGER,
                response_body    TEXT,
                error_message    TEXT,
                duration_ms      INTEGER,
                attempted_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                next_retry_at    DATETIME,
                payload_snapshot JSON
            )
        """),
        ("webhook_dead_letters", """
            CREATE TABLE IF NOT EXISTS webhook_dead_letters (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_id          INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
                evt_id               VARCHAR(36) NOT NULL,
                event_type           VARCHAR(100) NOT NULL,
                payload              JSON NOT NULL,
                total_attempts       INTEGER NOT NULL DEFAULT 6,
                first_attempted_at   DATETIME,
                last_attempted_at    DATETIME,
                last_error           TEXT,
                created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
                replayed_at          DATETIME,
                replay_task_id       VARCHAR(200)
            )
        """),
    ]:
        if table_name not in existing_tables:
            migrations.append(ddl)

    # Migrate existing webhook_endpoints table to new schema (add missing columns)
    if "webhook_endpoints" in existing_tables:
        wh_cols = [c["name"] for c in inspector.get_columns("webhook_endpoints")]
        for col_name, col_ddl in [
            ("secret",               "ALTER TABLE webhook_endpoints ADD COLUMN secret VARCHAR(500)"),
            ("consecutive_failures", "ALTER TABLE webhook_endpoints ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0"),
            ("circuit_opened_at",    "ALTER TABLE webhook_endpoints ADD COLUMN circuit_opened_at DATETIME"),
            ("ip_allowlist",         "ALTER TABLE webhook_endpoints ADD COLUMN ip_allowlist JSON"),
            ("mtls_cert_pem",        "ALTER TABLE webhook_endpoints ADD COLUMN mtls_cert_pem TEXT"),
        ]:
            if col_name not in wh_cols:
                migrations.append(col_ddl)

    # Sprint 8 — Billing tables
    for table_name, ddl in [
        ("billing_plans", """
            CREATE TABLE IF NOT EXISTS billing_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tier VARCHAR(20) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                price_monthly_cents INTEGER NOT NULL DEFAULT 0,
                price_annual_cents INTEGER NOT NULL DEFAULT 0,
                stripe_product_id VARCHAR(100),
                stripe_price_monthly VARCHAR(100),
                stripe_price_annual VARCHAR(100),
                stripe_meter_id VARCHAR(100),
                max_users INTEGER,
                max_appointments INTEGER,
                max_storage_gb INTEGER,
                api_calls_per_hour INTEGER,
                api_overage_per_1k_cents INTEGER DEFAULT 15,
                features JSON DEFAULT '[]',
                trial_days INTEGER DEFAULT 14,
                active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
        ("subscriptions", """
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id),
                plan_id INTEGER NOT NULL REFERENCES billing_plans(id),
                billing_cycle VARCHAR(10) DEFAULT 'monthly',
                status VARCHAR(20) DEFAULT 'trialing',
                stripe_subscription_id VARCHAR(200) UNIQUE,
                stripe_customer_id VARCHAR(200),
                stripe_latest_invoice_id VARCHAR(200),
                current_period_start DATETIME,
                current_period_end DATETIME,
                trial_start DATETIME,
                trial_end DATETIME,
                trial_card_required BOOLEAN DEFAULT 0,
                cancel_at_period_end BOOLEAN DEFAULT 0,
                canceled_at DATETIME,
                cancellation_reason VARCHAR(500),
                volume_discount_pct REAL DEFAULT 0,
                custom_price_cents INTEGER,
                poc_start DATETIME,
                poc_end DATETIME,
                contract_signed_at DATETIME,
                contract_docusign_id VARCHAR(200),
                contract_document_url VARCHAR(500),
                contract_years INTEGER,
                multi_year_discount_pct REAL DEFAULT 0,
                metadata JSON DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
        ("payment_methods", """
            CREATE TABLE IF NOT EXISTS payment_methods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
                organization_id INTEGER NOT NULL REFERENCES organizations(id),
                stripe_pm_id VARCHAR(200),
                type VARCHAR(10) NOT NULL,
                is_default BOOLEAN DEFAULT 0,
                card_brand VARCHAR(20),
                card_last4 VARCHAR(4),
                card_exp_month INTEGER,
                card_exp_year INTEGER,
                pix_key VARCHAR(200),
                boleto_barcode VARCHAR(500),
                active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("billing_invoices", """
            CREATE TABLE IF NOT EXISTS billing_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
                organization_id INTEGER NOT NULL REFERENCES organizations(id),
                stripe_invoice_id VARCHAR(200) UNIQUE,
                status VARCHAR(20) DEFAULT 'draft',
                subtotal_cents INTEGER DEFAULT 0,
                discount_cents INTEGER DEFAULT 0,
                tax_cents INTEGER DEFAULT 0,
                total_cents INTEGER DEFAULT 0,
                amount_paid_cents INTEGER DEFAULT 0,
                amount_due_cents INTEGER DEFAULT 0,
                api_overage_calls INTEGER DEFAULT 0,
                api_overage_cents INTEGER DEFAULT 0,
                period_start DATETIME,
                period_end DATETIME,
                payment_method_type VARCHAR(10),
                paid_at DATETIME,
                due_date DATE,
                pdf_url VARCHAR(500),
                nfe_number VARCHAR(50),
                nfe_url VARCHAR(500),
                nfe_issued_at DATETIME,
                boleto_url VARCHAR(500),
                boleto_expires_at DATETIME,
                pix_qr_code TEXT,
                pix_copy_paste VARCHAR(500),
                pix_expires_at DATETIME,
                line_items JSON DEFAULT '[]',
                email_sent_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
        ("usage_records", """
            CREATE TABLE IF NOT EXISTS usage_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
                organization_id INTEGER NOT NULL REFERENCES organizations(id),
                date DATE NOT NULL,
                api_calls INTEGER DEFAULT 0,
                storage_gb_used REAL DEFAULT 0,
                appointments INTEGER DEFAULT 0,
                stripe_meter_event_ids JSON DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                UNIQUE(organization_id, date)
            )
        """),
        ("dunning_events", """
            CREATE TABLE IF NOT EXISTS dunning_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
                event_type VARCHAR(50) NOT NULL,
                attempt_number INTEGER DEFAULT 1,
                stripe_invoice_id VARCHAR(200),
                email_sent_to VARCHAR(200),
                email_sent_at DATETIME,
                next_retry_at DATETIME,
                resolved_at DATETIME,
                metadata JSON DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("enterprise_quotes", """
            CREATE TABLE IF NOT EXISTS enterprise_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                organization_id INTEGER REFERENCES organizations(id),
                prospect_name VARCHAR(200) NOT NULL,
                prospect_email VARCHAR(200) NOT NULL,
                prospect_phone VARCHAR(30),
                prospect_company VARCHAR(200),
                clinic_count INTEGER,
                user_count INTEGER,
                status VARCHAR(20) DEFAULT 'draft',
                monthly_price_cents INTEGER,
                annual_price_cents INTEGER,
                contract_years INTEGER DEFAULT 1,
                volume_discount_pct REAL DEFAULT 0,
                multi_year_discount_pct REAL DEFAULT 0,
                custom_items JSON DEFAULT '[]',
                poc_offered BOOLEAN DEFAULT 0,
                poc_start DATE,
                poc_end DATE,
                docusign_envelope_id VARCHAR(200),
                docusign_status VARCHAR(50),
                msa_signed_at DATETIME,
                msa_document_url VARCHAR(500),
                dpa_signed_at DATETIME,
                dpa_document_url VARCHAR(500),
                sla_uptime_pct REAL DEFAULT 99.99,
                sla_response_min INTEGER DEFAULT 60,
                assigned_csm VARCHAR(200),
                notes TEXT,
                expires_at DATETIME,
                converted_at DATETIME,
                converted_subscription_id INTEGER REFERENCES subscriptions(id),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
        ("stripe_webhook_logs", """
            CREATE TABLE IF NOT EXISTS stripe_webhook_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stripe_event_id VARCHAR(200) NOT NULL UNIQUE,
                event_type VARCHAR(100) NOT NULL,
                api_version VARCHAR(20),
                payload JSON NOT NULL,
                processed BOOLEAN DEFAULT 0,
                error_message TEXT,
                processed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("nfe_logs", """
            CREATE TABLE IF NOT EXISTS nfe_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER NOT NULL REFERENCES billing_invoices(id),
                organization_id INTEGER NOT NULL REFERENCES organizations(id),
                nfe_io_id VARCHAR(200) UNIQUE,
                nfe_number VARCHAR(50),
                nfe_series VARCHAR(10),
                status VARCHAR(50) DEFAULT 'pending',
                issuer_cnpj VARCHAR(20),
                taker_document VARCHAR(20),
                taker_name VARCHAR(200),
                service_code VARCHAR(20),
                iss_rate_pct REAL DEFAULT 2.0,
                value_cents INTEGER NOT NULL,
                pdf_url VARCHAR(500),
                xml_url VARCHAR(500),
                issued_at DATETIME,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """),
    ]:
        if table_name not in existing_tables:
            migrations.append(ddl)

    # exam_requests: adiciona free_text se tabela já existia (texto livre médico)
    if "exam_requests" in existing_tables:
        er_cols = [c["name"] for c in inspector.get_columns("exam_requests")]
        if "free_text" not in er_cols:
            migrations.append("ALTER TABLE exam_requests ADD COLUMN free_text TEXT")

    # Sprint 8 — audit_logs columns added mid-sprint; add if table pre-dates them
    if "audit_logs" in existing_tables:
        al_cols = [c["name"] for c in inspector.get_columns("audit_logs")]
        if "request_id" not in al_cols:
            migrations.append("ALTER TABLE audit_logs ADD COLUMN request_id VARCHAR(36)")
        if "signature" not in al_cols:
            # Existing rows get an empty placeholder; new rows always have the real HMAC
            migrations.append("ALTER TABLE audit_logs ADD COLUMN signature VARCHAR(64) NOT NULL DEFAULT ''")

    if not migrations:
        return

    with engine.begin() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                label = sql.strip().split("\n")[0].strip()[:80]
                print(f"✓ Migração: {label}")
            except Exception as e:
                label = sql.strip().split("\n")[0].strip()[:80]
                print(f"! Migração ignorada ({label}): {e}")
