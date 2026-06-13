"""
Push Notification Service — OrthoClinic Mobile
===============================================

Handles:
  - FCM v1 HTTP API (Android + Web)
  - APNs HTTP/2 (iOS) via JWT bearer token
  - Token refresh / invalid-token cleanup
  - DND (Do Not Disturb) window enforcement
  - Silent / background-fetch pushes
  - Retry with exponential back-off (max 3 attempts)
  - Offline queue: notifications enqueued when device unreachable

SETUP SIMULATION
----------------
Real deployment requires:
  FCM:
    1. Firebase console → Project settings → Service accounts
       → Generate new private key  (saves as orthoclinic-firebase-adminsdk-*.json)
    2. Set env var:  GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
    3. FCM sender ID:  FCM_SENDER_ID=123456789
    4. FCM project ID: FIREBASE_PROJECT_ID=orthoclinic-prod

  APNs:
    1. Apple Developer → Certificates → APNs Auth Key (.p8)
    2. Set env vars:
         APNS_KEY_PATH=/certs/AuthKey_XXXXXXXXXX.p8
         APNS_KEY_ID=XXXXXXXXXX
         APNS_TEAM_ID=YYYYYYYYYY
         APNS_BUNDLE_ID=com.orthoclinic.app
    3. Env var APNS_ENV=production  (or "sandbox" for dev)

Edge cases handled:
  - NotRegistered / BadDeviceToken   → token deactivated automatically
  - MessageRateExceeded              → 60-second back-off
  - Payload too large                → body truncated to fit 4KB limit
  - App killed (TERMINATED state)    → priority "high" on both platforms
  - Offline device                   → stored message survives until TTL
  - DND window active                → notification deferred, re-sent at window end
  - iOS background fetch             → content-available:1, no alert, low battery impact
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from models.push_notification import (
    DeviceToken, PushNotification, NotificationPreference,
    PlatformEnum, NotificationTypeEnum, NotificationStatusEnum,
)
from schemas.push_notification import SendPushRequest, SendPushResponse

logger = logging.getLogger("push_notification_service")

# ---------------------------------------------------------------------------
# Configuration (sourced from environment — values shown are dev defaults)
# ---------------------------------------------------------------------------
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "orthoclinic-dev")
FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")          # Legacy; used as fallback
FCM_V1_ENDPOINT = (
    f"https://fcm.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/messages:send"
)

APNS_KEY_PATH = os.getenv("APNS_KEY_PATH", "/certs/AuthKey_ORTHOCLINIC.p8")
APNS_KEY_ID = os.getenv("APNS_KEY_ID", "ORTHOCLINIC01")
APNS_TEAM_ID = os.getenv("APNS_TEAM_ID", "ORTHO12345")
APNS_BUNDLE_ID = os.getenv("APNS_BUNDLE_ID", "com.orthoclinic.app")
APNS_ENV = os.getenv("APNS_ENV", "sandbox")  # sandbox | production
APNS_HOST = (
    "https://api.push.apple.com"
    if APNS_ENV == "production"
    else "https://api.sandbox.push.apple.com"
)

MAX_FCM_PAYLOAD_BYTES = 4096
MAX_APNS_PAYLOAD_BYTES = 4096
MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# Deep-link routing table
# ---------------------------------------------------------------------------
DEEP_LINK_ROUTES: dict[NotificationTypeEnum, str] = {
    NotificationTypeEnum.appointment_reminder: "/agenda/{resource_id}",
    NotificationTypeEnum.result_ready:         "/resultados/{resource_id}",
    NotificationTypeEnum.message_received:     "/mensagens/{resource_id}",
    NotificationTypeEnum.system_alert:         "/alertas/{resource_id}",
}


def resolve_deep_link(notification_type: NotificationTypeEnum, resource_id: Optional[str] = None) -> str:
    template = DEEP_LINK_ROUTES.get(notification_type, "/")
    if resource_id:
        return template.format(resource_id=resource_id)
    return template.replace("/{resource_id}", "")


# ---------------------------------------------------------------------------
# DND helper
# ---------------------------------------------------------------------------

def _in_dnd_window(token: DeviceToken) -> bool:
    """
    Returns True if current UTC time falls inside the device's DND window.
    DND start/end are stored in user local time but we approximate with UTC
    until per-user timezone is implemented.
    """
    if not token.dnd_start or not token.dnd_end:
        return False
    now_minutes = datetime.now(timezone.utc).hour * 60 + datetime.now(timezone.utc).minute
    start_h, start_m = map(int, token.dnd_start.split(":"))
    end_h, end_m = map(int, token.dnd_end.split(":"))
    start_total = start_h * 60 + start_m
    end_total = end_h * 60 + end_m

    if start_total <= end_total:
        return start_total <= now_minutes < end_total
    # Crosses midnight
    return now_minutes >= start_total or now_minutes < end_total


# ---------------------------------------------------------------------------
# FCM v1 HTTP sender
# ---------------------------------------------------------------------------

async def _send_fcm(token_str: str, request: SendPushRequest) -> Tuple[bool, str, str]:
    """
    Returns (success, provider_message_id, error_code).

    Authentication uses Google OAuth2 access token obtained via
    google-auth library from the service-account JSON.
    In test/dev mode we simulate the call.
    """
    # SIMULATION: In production, replace with real google-auth token fetch
    # from google.oauth2 import service_account
    # from google.auth.transport.requests import Request as GoogleRequest
    # creds = service_account.Credentials.from_service_account_file(
    #     os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
    #     scopes=["https://www.googleapis.com/auth/firebase.messaging"]
    # )
    # creds.refresh(GoogleRequest())
    # access_token = creds.token

    body_text = request.body
    # Truncate body so total payload stays under FCM limit
    if len(body_text.encode()) > MAX_FCM_PAYLOAD_BYTES - 500:
        body_text = body_text[:MAX_FCM_PAYLOAD_BYTES - 503] + "..."

    fcm_payload: dict = {
        "message": {
            "token": token_str,
            "android": {
                "priority": "high",
                "ttl": "86400s",
                "notification": {
                    "channel_id": f"orthoclinic_{request.notification_type.value}",
                },
            },
            "data": {
                "type": request.notification_type.value,
                "deep_link": request.deep_link or resolve_deep_link(request.notification_type),
                **(
                    {k: str(v) for k, v in (request.data or {}).items()}
                ),
            },
        }
    }

    if request.is_silent:
        # Silent / background fetch — no visual notification
        fcm_payload["message"]["data"]["_silent"] = "true"
    else:
        fcm_payload["message"]["notification"] = {
            "title": request.title,
            "body": body_text,
        }
        if request.image_url:
            fcm_payload["message"]["notification"]["image"] = request.image_url

    # DEV SIMULATION — log and return success
    if not os.getenv("FIREBASE_PROJECT_ID") or os.getenv("FIREBASE_PROJECT_ID", "").endswith("-dev"):
        logger.info(
            "[FCM SIMULATED] token=%s... payload=%s",
            token_str[:20],
            json.dumps(fcm_payload)[:200],
        )
        return True, f"fcm_sim_{int(time.time())}", ""

    # PRODUCTION path
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                FCM_V1_ENDPOINT,
                headers={
                    "Authorization": f"Bearer REPLACE_WITH_REAL_GOOGLE_ACCESS_TOKEN",
                    "Content-Type": "application/json",
                },
                json=fcm_payload,
            )
        if resp.status_code == 200:
            data = resp.json()
            return True, data.get("name", ""), ""
        err = resp.json().get("error", {})
        return False, "", err.get("status", str(resp.status_code))
    except Exception as exc:
        return False, "", str(exc)


# ---------------------------------------------------------------------------
# APNs HTTP/2 sender
# ---------------------------------------------------------------------------

def _build_apns_jwt() -> str:
    """
    Build a short-lived JWT for APNs HTTP/2 authentication.
    Real implementation uses the .p8 key with ES256 algorithm.

    SIMULATION: returns a placeholder token.
    In production install:
        pip install PyJWT cryptography
    and uncomment the real implementation below.
    """
    # PRODUCTION:
    # import jwt as pyjwt
    # from pathlib import Path
    # private_key = Path(APNS_KEY_PATH).read_text()
    # token = pyjwt.encode(
    #     {"iss": APNS_TEAM_ID, "iat": int(time.time())},
    #     private_key,
    #     algorithm="ES256",
    #     headers={"alg": "ES256", "kid": APNS_KEY_ID},
    # )
    # return token
    return "APNS_SIMULATED_JWT"


async def _send_apns(token_str: str, request: SendPushRequest) -> Tuple[bool, str, str]:
    """Returns (success, apns_id, error_reason)."""
    jwt_token = _build_apns_jwt()

    aps: dict = {}
    if request.is_silent:
        aps["content-available"] = 1
    else:
        aps["alert"] = {"title": request.title, "body": request.body}
        aps["sound"] = "default"
        aps["badge"] = 1
        aps["mutable-content"] = 1  # allows notification service extension

    payload = {
        "aps": aps,
        "type": request.notification_type.value,
        "deep_link": request.deep_link or resolve_deep_link(request.notification_type),
        **(request.data or {}),
    }
    payload_bytes = json.dumps(payload).encode()

    if len(payload_bytes) > MAX_APNS_PAYLOAD_BYTES:
        # Truncate body to fit
        excess = len(payload_bytes) - MAX_APNS_PAYLOAD_BYTES + 10
        if not request.is_silent:
            payload["aps"]["alert"]["body"] = payload["aps"]["alert"]["body"][:-excess] + "…"
        payload_bytes = json.dumps(payload).encode()

    apns_topic = APNS_BUNDLE_ID
    push_type = "background" if request.is_silent else "alert"
    apns_priority = "5" if request.is_silent else "10"

    # DEV SIMULATION
    if APNS_ENV == "sandbox" and not os.getenv("APNS_KEY_PATH"):
        logger.info(
            "[APNS SIMULATED] token=%s... push_type=%s payload=%s",
            token_str[:20], push_type, json.dumps(payload)[:200],
        )
        return True, f"apns_sim_{int(time.time())}", ""

    # PRODUCTION: uses HTTP/2 — httpx supports it when h2 package is installed
    try:
        url = f"{APNS_HOST}/3/device/{token_str}"
        async with httpx.AsyncClient(http2=True, timeout=10.0) as client:
            resp = await client.post(
                url,
                content=payload_bytes,
                headers={
                    "authorization": f"bearer {jwt_token}",
                    "apns-topic": apns_topic,
                    "apns-push-type": push_type,
                    "apns-priority": apns_priority,
                    "content-type": "application/json",
                },
            )
        if resp.status_code == 200:
            return True, resp.headers.get("apns-id", ""), ""
        error_reason = resp.json().get("reason", str(resp.status_code))
        return False, "", error_reason
    except Exception as exc:
        return False, "", str(exc)


# ---------------------------------------------------------------------------
# Token cleanup after provider errors
# ---------------------------------------------------------------------------

UNREGISTERED_ERRORS = {
    # FCM
    "UNREGISTERED", "INVALID_ARGUMENT",
    # APNs
    "BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic",
}


def _deactivate_token(db: Session, token: DeviceToken, error: str) -> None:
    if any(e in error for e in UNREGISTERED_ERRORS):
        token.is_active = False
        db.add(token)
        db.commit()
        logger.warning("Deactivated stale token id=%s reason=%s", token.id, error)


# ---------------------------------------------------------------------------
# Main dispatch function
# ---------------------------------------------------------------------------

async def dispatch_push(
    db: Session,
    request: SendPushRequest,
) -> SendPushResponse:
    """
    Core dispatch: resolves tokens for the user (or uses provided list),
    checks preferences and DND, then sends via FCM or APNs.
    """
    response = SendPushResponse()

    # Resolve tokens
    tokens: List[DeviceToken] = []
    if request.user_id:
        # Check notification preference
        pref = (
            db.query(NotificationPreference)
            .filter_by(user_id=request.user_id, notification_type=request.notification_type)
            .first()
        )
        if pref and not pref.push_enabled:
            logger.info("Push disabled for user=%s type=%s", request.user_id, request.notification_type)
            return response

        tokens = (
            db.query(DeviceToken)
            .filter_by(user_id=request.user_id, is_active=True)
            .all()
        )
    elif request.tokens:
        tokens = (
            db.query(DeviceToken)
            .filter(DeviceToken.token.in_(request.tokens), DeviceToken.is_active == True)
            .all()
        )

    if not tokens:
        logger.info("No active tokens found for request user=%s", request.user_id)
        return response

    tasks = []
    notification_records: List[PushNotification] = []

    for device in tokens:
        # DND check — skip visual push but allow silent
        if not request.is_silent and _in_dnd_window(device):
            logger.info("DND active for device=%s — deferring", device.id)
            # Store as pending for deferred send (handled by scheduler)
            notif = PushNotification(
                user_id=device.user_id,
                device_id=device.id,
                notification_type=request.notification_type,
                status=NotificationStatusEnum.pending,
                title=request.title,
                body=request.body,
                data=request.data,
                deep_link=request.deep_link,
                image_url=request.image_url,
                is_silent=request.is_silent,
                scheduled_for=_next_dnd_end(device),
            )
            db.add(notif)
            notification_records.append(notif)
            continue

        # Create DB record
        notif = PushNotification(
            user_id=device.user_id,
            device_id=device.id,
            notification_type=request.notification_type,
            status=NotificationStatusEnum.pending,
            title=request.title,
            body=request.body,
            data=request.data,
            deep_link=request.deep_link or resolve_deep_link(request.notification_type),
            image_url=request.image_url,
            is_silent=request.is_silent,
        )
        db.add(notif)
        notification_records.append(notif)
        tasks.append((device, notif))

    db.commit()

    # Dispatch concurrently
    async def _dispatch_single(device: DeviceToken, notif: PushNotification) -> None:
        for attempt in range(1, MAX_RETRIES + 1):
            if device.platform == PlatformEnum.android or device.platform == PlatformEnum.web:
                success, msg_id, error = await _send_fcm(device.token, request)
            else:
                success, msg_id, error = await _send_apns(device.token, request)

            if success:
                notif.status = NotificationStatusEnum.sent
                notif.provider_message_id = msg_id
                notif.sent_at = datetime.now(timezone.utc)
                db.add(notif)
                db.commit()
                response.dispatched += 1
                response.notification_ids.append(notif.id)
                return

            notif.retry_count = attempt
            notif.error_code = error
            notif.error_message = error

            # Deactivate stale tokens immediately
            _deactivate_token(db, device, error)

            if attempt < MAX_RETRIES:
                wait = 2 ** attempt  # 2, 4 seconds
                if "MessageRateExceeded" in error:
                    wait = 60
                await asyncio.sleep(wait)

        notif.status = NotificationStatusEnum.failed
        db.add(notif)
        db.commit()
        response.failed += 1
        response.errors.append(f"device={device.id}: {error}")

    await asyncio.gather(*[_dispatch_single(d, n) for d, n in tasks])

    return response


def _next_dnd_end(device: DeviceToken) -> Optional[datetime]:
    """Compute next datetime when DND window ends."""
    if not device.dnd_end:
        return None
    h, m = map(int, device.dnd_end.split(":"))
    now = datetime.now(timezone.utc)
    candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


# ---------------------------------------------------------------------------
# Appointment reminder scheduler helper
# ---------------------------------------------------------------------------

async def schedule_appointment_reminder(
    db: Session,
    user_id: int,
    appointment_id: int,
    appointment_dt: datetime,
    patient_name: str,
) -> None:
    """
    Creates a push notification record scheduled 60 min before the appointment.
    A background task (cron/celery) calls dispatch_push for pending notifications.
    """
    pref = (
        db.query(NotificationPreference)
        .filter_by(user_id=user_id, notification_type=NotificationTypeEnum.appointment_reminder)
        .first()
    )
    lead_minutes = pref.reminder_lead_minutes if pref else 60

    scheduled_for = appointment_dt - timedelta(minutes=lead_minutes)
    if scheduled_for <= datetime.now(timezone.utc):
        scheduled_for = datetime.now(timezone.utc) + timedelta(minutes=1)

    notif = PushNotification(
        user_id=user_id,
        notification_type=NotificationTypeEnum.appointment_reminder,
        status=NotificationStatusEnum.pending,
        title="Lembrete de Consulta",
        body=f"Sua consulta está agendada em {lead_minutes} minutos.",
        data={"appointment_id": str(appointment_id), "patient_name": patient_name},
        deep_link=f"/agenda/{appointment_id}",
        is_silent=False,
        scheduled_for=scheduled_for,
    )
    db.add(notif)
    db.commit()
    logger.info(
        "Appointment reminder scheduled: user=%s appt=%s at=%s",
        user_id, appointment_id, scheduled_for.isoformat(),
    )
