"""
Audit Log Router — OrthoClinic Sprint 8

Endpoints:
  GET  /audit/logs                      — paginated log query (admin+)
  GET  /audit/patient-access-report     — LGPD Art. 37 report (admin+)
  GET  /audit/chain-integrity           — HMAC chain verification (superadmin)
  GET  /audit/export/csv                — CSV download (admin+)
  GET  /audit/monthly-summary           — executive report (admin+)
  GET  /audit/ws/stream                 — real-time WebSocket stream (admin+)

All write endpoints are intentionally absent: audit logs are immutable.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user, require_admin, require_superadmin
from models.organization import User
from services.audit_service import (
    AuditLogService,
    AuditQueryService,
    ChainVerifier,
    AUDITABLE_ACTIONS,
)

logger = logging.getLogger("orthoclinic.routers.audit")
router = APIRouter(prefix="/audit", tags=["Audit Log"])


def require_audit_viewer(current_user: User = Depends(get_current_user)) -> User:
    """Admin, superadmin ou MÉDICO (dono da clínica usa o login doctor no dia a
    dia — decisão 02/08 ao criar a tela /auditoria). Secretárias não veem."""
    if current_user.role not in ("admin", "superadmin", "doctor"):
        raise HTTPException(403, "Sem permissão para ver a auditoria")
    return current_user


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class AuditEntryOut(BaseModel):
    id:               str
    timestamp:        datetime
    organization_id:  int
    actor_id:         Optional[int]
    actor_ip:         Optional[str]
    action:           str
    resource_type:    str
    resource_id:      Optional[str]
    before_state:     Optional[Dict[str, Any]]
    after_state:      Optional[Dict[str, Any]]
    # ORM attribute is 'extra_metadata' (DB column is 'metadata')
    # We alias it back to 'metadata' in the API response.
    extra_metadata:   Optional[Dict[str, Any]] = None
    session_id:       Optional[str]
    request_id:       Optional[str]
    # signature intentionally excluded from default output
    model_config = {"from_attributes": True, "populate_by_name": True}

    # No Postgres a coluna id é UUID (as_uuid=True) → vem como uuid.UUID, que o
    # Pydantic 2 não coage para str (só no SQLite local, onde já é String). Coage
    # aqui para evitar ResponseValidationError → 500 em /audit/logs.
    @field_validator("id", "resource_id", "session_id", "request_id", mode="before")
    @classmethod
    def _coerce_uuid_to_str(cls, v):
        return str(v) if v is not None else v

    @property
    def metadata(self) -> Optional[Dict[str, Any]]:
        return self.extra_metadata


class ChainIntegrityOut(BaseModel):
    ok:            bool
    rows_checked:  int
    first_bad_id:  Optional[str]
    message:       str


class PatientAccessRow(BaseModel):
    timestamp:   str
    actor_id:    Optional[int]
    actor_ip:    Optional[str]
    action:      str
    patient_id:  Optional[str]
    metadata:    Optional[Dict[str, Any]]
    request_id:  Optional[str]


# ---------------------------------------------------------------------------
# GET /audit/logs
# ---------------------------------------------------------------------------

@router.get("/logs", response_model=List[AuditEntryOut])
def get_audit_logs(
    actor_id:      Optional[int]      = Query(None),
    action:        Optional[str]      = Query(None),
    resource_type: Optional[str]      = Query(None),
    resource_id:   Optional[str]      = Query(None),
    since:         Optional[datetime] = Query(None),
    until:         Optional[datetime] = Query(None),
    limit:         int                = Query(100, ge=1, le=1000),
    offset:        int                = Query(0, ge=0),
    current_user:  User               = Depends(require_audit_viewer),
    db:            Session            = Depends(get_db),
):
    """
    Paginated, filtered audit log query.

    - Admins see only their own organisation's entries.
    - Superadmins see all (use actor_id / org filters to scope).
    """
    org_id = current_user.organization_id

    return AuditQueryService.list_entries(
        db,
        organization_id=org_id,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# GET /audit/patient-access-report
# ---------------------------------------------------------------------------

@router.get("/patient-access-report", response_model=List[PatientAccessRow])
def patient_access_report(
    patient_id:   Optional[int]      = Query(None, description="Filter to a specific patient"),
    since:        Optional[datetime] = Query(None),
    until:        Optional[datetime] = Query(None),
    current_user: User               = Depends(require_audit_viewer),
    db:           Session            = Depends(get_db),
):
    """
    LGPD Article 37 — records of processing activities.
    Returns who accessed each patient record and when.
    """
    return AuditQueryService.patient_access_report(
        db,
        organization_id=current_user.organization_id,
        patient_id=patient_id,
        since=since,
        until=until,
    )


# ---------------------------------------------------------------------------
# GET /audit/chain-integrity
# ---------------------------------------------------------------------------

@router.get("/chain-integrity", response_model=ChainIntegrityOut)
def chain_integrity(
    limit:        int  = Query(0, ge=0, description="Max rows to check (0 = all)"),
    _:            User = Depends(require_superadmin),
    db:           Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Verify the HMAC-SHA256 chain for this organisation's audit log.
    Returns the first tampered entry ID if the chain is broken.
    Superadmin only.
    """
    ok, rows_checked, first_bad_id = ChainVerifier.verify_org(
        db,
        organization_id=current_user.organization_id,
        limit=limit,
    )
    return ChainIntegrityOut(
        ok=ok,
        rows_checked=rows_checked,
        first_bad_id=first_bad_id,
        message="Chain intact" if ok else f"Tampering detected at entry {first_bad_id}",
    )


