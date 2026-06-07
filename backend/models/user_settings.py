"""
User Settings Models for ORTHOCLINIC

Includes:
- UserPreferences (notification, privacy, language, theme)
- UserSettings (display, layout preferences)
- UserSession (connected devices)
- LoginHistory (login audit trail)
- ActivityLog (all user action logs)
- APIKey (API key management)
"""

from sqlalchemy import Column, Integer, ForeignKey, String, Boolean, DateTime, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class UserPreferences(Base):
    """User preferences including notifications, privacy, and localization"""
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Notification Preferences
    email_notifications_enabled = Column(Boolean, default=True)
    sms_notifications_enabled = Column(Boolean, default=False)
    in_app_notifications_enabled = Column(Boolean, default=True)

    # Email Frequency
    email_frequency = Column(String(20), default="daily")  # immediately | daily | weekly | never

    # Notification Categories (JSON for flexibility)
    notification_settings = Column(JSON, default={
        "appointment_reminders": True,
        "prescription_updates": True,
        "patient_messages": True,
        "system_alerts": True,
        "financial_reports": True,
        "team_mentions": False,
        "schedule_changes": True
    })

    # Privacy Settings
    show_in_team_directory = Column(Boolean, default=True)
    allow_patient_direct_messaging = Column(Boolean, default=True)
    share_calendar_with_team = Column(Boolean, default=False)

    # Data & Marketing
    data_collection_allowed = Column(Boolean, default=True)
    marketing_emails = Column(Boolean, default=False)
    analytics_tracking = Column(Boolean, default=True)

    # Terms & Policies
    terms_of_service_accepted_at = Column(DateTime(timezone=True), nullable=True)
    privacy_policy_accepted_at = Column(DateTime(timezone=True), nullable=True)
    cookie_policy_accepted_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="user_preferences")


class UserSettings(Base):
    """User display and layout preferences"""
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)

    # Display Preferences
    items_per_page = Column(Integer, default=25)
    sidebar_collapsed = Column(String(50), default="desktop")  # desktop | tablet | mobile
    compact_view = Column(String(50), default="patient_list")

    # Advanced Settings (JSON for flexibility)
    custom_settings = Column(JSON, default={})

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="user_settings")


class UserSession(Base):
    """Active user sessions and connected devices"""
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_token = Column(String(500), unique=True, nullable=False, index=True)

    # Session Info
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    device_name = Column(String(100), nullable=True)
    device_type = Column(String(50), nullable=True)  # desktop | tablet | mobile
    browser = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    is_revoked = Column(Boolean, default=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="user_sessions")


class LoginHistory(Base):
    """Login audit trail"""
    __tablename__ = "login_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    device_type = Column(String(50), nullable=True)  # desktop | tablet | mobile
    browser = Column(String(100), nullable=True)
    location = Column(String(200), nullable=True)

    login_successful = Column(Boolean, default=True)
    failure_reason = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", back_populates="login_history")


class ActivityLog(Base):
    """Audit log for all user actions and settings changes"""
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Activity Details
    action = Column(String(100), nullable=False)  # password_changed, profile_updated, 2fa_enabled, etc
    resource_type = Column(String(100), nullable=True)  # user, preferences, api_key, etc
    resource_id = Column(String(255), nullable=True)

    # Change Details
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)

    # Context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user = relationship("User", back_populates="activity_logs")


class APIKey(Base):
    """API keys for programmatic access"""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Key Details
    name = Column(String(255), nullable=False)
    key_hash = Column(String(255), unique=True, nullable=False)  # Hashed API key
    key_prefix = Column(String(20), nullable=False)  # First 8 chars of key, visible

    # Permissions (JSON)
    permissions = Column(JSON, default=["read"])  # read, write, delete, etc

    # Metadata
    description = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="api_keys")
