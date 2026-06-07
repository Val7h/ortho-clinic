"""
Pydantic schemas for User Settings API

Includes validation for:
- Profile data
- Account settings
- Preferences
- Privacy settings
- API keys
- Activity logs
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, validator
import re


# ========================
# Profile Schemas
# ========================

class ProfileUpdateRequest(BaseModel):
    """Profile update request"""
    name: str = Field(..., min_length=3, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    bio: Optional[str] = Field(None, max_length=500)

    @validator('phone')
    def validate_phone(cls, v):
        if v is None:
            return v
        # Accept Brazilian format or international E.164
        phone_pattern = r'^(\+\d{1,3})?(\d{10,15})$'
        if not re.match(phone_pattern, v.replace('-', '').replace(' ', '')):
            raise ValueError('Invalid phone format')
        return v


class UserProfileResponse(BaseModel):
    """User profile response"""
    id: int
    organization_id: int
    name: str
    email: str
    phone: Optional[str]
    bio: Optional[str]
    profile_picture_url: Optional[str]
    role: str
    is_verified: bool
    language: str
    theme: str
    timezone: str
    currency: str
    last_login_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ========================
# Password & Security Schemas
# ========================

class PasswordChangeRequest(BaseModel):
    """Password change request"""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=12)
    confirm_password: str = Field(..., min_length=12)

    @validator('new_password')
    def validate_password_strength(cls, v):
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*]', v):
            raise ValueError('Password must contain at least one special character')
        return v

    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v


class PasswordChangeResponse(BaseModel):
    """Password change response"""
    message: str
    password_changed_at: datetime


class TwoFactorSetupResponse(BaseModel):
    """2FA setup response"""
    secret: str
    qr_code_url: str
    backup_codes: List[str]
    setup_expires_at: datetime


class TwoFactorVerifyRequest(BaseModel):
    """2FA verify request"""
    totp_code: str = Field(..., min_length=6, max_length=6)

    @validator('totp_code')
    def validate_totp(cls, v):
        if not v.isdigit():
            raise ValueError('TOTP code must contain only digits')
        return v


class TwoFactorDisableRequest(BaseModel):
    """2FA disable request"""
    current_password: str = Field(..., min_length=1)


# ========================
# Session & Login History Schemas
# ========================

class UserSessionResponse(BaseModel):
    """User session response"""
    id: int
    device_name: Optional[str]
    device_type: Optional[str]
    browser: Optional[str]
    ip_address: Optional[str]
    last_activity_at: datetime
    created_at: datetime
    is_current_session: bool = False

    class Config:
        from_attributes = True


class UserSessionsListResponse(BaseModel):
    """List of user sessions"""
    sessions: List[UserSessionResponse]


class LoginHistoryEntry(BaseModel):
    """Login history entry"""
    id: int
    ip_address: Optional[str]
    device_type: Optional[str]
    browser: Optional[str]
    location: Optional[str]
    login_successful: bool
    failure_reason: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class LoginHistoryResponse(BaseModel):
    """Login history response"""
    total: int
    limit: int
    offset: int
    logins: List[LoginHistoryEntry]


# ========================
# Preferences Schemas
# ========================

class NotificationSettingsRequest(BaseModel):
    """Notification settings request"""
    email_notifications_enabled: bool = True
    sms_notifications_enabled: bool = False
    in_app_notifications_enabled: bool = True
    email_frequency: str = Field("daily", regex="^(immediately|daily|weekly|never)$")
    notification_categories: Optional[Dict[str, bool]] = None


class NotificationSettingsResponse(BaseModel):
    """Notification settings response"""
    email_notifications_enabled: bool
    sms_notifications_enabled: bool
    in_app_notifications_enabled: bool
    email_frequency: str
    notification_settings: Dict[str, bool]

    class Config:
        from_attributes = True


class PreferencesUpdateRequest(BaseModel):
    """Preferences update request"""
    language: Optional[str] = Field(None, regex="^(pt-BR|en-US|es-ES)$")
    theme: Optional[str] = Field(None, regex="^(light|dark|auto)$")
    timezone: Optional[str] = None
    currency: Optional[str] = Field(None, regex="^[A-Z]{3}$")
    email_notifications_enabled: Optional[bool] = None
    email_frequency: Optional[str] = Field(None, regex="^(immediately|daily|weekly|never)$")
    notification_settings: Optional[Dict[str, bool]] = None
    show_in_team_directory: Optional[bool] = None
    allow_patient_direct_messaging: Optional[bool] = None


class PreferencesResponse(BaseModel):
    """User preferences response"""
    language: str
    theme: str
    timezone: str
    currency: str
    email_notifications_enabled: bool
    sms_notifications_enabled: bool
    in_app_notifications_enabled: bool
    email_frequency: str
    notification_settings: Dict[str, bool]
    show_in_team_directory: bool
    allow_patient_direct_messaging: bool
    share_calendar_with_team: bool
    data_collection_allowed: bool
    marketing_emails: bool
    analytics_tracking: bool
    terms_of_service_accepted_at: Optional[datetime]
    privacy_policy_accepted_at: Optional[datetime]

    class Config:
        from_attributes = True


# ========================
# Privacy & API Key Schemas
# ========================

class APIKeyCreateRequest(BaseModel):
    """API key creation request"""
    name: str = Field(..., min_length=3, max_length=255)
    permissions: List[str] = Field(..., min_items=1)
    description: Optional[str] = Field(None, max_length=500)
    expires_in_days: Optional[int] = None


class APIKeyResponse(BaseModel):
    """API key response"""
    id: int
    name: str
    key_prefix: str
    permissions: List[str]
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


class APIKeyCreateResponse(BaseModel):
    """API key creation response (with actual key)"""
    id: int
    name: str
    api_key: str
    message: str


class APIKeysListResponse(BaseModel):
    """List of API keys"""
    api_keys: List[APIKeyResponse]


# ========================
# Activity Log Schemas
# ========================

class ActivityLogEntry(BaseModel):
    """Activity log entry"""
    id: int
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    ip_address: Optional[str]
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityLogResponse(BaseModel):
    """Activity log response"""
    total: int
    limit: int
    offset: int
    activities: List[ActivityLogEntry]


# ========================
# Account Deletion Schemas
# ========================

class AccountDeletionRequest(BaseModel):
    """Account deletion request"""
    reason: str = Field(..., min_length=10, max_length=500)
    current_password: str = Field(..., min_length=1)


class AccountDeletionResponse(BaseModel):
    """Account deletion response"""
    deletion_token: str
    message: str


class ConfirmDeletionRequest(BaseModel):
    """Confirm account deletion request"""
    deletion_token: str
    confirm: bool


# ========================
# Terms Acceptance Schemas
# ========================

class AcceptTermsRequest(BaseModel):
    """Accept terms request"""
    terms_type: str = Field(..., regex="^(terms_of_service|privacy_policy|cookie_policy)$")


# ========================
# Error Schemas
# ========================

class ErrorResponse(BaseModel):
    """Error response"""
    detail: str
    error_code: Optional[str] = None
    timestamp: datetime