# ---------------------------------------------------------------------------
# GET /audit/export/csv
# ---------------------------------------------------------------------------

@router.get("/export/csv")
def export_csv(
    since:        Optional[datetime] = Query(None),
    until:        Optional[datetime] = Query(None),
    current_user: User               = Depends(require_audit_viewer),
    db:           Session            = Depends(get_db),
):
    """
    Download audit log as CSV for the specified date range.
    Returned as an attachment with appropriate content-type headers.
    """
    csv_data = AuditQueryService.export_csv(
        db,
        organization_id=current_user.organization_id,
        since=since,
        until=until,
    )
    filename = f"audit_org{current_user.organization_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# GET /audit/monthly-summary
# ---------------------------------------------------------------------------

@router.get("/monthly-summary")
def monthly_summary(
    year:         int  = Query(..., ge=2020, le=2099),
    month:        int  = Query(..., ge=1,    le=12),
    current_user: User = Depends(require_audit_viewer),
    db:           Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Auto-generated monthly executive compliance summary.
    Includes total events, action breakdown, top actors, LGPD KPIs.
    """
    return AuditQueryService.monthly_executive_summary(
        db,
        organization_id=current_user.organization_id,
        year=year,
        month=month,
    )


# ---------------------------------------------------------------------------
# GET /audit/actions  — meta endpoint listing all auditable actions
# ---------------------------------------------------------------------------

@router.get("/actions")
def list_actions(
    _: User = Depends(require_audit_viewer),
) -> Dict[str, str]:
    """Return the full catalogue of auditable action strings and their categories."""
    return AUDITABLE_ACTIONS


# ---------------------------------------------------------------------------
# WebSocket  /audit/ws/stream  — real-time SIEM stream
# ---------------------------------------------------------------------------

_ws_connections: List[WebSocket] = []


@router.websocket("/ws/stream")
async def audit_stream(websocket: WebSocket):
    """
    Real-time audit log stream for SIEM dashboards.

    Authentication: pass the JWT as a query parameter:
      wss://host/audit/ws/stream?token=<jwt>

    After connecting, the client receives JSON audit events as they are
    written.  This is a broadcast endpoint — all connected clients receive
    all events for the organisation.

    Note: In the current implementation, events are broadcast in-process.
    For multi-worker deployments, use a Redis pub/sub fan-out instead.
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="token required")
        return

    # Validate JWT inline (reuse deps logic)
    from jose import jwt as _jwt, JWTError
    from deps import SECRET_KEY, ALGORITHM
    from database import SessionLocal
    try:
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        await websocket.close(code=4003, reason="invalid token")
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.active == True).first()
        if not user or user.role not in ("admin", "superadmin"):
            await websocket.close(code=4003, reason="forbidden")
            return
    finally:
        db.close()

    await websocket.accept()
    _ws_connections.append(websocket)
    try:
        while True:
            # Keep-alive: client can send "ping", we echo "pong"
            data = await websocket.receive_text()
            if data.strip() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)


async def broadcast_audit_event(event: Dict[str, Any]) -> None:
    """
    Broadcast a serialised audit event to all connected WebSocket clients.
    Called by the SIEM streamer when a new audit entry is created.
    """
    import asyncio, json
    dead: List[WebSocket] = []
    for ws in list(_ws_connections):
        try:
            await ws.send_text(json.dumps(event, default=str))
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in _ws_connections:
            _ws_connections.remove(ws)
