"""
Push Notification Models for OrthoClinic Mobile

Tables:
- DeviceToken: FCM/APNs tokens per user/device
- PushNotification: persisted notification log
- NotificationPreference: per-type opt-in/out per user
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, JSON, Text,
    ForeignKey, Enum as SAEnum, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class PlatformEnum(str, enum.Enum):
    android = "android"
    ios = "ios"
    web = "web"


class NotificationTypeEnum(str, enum.Enum):
    appointment_reminder = "appointment_reminder"
    result_ready = "result_ready"
    message_received = "message_received"
    system_alert = "system_alert"


class NotificationStatusEnum(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    delivered = "delivered"
    failed = "failed"
    silent = "silent"


class DeviceToken(Base):
    """FCM or APNs token registered by a device"""
    __tablename__ = "device_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Token issued by FCM or APNs
    token = Column(Text, nullable=False)
    platform = Column(SAEnum(PlatformEnum), nullable=False)

    # Human-readable device label (e.g. "iPhone 15 Pro" or "Galaxy S24")
    device_name = Column(String(150), nullable=True)

    # App bundle / package identifier
    app_version = Column(String(50), nullable=True)

    # Do Not Disturb window stored as "HH:MM-HH:MM" in user local time
    dnd_start = Column(String(5), nullable=True)   # "22:00"
    dnd_end = Column(String(5), nullable=True)     # "07:00"

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="device_tokens")
    notifications = relationship("PushNotification", back_populates="device", cascade="all, delete-orphan")

    __table_args__ = (
        # One token can only be active once; dedup on upsert
        Index("ix_device_token_unique", "token", unique=True),
    )


class PushNotification(Base):
    """Persisted record of every push attempt"""
    __tablename__ = "push_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    device_id = Column(Integer, ForeignKey("device_tokens.id", ondelete="SET NULL"), nullable=True)

    notification_type = Column(SAEnum(NotificationTypeEnum), nullable=False, index=True)
    status = Column(SAEnum(NotificationStatusEnum), default=NotificationStatusEnum.pending, index=True)

    # Payload (stored for retry / history)
    title = Column(String(255), nullable=True)
    body = Column(Text, nullable=True)
    data = Column(JSON, nullable=True)          # Deep-link + extra data
    image_url = Column(String(500), nullable=True)

    # Deep link target (e.g. "/agenda/123", "/resultados/456")
    deep_link = Column(String(500), nullable=True)

    # Provider response
    provider_message_id = Column(String(255), nullable=True)
    error_code = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)

    # Silent push flag (background fetch)
    is_silent = Column(Boolean, default=False)

    # Scheduling
    scheduled_for = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="push_notifications")
    device = relationship("DeviceToken", back_populates="notifications")


class NotificationPreference(Base):
    """Per-user per-type push preference"""
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    notification_type = Column(SAEnum(NotificationTypeEnum), nullable=False)

    push_enabled = Column(Boolean, default=True)
    email_enabled = Column(Boolean, default=False)
    sms_enabled = Column(Boolean, default=False)

    # Lead time for appointment reminders (minutes before)
    reminder_lead_minutes = Column(Integer, default=60)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="notification_preferences")

    __table_args__ = (
        Index("ix_notif_pref_unique", "user_id", "notification_type", unique=True),
    )
