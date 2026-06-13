"""
Webhook delivery engine — database models (Sprint 7).

Tables:
  webhook_endpoints     — registered URLs per API key / OAuth client
  webhook_delivery_logs — immutable delivery attempt records (at-least-once log)
  webhook_dead_letters  — events that exhausted all retries
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey,
    Integer, JSON, Numeric, String, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class WebhookEndpoint(Base):
    """
    A registered webhook destination owned by one API key or OAuth client.

    Columns
    -------
    url             HTTPS URL to POST payloads to
    events          JSON list of subscribed event types, e.g. ["appointment.created"]
                    Use ["*"] to subscribe to all events.
    secret          Plaintext HMAC-SHA256 signing secret (stored only here; never
                    logged or returned to callers after creation).
    description     Human-readable label
    active          Toggle without deleting the record
    consecutive_failures
                    Rolling counter; reset to 0 on any successful delivery.
                    When it reaches CIRCUIT_BREAKER_THRESHOLD the endpoint is
                    auto-disabled (active=False) and an alert is recorded.
    ip_allowlist    Optional JSON list of CIDR strings for enterprise IP allow-
                    listing. Null = no restriction.
    mtls_cert_pem   Optional PEM-encoded client certificate for mTLS (enterprise).
    org_id          Denormalised organisation reference for fast fan-out queries.
    """

    __tablename__ = "webhook_endpoints"

    id                   = Column(Integer, primary_key=True, index=True)
    api_key_id           = Column(Integer, ForeignKey("oauth_api_keys.id", ondelete="CASCADE"), nullable=True)
    client_id            = Column(Integer, ForeignKey("oauth_clients.id",  ondelete="CASCADE"), nullable=True)
    org_id               = Column(Integer, nullable=True, index=True)

    url                  = Column(String(2000), nullable=False)
    events               = Column(JSON, default=list)
    secret               = Column(String(500), nullable=True)   # plaintext — treated as credential
    description          = Column(Text, nullable=True)
    active               = Column(Boolean, default=True, nullable=False)

    # Circuit breaker
    consecutive_failures = Column(Integer, default=0, nullable=False)
    circuit_opened_at    = Column(DateTime(timezone=True), nullable=True)

    # Enterprise features
    ip_allowlist         = Column(JSON, nullable=True)   # ["203.0.113.0/24", ...]
    mtls_cert_pem        = Column(Text, nullable=True)

    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    updated_at           = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    delivery_logs        = relationship("WebhookDeliveryLog",  back_populates="endpoint", cascade="all, delete-orphan")
    dead_letters         = relationship("WebhookDeadLetter",   back_populates="endpoint", cascade="all, delete-orphan")


class WebhookDeliveryLog(Base):
    """
    Immutable record of a single HTTP delivery attempt.

    One WebhookEvent fan-out produces N rows (one per registered endpoint),
    and each retry produces an additional row.  The evt_id ties all attempts
    for the same logical event together.

    Status values
    -------------
    success   — 2xx received within timeout
    failed    — non-2xx or timeout on this attempt (more retries may follow)
    dead      — all retries exhausted; see WebhookDeadLetter
    """

    __tablename__ = "webhook_delivery_logs"

    id              = Column(Integer, primary_key=True, index=True)
    endpoint_id     = Column(Integer, ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False, index=True)

    # Event identification
    evt_id          = Column(String(36), nullable=False, index=True)   # UUID e.g. evt_abc123
    event_type      = Column(String(100), nullable=False)

    # Delivery metadata
    attempt_number  = Column(Integer, nullable=False, default=1)
    status          = Column(String(20), nullable=False)               # success | failed | dead
    http_status     = Column(Integer, nullable=True)
    response_body   = Column(Text, nullable=True)                      # truncated to 1 KB
    error_message   = Column(Text, nullable=True)
    duration_ms     = Column(Integer, nullable=True)

    # Scheduling
    attempted_at    = Column(DateTime(timezone=True), server_default=func.now())
    next_retry_at   = Column(DateTime(timezone=True), nullable=True)

    # Payload snapshot (compact; for debugging / replay)
    payload_snapshot = Column(JSON, nullable=True)

    endpoint        = relationship("WebhookEndpoint", back_populates="delivery_logs")


class WebhookDeadLetter(Base):
    """
    Events that exhausted all 6 retry attempts.

    Kept indefinitely for manual inspection / replay.  Operators can call
    POST /api/v1/webhooks/{id}/replay/{dead_letter_id} to requeue.
    """

    __tablename__ = "webhook_dead_letters"

    id              = Column(Integer, primary_key=True, index=True)
    endpoint_id     = Column(Integer, ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False, index=True)

    evt_id          = Column(String(36), nullable=False, index=True)
    event_type      = Column(String(100), nullable=False)
    payload         = Column(JSON, nullable=False)
    total_attempts  = Column(Integer, nullable=False, default=6)
    first_attempted_at = Column(DateTime(timezone=True), nullable=True)
    last_attempted_at  = Column(DateTime(timezone=True), nullable=True)
    last_error      = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Replay tracking
    replayed_at     = Column(DateTime(timezone=True), nullable=True)
    replay_task_id  = Column(String(200), nullable=True)

    endpoint        = relationship("WebhookEndpoint", back_populates="dead_letters")
