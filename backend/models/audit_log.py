"""
Immutable Audit Log Model — OrthoClinic Sprint 8

Design principles:
- NO UPDATE or DELETE is ever performed on this table.
- A separate append-only PostgreSQL role (audit_writer) owns INSERT privileges only.
- Each row carries a HMAC-SHA256 signature chaining the previous entry's hash,
  making tampering detectable via the verify_chain script.
- For SQLite (dev/test) the HMAC chain still works; just no DB-level role isolation.

Schema mirrors the enterprise spec:
  id, timestamp, organization_id, actor_id, actor_ip, actor_user_agent,
  action, resource_type, resource_id, before_state, after_state,
  metadata, session_id, request_id, signature
"""

from __future__ import annotations

import uuid
from sqlalchemy import (
    Column, String, Integer, Text, DateTime,
    ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy import JSON
from sqlalchemy.sql import func
from database import Base, DATABASE_URL


def _uuid_col(**kw):
    """Return UUID primary key column compatible with both PG and SQLite."""
    if DATABASE_URL.startswith("postgresql"):
        return Column(PG_UUID(as_uuid=True), **kw)
    # SQLite stores UUIDs as strings
    return Column(String(36), **kw)


def _json_col(**kw):
    """Return JSONB on PostgreSQL, JSON on SQLite."""
    if DATABASE_URL.startswith("postgresql"):
        return Column(JSONB, **kw)
    return Column(JSON, **kw)


class AuditLog(Base):
    """
    Immutable audit log entry.  NEVER issue UPDATE or DELETE against this table.

    Row lifecycle:
      1. Service layer calls AuditLogService.record(...)
      2. Service computes HMAC chain:  sha256(prev_hash + canonical_json(row))
      3. Row is INSERTed via the append-only audit_writer DB role.
      4. Chain can be verified any time via verify_chain.py script.
    """
    __tablename__ = "audit_logs"

    # Primary key — UUID so rows cannot be guessed/enumerated
    id = _uuid_col(primary_key=True, default=lambda: str(uuid.uuid4()))

    # When — microsecond precision; stored as UTC
    timestamp = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Multi-tenancy scope
    organization_id = Column(
        Integer,
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Who performed the action (NULL for system/background actions)
    actor_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Network context
    actor_ip          = Column(String(45),   nullable=True)   # IPv4 or IPv6
    actor_user_agent  = Column(String(1000), nullable=True)

    # What happened — "resource.verb" format, e.g. "patient.viewed"
    action         = Column(String(100), nullable=False, index=True)
    resource_type  = Column(String(100), nullable=False, index=True)
    resource_id    = Column(String(255), nullable=True,  index=True)

    # State diff (nullable for non-mutation actions like .viewed)
    before_state = _json_col(nullable=True)
    after_state  = _json_col(nullable=True)

    # Arbitrary extra context (query params, search terms, export format, …)
    # Named 'extra_metadata' on the ORM to avoid collision with SQLAlchemy's
    # reserved 'metadata' attribute on declarative models.
    # The actual DB column is named 'metadata'.
    extra_metadata = _json_col(name="metadata", nullable=True)

    # Session & request tracing
    session_id  = Column(String(36), nullable=True,  index=True)
    request_id  = Column(String(36), nullable=False, index=True)

    # HMAC-SHA256 chain signature
    # sha256( previous_entry_signature_hex + canonical_json(this_row_without_signature) )
    # The very first row of each org uses the HMAC key as the seed.
    signature = Column(String(64), nullable=False)

    # ------------------------------------------------------------------ indexes
    __table_args__ = (
        # Fast lookup for per-org, per-resource audit trails
        Index("ix_audit_org_action",    "organization_id", "action"),
        Index("ix_audit_org_resource",  "organization_id", "resource_type", "resource_id"),
        Index("ix_audit_org_actor",     "organization_id", "actor_id"),
        Index("ix_audit_org_timestamp", "organization_id", "timestamp"),
    )
