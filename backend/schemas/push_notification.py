"""
Pydantic schemas for Push Notification endpoints.
"""

from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator
from models.push_notification import PlatformEnum, NotificationTypeEnum, NotificationStatusEnum


# ---------------------------------------------------------------------------
# Device Token
# ---------------------------------------------------------------------------

class DeviceTokenRegister(BaseModel):
    """Payload sent by the mobile app after obtaining an FCM/APNs token."""
    token: str = Field(..., min_length=10, description="FCM registration token or APNs device token")
    platform: PlatformEnum
    device_name: Optional[str] = Field(None, max_length=150)
    app_version: Optional[str] = Field(None, max_length=50)
    dnd_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$", description="Do Not Disturb start HH:MM")
    dnd_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$", description="Do Not Disturb end HH:MM")


class DeviceTokenResponse(BaseModel):
    id: int
    token: str
    platform: PlatformEnum
    device_name: Optional[str]
    app_version: Optional[str]
    dnd_start: Optional[str]
    dnd_end: Optional[str]
    is_active: bool
    created_at: datetime
    last_seen_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Notification Payload (what FCM/APNs receive)
# ---------------------------------------------------------------------------

class FCMAndroidNotification(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    image: Optional[str] = None
    click_action: Optional[str] = None   # Activity to launch for deep link
    channel_id: str = "orthoclinic_default"


class FCMAndroidConfig(BaseModel):
    priority: str = "high"                # high | normal
    ttl: str = "86400s"                   # 24-hour TTL
    notification: FCMAndroidNotification


class APNsAlert(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    body: Optional[str] = None


class APNsPayload(BaseModel):
    alert: Optional[APNsAlert] = None
    badge: Optional[int] = None
    sound: Optional[str] = "default"
    content_available: Optional[int] = None   # 1 for silent/background fetch
    mutable_content: Optional[int] = None


class FCMMessage(BaseModel):
    """Complete FCM v1 API message envelope."""
    token: str
    notification: Optional[FCMAndroidNotification] = None
    data: Optional[Dict[str, str]] = None
    android: Optional[FCMAndroidConfig] = None
    apns: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Internal dispatch request (backend → push_service)
# ---------------------------------------------------------------------------

class SendPushRequest(BaseModel):
    """
    Used internally when any backend router wants to dispatch a push.
    Also exposed as a webhook for external services (e.g. scheduler, WhatsApp bot).
    """
    user_id: Optional[int] = None
    # OR broadcast to a list of tokens directly
    tokens: Optional[List[str]] = None

    notification_type: NotificationTypeEnum
    title: str = Field(..., max_length=255)
    body: str
    data: Optional[Dict[str, Any]] = None
    image_url: Optional[str] = None
    deep_link: Optional[str] = None
    is_silent: bool = False
    scheduled_for: Optional[datetime] = None


class SendPushResponse(BaseModel):
    dispatched: int = 0
    failed: int = 0
    notification_ids: List[int] = []
    errors: List[str] = []


# ---------------------------------------------------------------------------
# Notification center (in-app list)
# ---------------------------------------------------------------------------

class NotificationItem(BaseModel):
    id: int
    notification_type: NotificationTypeEnum
    title: Optional[str]
    body: Optional[str]
    deep_link: Optional[str]
    image_url: Optional[str]
    status: NotificationStatusEnum
    is_silent: bool
    read_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationCenterResponse(BaseModel):
    items: List[NotificationItem]
    unread_count: int
    total: int


class MarkReadRequest(BaseModel):
    notification_ids: List[int]


# ---------------------------------------------------------------------------
# Notification Preferences
# ---------------------------------------------------------------------------

class NotificationPreferenceItem(BaseModel):
    notification_type: NotificationTypeEnum
    push_enabled: bool = True
    email_enabled: bool = False
    sms_enabled: bool = False
    reminder_lead_minutes: int = Field(60, ge=5, le=1440)

    model_config = {"from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    preferences: List[NotificationPreferenceItem]


class NotificationPreferencesResponse(BaseModel):
    preferences: List[NotificationPreferenceItem]
