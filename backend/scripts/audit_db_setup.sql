-- ============================================================
-- audit_db_setup.sql — OrthoClinic Sprint 8
-- Run ONCE as a superuser (e.g. postgres) in the production DB.
-- ============================================================

-- 1. Append-only role (no UPDATE / DELETE on audit_logs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer LOGIN PASSWORD 'CHANGE_ME_AUDIT_WRITER_PASS';
  END IF;
END
$$;

-- 2. Grant minimum privileges to audit_writer
GRANT CONNECT ON DATABASE orthoclinic TO audit_writer;
GRANT USAGE   ON SCHEMA public        TO audit_writer;
GRANT SELECT  ON organizations        TO audit_writer;  -- for FK lookups
GRANT SELECT  ON users                TO audit_writer;
GRANT INSERT  ON audit_logs           TO audit_writer;
GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO audit_writer;
-- Explicitly deny mutations
REVOKE UPDATE ON audit_logs FROM audit_writer;
REVOKE DELETE ON audit_logs FROM audit_writer;

-- 3. audit_logs table  (mirrors models/audit_log.py)
CREATE TABLE IF NOT EXISTS audit_logs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp        TIMESTAMPTZ NOT NULL    DEFAULT now(),
    organization_id  INTEGER     NOT NULL    REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_id         INTEGER                 REFERENCES users(id)         ON DELETE RESTRICT,
    actor_ip         VARCHAR(45),
    actor_user_agent VARCHAR(1000),
    action           VARCHAR(100) NOT NULL,
    resource_type    VARCHAR(100) NOT NULL,
    resource_id      VARCHAR(255),
    before_state     JSONB,
    after_state      JSONB,
    metadata         JSONB,
    session_id       VARCHAR(36),
    request_id       VARCHAR(36)  NOT NULL,
    signature        VARCHAR(64)  NOT NULL
);

-- 4. Indexes (match models/audit_log.py __table_args__)
CREATE INDEX IF NOT EXISTS ix_audit_org_action
    ON audit_logs (organization_id, action);

CREATE INDEX IF NOT EXISTS ix_audit_org_resource
    ON audit_logs (organization_id, resource_type, resource_id);

CREATE INDEX IF NOT EXISTS ix_audit_org_actor
    ON audit_logs (organization_id, actor_id);

CREATE INDEX IF NOT EXISTS ix_audit_org_timestamp
    ON audit_logs (organization_id, timestamp DESC);

-- 5. Row-level security: tenants can only read their own org's rows
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy for the application role (app connects as 'orthoclinic_app')
-- The app sets a session variable: SET app.current_org_id = <id>
CREATE POLICY audit_org_isolation ON audit_logs
    USING (organization_id = current_setting('app.current_org_id', true)::INTEGER)
    WITH CHECK (organization_id = current_setting('app.current_org_id', true)::INTEGER);

-- Superadmin bypass
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_superadmin_bypass ON audit_logs
    TO postgres
    USING (true)
    WITH CHECK (true);

-- 6. Prevent DELETE via trigger (belt-and-suspenders over role privilege)
CREATE OR REPLACE FUNCTION deny_audit_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be deleted.';
END;
$$;

DROP TRIGGER IF EXISTS no_audit_delete ON audit_logs;
CREATE TRIGGER no_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION deny_audit_delete();

-- Prevent UPDATE via trigger
CREATE OR REPLACE FUNCTION deny_audit_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated.';
END;
$$;

DROP TRIGGER IF EXISTS no_audit_update ON audit_logs;
CREATE TRIGGER no_audit_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION deny_audit_update();

-- 7. Partitioning hint (for PostgreSQL 14+, apply on large deployments)
-- To convert to monthly range partitioning, re-create the table as:
--   CREATE TABLE audit_logs (...) PARTITION BY RANGE (timestamp);
--   CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- Then drop the data older than 90 days by detaching old partitions
-- and moving them to S3 via export_audit_to_s3.py.

COMMENT ON TABLE audit_logs IS
  'Immutable HMAC-chained audit log. INSERT only. Never UPDATE or DELETE.';
