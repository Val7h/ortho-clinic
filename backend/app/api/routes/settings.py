"""
User Settings API Routes

Endpoints for:
- Profile management
- Account security (password, 2FA, sessions)
- Preferences (language, theme, notifications)
- Privacy & security (API keys, activity log)
- Account deletion
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
import logging

from database import get_db
from deps import get_current_user
from models.organization import User
from models.user_settings import (
    UserPreferences, UserSettings, UserSession,
    LoginHistory, ActivityLog, APIKey
)
from app.schemas.user_settings import (
    ProfileUpdateRequest, UserProfileResponse,
    PasswordChangeRequest, PasswordChangeResponse,
    TwoFactorSetupResponse, TwoFactorVerifyRequest, TwoFactorDisableRequest,
    UserSessionResponse, UserSessionsListResponse,
    LoginHistoryResponse, LoginHistoryEntry,
    NotificationSettingsRequest, PreferencesUpdateRequest, PreferencesResponse,
    APIKeyCreateRequest, APIKeyResponse, APIKeyCreateResponse, APIKeysListResponse,
    ActivityLogResponse, ActivityLogEntry,
    AccountDeletionRequest, AccountDeletionResponse,
    ConfirmDeletionRequest, AcceptTermsRequest,
    ErrorResponse
)
from app.services.password_service import hash_password, verify_password, validate_password_strength
from app.services.totp_service import generate_totp_secret, verify_totp, generate_backup_codes
from app.services.activity_service import log_activity
from app.services.api_key_service import generate_api_key, hash_api_key
from app.services.device_service import detect_device, detect_browser

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/users/me",
    tags=["settings"],
    dependencies=[Depends(get_current_user)]
)


# ========================
# Profile Endpoints
# ========================

@router.get("", response_model=UserProfileResponse)
async def get_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user profile"""
    return current_user


