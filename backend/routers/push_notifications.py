"""
Push Notification Router — OrthoClinic Mobile
/push/* endpoints:

  POST   /push/tokens               — register device token (called on app open)
  DELETE /push/tokens/{token_id}    — unregister (logout / app uninstall)
  GET    /push/notifications        — notification center list
  POST   /push/notifications/read   — mark notifications as read
  GET    /push/notifications/badge  — unread count (for badge refresh)
  GET    /push/preferences          — get per-type preferences
  PUT    /push/preferences          — update per-type preferences
  POST   /push/send                 — internal / webhook: send push (admin only)
  POST   /push/webhook/appointment  — webhook: appointment created → schedule reminder
  POST   /push/test                 — dev-only: send test push to calling user
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from deps import get_current_user
from models.push_notification import (
    DeviceToken, PushNotification, NotificationPreference,
    NotificationTypeEnum, NotificationStatusEnum, PlatformEnum,
)
from models.organization import User
from schemas.push_notification import (
    DeviceTokenRegister, DeviceTokenResponse,
    NotificationCenterResponse, NotificationItem,
    MarkReadRequest,
    NotificationPreferencesResponse, NotificationPreferencesUpdate, NotificationPreferenceItem,
    SendPushRequest, SendPushResponse,
)
from services.push_notification_service import dispatch_push, schedule_appointment_reminder

logger = logging.getLogger("push_router")

router = APIRouter(prefix="/push", tags=["Push Notifications"])


# ---------------------------------------------------------------------------
# Device Token Registration
# ---------------------------------------------------------------------------

@router.post(
    "/tokens",
    response_model=DeviceTokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register or refresh device token",
)
async def register_device_token(
    payload: DeviceTokenRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Called by the mobile app after:
    - First launch (FCM/APNs token obtained)
    - Token refresh event (FCM sends a new token)
    - User preferences update (DND window changed)

    Upsert logic: if the token already exists it is re-associated to the
    current user and its metadata is updated.
    """
    # Deactivate any old token for this device (same device_name + user)
    if payload.device_name:
        old = (
            db.query(DeviceToken)
            .filter_by(user_id=current_user.id, device_name=payload.device_name, is_active=True)
            .first()
        )
        if old and old.token != payload.token:
            old.is_active = False
            db.add(old)

    # Check for existing identical token
    existing = db.query(DeviceToken).filter_by(token=payload.token).first()
    if existing:
        # Reassign to current user (e.g. shared device logged in as someone else)
        existing.user_id = current_user.id
        existing.platform = payload.platform
        existing.device_name = payload.device_name
        existing.app_version = payload.app_version
        existing.dnd_start = payload.dnd_start
        existing.dnd_end = payload.dnd_end
        existing.is_active = True
        existing.last_seen_at = datetime.now(timezone.utc)
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    device = DeviceToken(
        user_id=current_user.id,
        token=payload.token,
        platform=payload.platform,
        device_name=payload.device_name,
        app_version=payload.app_version,
        dnd_start=payload.dnd_start,
        dnd_end=payload.dnd_end,
        is_active=True,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.delete(
    "/tokens/{token_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unregister device token (logout / app uninstall)",
)
async def unregister_device_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = db.query(DeviceToken).filter_by(id=token_id, user_id=current_user.id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Token not found")
    device.is_active = False
    db.add(device)
    db.commit()


# ---------------------------------------------------------------------------
# Notification Center
# ---------------------------------------------------------------------------

@router.get(
    "/notifications",
    response_model=NotificationCenterResponse,
    summary="Notification center — in-app list",
)
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(PushNotification)
        .filter(
            PushNotification.user_id == current_user.id,
            PushNotification.is_silent == False,
        )
        .order_by(PushNotification.created_at.desc())
    )
    if unread_only:
        query = query.filter(PushNotification.read_at.is_(None))

    total = query.count()
    unread_count = (
        db.query(PushNotification)
        .filter(
            PushNotification.user_id == current_user.id,
            PushNotification.is_silent == False,
            PushNotification.read_at.is_(None),
        )
        .count()
    )

    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return NotificationCenterResponse(
        items=[NotificationItem.model_validate(n) for n in items],
        unread_count=unread_count,
        total=total,
    )


@router.get(
    "/notifications/badge",
    summary="Unread badge count",
)
async def badge_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(PushNotification)
        .filter(
            PushNotification.user_id == current_user.id,
            PushNotification.is_silent == False,
            PushNotification.read_at.is_(None),
        )
        .count()
    )
    return {"unread": count}


@router.post(
    "/notifications/read",
    summary="Mark notifications as read",
)
async def mark_notifications_read(
    payload: MarkReadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    (
        db.query(PushNotification)
        .filter(
            PushNotification.id.in_(payload.notification_ids),
            PushNotification.user_id == current_user.id,
            PushNotification.read_at.is_(None),
        )
        .update({"read_at": now}, synchronize_session=False)
    )
    db.commit()

    unread = (
        db.query(PushNotification)
        .filter(
            PushNotification.user_id == current_user.id,
            PushNotification.is_silent == False,
            PushNotification.read_at.is_(None),
        )
        .count()
    )
    return {"marked": len(payload.notification_ids), "remaining_unread": unread}


# ---------------------------------------------------------------------------
# Notification Preferences
# ---------------------------------------------------------------------------

@router.get(
    "/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Get notification preferences per type",
)
async def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prefs = (
        db.query(NotificationPreference)
        .filter_by(user_id=current_user.id)
        .all()
    )
    existing_types = {p.notification_type for p in prefs}
    # Auto-create defaults for missing types
    for ntype in NotificationTypeEnum:
        if ntype not in existing_types:
            default = NotificationPreference(
                user_id=current_user.id,
                notification_type=ntype,
                push_enabled=True,
                email_enabled=False,
                sms_enabled=False,
                reminder_lead_minutes=60,
            )
            db.add(default)
    db.commit()

    prefs = (
        db.query(NotificationPreference)
        .filter_by(user_id=current_user.id)
        .all()
    )
    return NotificationPreferencesResponse(
        preferences=[NotificationPreferenceItem.model_validate(p) for p in prefs]
    )


@router.put(
    "/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Update notification preferences",
)
async def update_preferences(
    payload: NotificationPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for item in payload.preferences:
        pref = (
            db.query(NotificationPreference)
            .filter_by(user_id=current_user.id, notification_type=item.notification_type)
            .first()
        )
        if not pref:
            pref = NotificationPreference(
                user_id=current_user.id,
                notification_type=item.notification_type,
            )
        pref.push_enabled = item.push_enabled
        pref.email_enabled = item.email_enabled
        pref.sms_enabled = item.sms_enabled
        pref.reminder_lead_minutes = item.reminder_lead_minutes
        db.add(pref)
    db.commit()
    return await get_preferences(db=db, current_user=current_user)


# ---------------------------------------------------------------------------
# Send Push (internal webhook / admin)
# ---------------------------------------------------------------------------

@router.post(
    "/send",
    response_model=SendPushResponse,
    summary="Dispatch push notification (internal/webhook use)",
)
async def send_push(
    request: SendPushRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Used by:
    - Backend services (e.g. consultation router triggers 'result_ready')
    - Admin panel manual sends
    - External webhook from scheduler

    The caller must be authenticated. For machine-to-machine calls,
    generate an API key in /settings/api-keys.
    """
    return await dispatch_push(db=db, request=request)


# ---------------------------------------------------------------------------
# Appointment Reminder Webhook
# ---------------------------------------------------------------------------

class AppointmentWebhookPayload(SendPushRequest):
    appointment_id: int
    appointment_datetime: datetime
    patient_name: str


@router.post(
    "/webhook/appointment",
    response_model=dict,
    summary="Webhook: schedule appointment reminder push",
)
async def appointment_webhook(
    payload: AppointmentWebhookPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    await schedule_appointment_reminder(
        db=db,
        user_id=payload.user_id,
        appointment_id=payload.appointment_id,
        appointment_dt=payload.appointment_datetime,
        patient_name=payload.patient_name,
    )
    return {"scheduled": True}


# ---------------------------------------------------------------------------
# Dev / QA: Test Push
# ---------------------------------------------------------------------------

@router.post(
    "/test",
    response_model=SendPushResponse,
    summary="[DEV] Send a test push to the calling user's devices",
)
async def test_push(
    notification_type: NotificationTypeEnum = NotificationTypeEnum.system_alert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sends a test push to all active tokens of the authenticated user.
    Used during QA on real devices.
    """
    request = SendPushRequest(
        user_id=current_user.id,
        notification_type=notification_type,
        title="OrthoClinic — Notificação de Teste",
        body=f"Esta é uma notificação de teste do tipo '{notification_type.value}'. Tudo funcionando!",
        data={"source": "test_endpoint"},
        deep_link="/",
    )
    return await dispatch_push(db=db, request=request)