@router.put("/profile", response_model=UserProfileResponse)
async def update_user_profile(
    request_data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Update user profile"""
    old_values = {
        "name": current_user.name,
        "phone": current_user.phone,
        "bio": current_user.bio
    }

    current_user.name = request_data.name
    current_user.phone = request_data.phone
    current_user.bio = request_data.bio
    current_user.updated_at = datetime.utcnow()

    # Log activity
    log_activity(
        db=db,
        user_id=current_user.id,
        action="profile_updated",
        resource_type="user",
        old_value=old_values,
        new_value=request_data.dict(),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return current_user


@router.post("/profile-picture")
async def upload_profile_picture(
    file: bytes,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Upload profile picture"""
    # TODO: Implement file upload to S3/CDN
    # - Validate file size (max 5MB)
    # - Validate file type (JPEG, PNG, WebP)
    # - Resize to 500x500
    # - Store in CDN

    profile_picture_url = "https://cdn.orthoclinic.com/profiles/placeholder.jpg"

    current_user.profile_picture_url = profile_picture_url

    log_activity(
        db=db,
        user_id=current_user.id,
        action="profile_picture_uploaded",
        resource_type="user",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(current_user)
    db.commit()

    return {
        "profile_picture_url": profile_picture_url,
        "message": "Profile picture updated successfully"
    }


@router.delete("/profile-picture")
async def delete_profile_picture(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Delete profile picture"""
    current_user.profile_picture_url = None

    log_activity(
        db=db,
        user_id=current_user.id,
        action="profile_picture_deleted",
        resource_type="user",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(current_user)
    db.commit()

    return {"message": "Profile picture deleted"}


# ========================
# Password & Security Endpoints
# ========================

@router.post("/password", response_model=PasswordChangeResponse)
async def change_password(
    request_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Change user password"""
    # Verify current password
    if not verify_password(request_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    # Validate new password strength
    validate_password_strength(request_data.new_password)

    # Update password
    current_user.password_hash = hash_password(request_data.new_password)
    current_user.password_changed_at = datetime.utcnow()

    # Log activity
    log_activity(
        db=db,
        user_id=current_user.id,
        action="password_changed",
        resource_type="user",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        description="Password changed via settings page"
    )

    db.add(current_user)
    db.commit()

    # TODO: Invalidate all other sessions
    # TODO: Send email confirmation

    return {
        "message": "Password changed successfully",
        "password_changed_at": current_user.password_changed_at
    }


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Setup 2FA (TOTP)"""
    if current_user.is_two_fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled for this account"
        )

    # Generate TOTP secret
    secret, qr_code_url = generate_totp_secret(
        user_email=current_user.email,
        issuer_name="OrthoClinic"
    )

    # Generate backup codes
    backup_codes = generate_backup_codes(count=10)

    # Store secret temporarily (not activated yet)
    current_user.two_fa_secret = secret
    db.add(current_user)
    db.commit()

    return {
        "secret": secret,
        "qr_code_url": qr_code_url,
        "backup_codes": backup_codes,
        "setup_expires_at": datetime.utcnow() + timedelta(minutes=15)
    }


@router.post("/2fa/verify")
async def verify_2fa(
    request_data: TwoFactorVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Verify and enable 2FA"""
    if not current_user.two_fa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup not initiated"
        )

    # Verify TOTP code
    if not verify_totp(current_user.two_fa_secret, request_data.totp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code"
        )

    # Enable 2FA
    current_user.is_two_fa_enabled = True

    log_activity(
        db=db,
        user_id=current_user.id,
        action="2fa_enabled",
        resource_type="user",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(current_user)
    db.commit()

    return {
        "is_two_fa_enabled": True,
        "message": "2FA enabled successfully"
    }


@router.delete("/2fa")
async def disable_2fa(
    request_data: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Disable 2FA"""
    # Verify password
    if not verify_password(request_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    current_user.is_two_fa_enabled = False
    current_user.two_fa_secret = None

    log_activity(
        db=db,
        user_id=current_user.id,
        action="2fa_disabled",
        resource_type="user",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(current_user)
    db.commit()

    return {"message": "2FA disabled"}


# ========================
# Session & Login History Endpoints
# ========================

@router.get("/sessions", response_model=UserSessionsListResponse)
async def get_user_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Get all active sessions (connected devices)"""
    sessions = db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_active == True,
        UserSession.is_revoked == False
    ).all()

    current_session_token = request.headers.get("x-session-token", "")

    session_responses = []
    for session in sessions:
        response = UserSessionResponse.from_orm(session)
        response.is_current_session = session.session_token == current_session_token
        session_responses.append(response)

    return {"sessions": session_responses}


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Revoke a specific session"""
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    session.is_revoked = True
    session.revoked_at = datetime.utcnow()

    log_activity(
        db=db,
        user_id=current_user.id,
        action="session_revoked",
        resource_type="session",
        resource_id=str(session_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(session)
    db.commit()

    return {"message": "Session revoked"}


@router.post("/sessions/revoke-all-others")
async def revoke_all_other_sessions(
    request_data: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Revoke all other sessions"""
    # Verify password
    if not verify_password(request_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    current_session_token = request.headers.get("x-session-token", "")

    sessions = db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_active == True,
        UserSession.is_revoked == False,
        UserSession.session_token != current_session_token
    ).all()

    for session in sessions:
        session.is_revoked = True
        session.revoked_at = datetime.utcnow()

        log_activity(
            db=db,
            user_id=current_user.id,
            action="session_revoked",
            resource_type="session",
            resource_id=str(session.id),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            description="Revoked via revoke-all-others endpoint"
        )
        db.add(session)

    db.commit()

    return {"message": f"Revoked {len(sessions)} sessions"}


@router.get("/login-history", response_model=LoginHistoryResponse)
async def get_login_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0)
):
    """Get login history"""
    query = db.query(LoginHistory).filter(
        LoginHistory.user_id == current_user.id
    ).order_by(LoginHistory.created_at.desc())

    total = query.count()
    logins = query.limit(limit).offset(offset).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "logins": [LoginHistoryEntry.from_orm(login) for login in logins]
    }


# ========================
# Preferences Endpoints
# ========================

@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user preferences"""
    prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        # Create default preferences
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return prefs


@router.put("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    request_data: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Update user preferences"""
    prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)

    old_values = {}
    new_values = {}

    # Update fields
    if request_data.language is not None:
        old_values["language"] = current_user.language
        current_user.language = request_data.language
        new_values["language"] = request_data.language

    if request_data.theme is not None:
        old_values["theme"] = current_user.theme
        current_user.theme = request_data.theme
        new_values["theme"] = request_data.theme

    if request_data.timezone is not None:
        old_values["timezone"] = current_user.timezone
        current_user.timezone = request_data.timezone
        new_values["timezone"] = request_data.timezone

    if request_data.currency is not None:
        old_values["currency"] = current_user.currency
        current_user.currency = request_data.currency
        new_values["currency"] = request_data.currency

    if request_data.email_notifications_enabled is not None:
        old_values["email_notifications"] = prefs.email_notifications_enabled
        prefs.email_notifications_enabled = request_data.email_notifications_enabled
        new_values["email_notifications"] = request_data.email_notifications_enabled

    if request_data.email_frequency is not None:
        old_values["email_frequency"] = prefs.email_frequency
        prefs.email_frequency = request_data.email_frequency
        new_values["email_frequency"] = request_data.email_frequency

    if request_data.notification_settings is not None:
        old_values["notification_settings"] = prefs.notification_settings
        prefs.notification_settings = request_data.notification_settings
        new_values["notification_settings"] = request_data.notification_settings

    if request_data.show_in_team_directory is not None:
        old_values["show_in_team_directory"] = prefs.show_in_team_directory
        prefs.show_in_team_directory = request_data.show_in_team_directory
        new_values["show_in_team_directory"] = request_data.show_in_team_directory

    prefs.updated_at = datetime.utcnow()
    current_user.updated_at = datetime.utcnow()

    log_activity(
        db=db,
        user_id=current_user.id,
        action="preferences_updated",
        resource_type="user_preferences",
        old_value=old_values or None,
        new_value=new_values or None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(current_user)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)

    return prefs


@router.put("/preferences/notifications")
async def update_notification_preferences(
    request_data: NotificationSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Update notification preferences"""
    prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)

    old_values = {
        "email_notifications": prefs.email_notifications_enabled,
        "sms_notifications": prefs.sms_notifications_enabled,
        "in_app_notifications": prefs.in_app_notifications_enabled,
        "email_frequency": prefs.email_frequency,
        "notification_settings": prefs.notification_settings
    }

    prefs.email_notifications_enabled = request_data.email_notifications_enabled
    prefs.sms_notifications_enabled = request_data.sms_notifications_enabled
    prefs.in_app_notifications_enabled = request_data.in_app_notifications_enabled
    prefs.email_frequency = request_data.email_frequency

    if request_data.notification_categories:
        prefs.notification_settings = request_data.notification_categories

    log_activity(
        db=db,
        user_id=current_user.id,
        action="notification_preferences_updated",
        resource_type="user_preferences",
        old_value=old_values,
        new_value={
            "email_notifications": prefs.email_notifications_enabled,
            "sms_notifications": prefs.sms_notifications_enabled,
            "in_app_notifications": prefs.in_app_notifications_enabled,
            "email_frequency": prefs.email_frequency,
            "notification_settings": prefs.notification_settings
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(prefs)
    db.commit()
    db.refresh(prefs)

    return prefs


# ========================
# Privacy Settings Endpoints
# ========================

@router.get("/privacy", response_model=dict)
async def get_privacy_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user privacy settings"""
    prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        # Create default preferences
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return {
        "data_collection_allowed": prefs.data_collection_allowed if hasattr(prefs, 'data_collection_allowed') else True,
        "marketing_emails": prefs.marketing_emails if hasattr(prefs, 'marketing_emails') else False,
        "analytics_tracking": prefs.analytics_tracking if hasattr(prefs, 'analytics_tracking') else True,
        "allow_patient_direct_messaging": prefs.allow_patient_direct_messaging if hasattr(prefs, 'allow_patient_direct_messaging') else True,
        "share_calendar_with_team": prefs.share_calendar_with_team if hasattr(prefs, 'share_calendar_with_team') else False,
        "terms_of_service_accepted_at": prefs.terms_of_service_accepted_at,
        "privacy_policy_accepted_at": prefs.privacy_policy_accepted_at,
        "cookie_policy_accepted_at": prefs.cookie_policy_accepted_at
    }


@router.put("/privacy")
async def update_privacy_settings(
    request_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Update user privacy settings"""
    prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)

    old_values = {}
    new_values = {}

    # Update privacy-related fields
    if "data_collection_allowed" in request_data:
        if hasattr(prefs, 'data_collection_allowed'):
            old_values["data_collection_allowed"] = prefs.data_collection_allowed
            prefs.data_collection_allowed = request_data["data_collection_allowed"]
            new_values["data_collection_allowed"] = request_data["data_collection_allowed"]

    if "marketing_emails" in request_data:
        if hasattr(prefs, 'marketing_emails'):
            old_values["marketing_emails"] = prefs.marketing_emails
            prefs.marketing_emails = request_data["marketing_emails"]
            new_values["marketing_emails"] = request_data["marketing_emails"]

    if "analytics_tracking" in request_data:
        if hasattr(prefs, 'analytics_tracking'):
            old_values["analytics_tracking"] = prefs.analytics_tracking
            prefs.analytics_tracking = request_data["analytics_tracking"]
            new_values["analytics_tracking"] = request_data["analytics_tracking"]

    if "allow_patient_direct_messaging" in request_data:
        if hasattr(prefs, 'allow_patient_direct_messaging'):
            old_values["allow_patient_direct_messaging"] = prefs.allow_patient_direct_messaging
            prefs.allow_patient_direct_messaging = request_data["allow_patient_direct_messaging"]
            new_values["allow_patient_direct_messaging"] = request_data["allow_patient_direct_messaging"]

    if "share_calendar_with_team" in request_data:
        if hasattr(prefs, 'share_calendar_with_team'):
            old_values["share_calendar_with_team"] = prefs.share_calendar_with_team
            prefs.share_calendar_with_team = request_data["share_calendar_with_team"]
            new_values["share_calendar_with_team"] = request_data["share_calendar_with_team"]

    prefs.updated_at = datetime.utcnow()

    log_activity(
        db=db,
        user_id=current_user.id,
        action="privacy_settings_updated",
        resource_type="user_preferences",
        old_value=old_values or None,
        new_value=new_values or None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(prefs)
    db.commit()
    db.refresh(prefs)

    return {
        "message": "Privacy settings updated",
        "data_collection_allowed": getattr(prefs, 'data_collection_allowed', True),
        "marketing_emails": getattr(prefs, 'marketing_emails', False),
        "analytics_tracking": getattr(prefs, 'analytics_tracking', True),
        "allow_patient_direct_messaging": getattr(prefs, 'allow_patient_direct_messaging', True),
        "share_calendar_with_team": getattr(prefs, 'share_calendar_with_team', False)
    }


# ========================
# Privacy & API Key Endpoints
# ========================

@router.get("/api-keys", response_model=APIKeysListResponse)
async def get_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user API keys"""
    api_keys = db.query(APIKey).filter(
        APIKey.user_id == current_user.id
    ).all()

    return {"api_keys": [APIKeyResponse.from_orm(key) for key in api_keys]}


@router.post("/api-keys", response_model=APIKeyCreateResponse)
async def create_api_key(
    request_data: APIKeyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Create a new API key"""
    api_key_value = generate_api_key()
    key_hash = hash_api_key(api_key_value)
    key_prefix = api_key_value[:8]

    api_key = APIKey(
        user_id=current_user.id,
        name=request_data.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        permissions=request_data.permissions,
        description=request_data.description
    )

    if request_data.expires_in_days:
        api_key.expires_at = datetime.utcnow() + timedelta(days=request_data.expires_in_days)

    log_activity(
        db=db,
        user_id=current_user.id,
        action="api_key_created",
        resource_type="api_key",
        new_value={"name": request_data.name, "permissions": request_data.permissions},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {
        "id": api_key.id,
        "name": api_key.name,
        "api_key": api_key_value,
        "message": "Save this API key securely. You won't be able to see it again."
    }


@router.delete("/api-keys/{api_key_id}")
async def delete_api_key(
    api_key_id: int,
    request_data: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Revoke an API key"""
    # Verify password
    if not verify_password(request_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    api_key = db.query(APIKey).filter(
        APIKey.id == api_key_id,
        APIKey.user_id == current_user.id
    ).first()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )

    api_key.is_active = False
    api_key.revoked_at = datetime.utcnow()

    log_activity(
        db=db,
        user_id=current_user.id,
        action="api_key_revoked",
        resource_type="api_key",
        resource_id=str(api_key_id),
        old_value={"is_active": True},
        new_value={"is_active": False},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(api_key)
    db.commit()

    return {"message": "API key revoked"}


# ========================
# Activity Log & Privacy Endpoints
# ========================

@router.get("/activity-log", response_model=ActivityLogResponse)
async def get_activity_log(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    action: str = Query(None)
):
    """Get user activity log"""
    query = db.query(ActivityLog).filter(
        ActivityLog.user_id == current_user.id
    )

    if action:
        query = query.filter(ActivityLog.action == action)

    query = query.order_by(ActivityLog.created_at.desc())

    total = query.count()
    activities = query.limit(limit).offset(offset).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "activities": [ActivityLogEntry.from_orm(activity) for activity in activities]
    }


@router.post("/accept-terms")
async def accept_terms(
    request_data: AcceptTermsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Accept terms and policies"""
    prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()

    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)

    if request_data.terms_type == "terms_of_service":
        prefs.terms_of_service_accepted_at = datetime.utcnow()
    elif request_data.terms_type == "privacy_policy":
        prefs.privacy_policy_accepted_at = datetime.utcnow()
    elif request_data.terms_type == "cookie_policy":
        prefs.cookie_policy_accepted_at = datetime.utcnow()

    log_activity(
        db=db,
        user_id=current_user.id,
        action=f"{request_data.terms_type}_accepted",
        resource_type="user_preferences",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    db.add(prefs)
    db.commit()

    return {"message": f"{request_data.terms_type} accepted"}


# ========================
# Account Deletion Endpoints
# ========================

@router.post("/deletion-request", response_model=AccountDeletionResponse)
async def request_account_deletion(
    request_data: AccountDeletionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Request account deletion (30-day grace period)"""
    # Verify password
    if not verify_password(request_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    # TODO: Generate deletion token
    # TODO: Send verification email
    # TODO: Store deletion request with expiry
    deletion_token = "del_xxxxx"

    log_activity(
        db=db,
        user_id=current_user.id,
        action="deletion_requested",
        resource_type="user",
        new_value={"reason": request_data.reason},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        description="Account deletion requested"
    )

    return {
        "deletion_token": deletion_token,
        "message": "Confirmation email sent. Account will be deleted in 30 days."
    }


@router.post("/confirm-deletion")
async def confirm_account_deletion(
    request_data: ConfirmDeletionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = Depends()
):
    """Confirm account deletion"""
    if not request_data.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deletion must be confirmed"
        )

    # TODO: Verify deletion token
    # TODO: Delete user and all related data
    # TODO: Send confirmation email

    log_activity(
        db=db,
        user_id=current_user.id,
        action="account_deleted",
        resource_type="user",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        description="Account permanently deleted"
    )

    return {"message": "Account deletion confirmed"}
