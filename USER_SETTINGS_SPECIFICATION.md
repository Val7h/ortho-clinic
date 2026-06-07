# ORTHOCLINIC User Settings Page - Comprehensive Specification

**Document Version:** 1.0  
**Date:** 2026-06-07  
**Status:** Ready for Implementation  
**Timeline:** 5 days  

---

## Table of Contents
1. [Executive Overview](#executive-overview)
2. [Data Models](#data-models)
3. [API Endpoints](#api-endpoints)
4. [Frontend Component Structure](#frontend-component-structure)
5. [Form Validation Schema](#form-validation-schema)
6. [Security Considerations](#security-considerations)
7. [Notification Preferences Flow](#notification-preferences-flow)
8. [Testing Plan](#testing-plan)
9. [Implementation Checklist](#implementation-checklist)

---

## Executive Overview

The User Settings Page enables ORTHOCLINIC users (doctors, secretaries, admins) to manage their profile, account security, preferences, and system integrations. This feature supports PT-BR localization, mobile-responsive design, and enterprise-grade security.

### Key Features
- **Profile Management**: Edit personal info, upload profile picture, manage verification status
- **Account Security**: Password changes, 2FA setup, device management, login history
- **Preferences**: Language, theme, timezone, notifications, email frequency
- **Privacy & Security**: Data handling, API keys, activity logs, policy acceptance
- **Audit Trail**: All changes logged with timestamp and IP address

---

## Data Models

### 1. Enhanced User Model

```python
# backend/models/organization.py - UPDATE

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

class User(Base):
    __tablename__ = "users"

    # Primary & Organization
    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    
    # Identity
    name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=True)
    bio = Column(Text, nullable=True)
    profile_picture_url = Column(String(500), nullable=True)
    
    # Authentication
    password_hash = Column(String(255), nullable=False)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Role & Permissions
    role = Column(String(20), default="secretary")  # superadmin | admin | doctor | secretary
    is_verified = Column(Boolean, default=False)
    is_two_fa_enabled = Column(Boolean, default=False)
    two_fa_secret = Column(String(255), nullable=True)  # TOTP secret
    
    # Preferences
    language = Column(String(5), default="pt-BR")  # pt-BR, en-US, es-ES
    theme = Column(String(10), default="light")  # light | dark | auto
    timezone = Column(String(50), default="America/Sao_Paulo")
    currency = Column(String(3), default="BRL")
    
    # Account Status
    active = Column(Boolean, default=True)
    is_suspended = Column(Boolean, default=False)
    suspension_reason = Column(Text, nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    
    # Relationships
    organization = relationship("Organization", back_populates="users")
    user_sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    user_preferences = relationship("UserPreferences", back_populates="user", cascade="all, delete-orphan", uselist=False)
    user_settings = relationship("UserSettings", back_populates="user", cascade="all, delete-orphan", uselist=False)
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")
    login_history = relationship("LoginHistory", back_populates="user", cascade="all, delete-orphan")
```

### 2. UserPreferences Model

```python
# backend/models/user_preferences.py - NEW

from sqlalchemy import Column, Integer, ForeignKey, Boolean, String, JSON, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class UserPreferences(Base):
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
    
    user = relationship("User", back_populates="user_preferences")
```

### 3. UserSettings Model

```python
# backend/models/user_settings.py - NEW

from sqlalchemy import Column, Integer, ForeignKey, String, JSON, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Display Preferences
    items_per_page = Column(Integer, default=25)
    sidebar_collapsed = Column(String(50), default="desktop")  # desktop | tablet | mobile
    compact_view = Column(String(50), default="patient_list")
    
    # Advanced Settings (JSON)
    custom_settings = Column(JSON, default={})
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("User", back_populates="user_settings")
```

### 4. UserSession Model

```python
# backend/models/user_session.py - NEW

from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

class UserSession(Base):
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
    
    user = relationship("User", back_populates="user_sessions")
```

### 5. LoginHistory Model

```python
# backend/models/login_history.py - NEW

from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class LoginHistory(Base):
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
    
    user = relationship("User", back_populates="login_history")
```

### 6. ActivityLog Model

```python
# backend/models/activity_log.py - NEW

from sqlalchemy import Column, Integer, ForeignKey, String, Text, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Activity Details
    action = Column(String(100), nullable=False)  # profile_updated, password_changed, 2fa_enabled, etc
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
    
    user = relationship("User", back_populates="activity_logs")
```

### 7. APIKey Model

```python
# backend/models/api_key.py - NEW

from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

class APIKey(Base):
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
    
    user = relationship("User", back_populates="api_keys")
```

---

## API Endpoints

### Base URL
```
/api/v1/users/me/settings
```

### Authentication
All endpoints require JWT token in `Authorization: Bearer {token}` header.

---

### Profile Endpoints

#### 1. Get User Profile
```
GET /api/v1/users/me
```

**Response:**
```json
{
  "id": 1,
  "organization_id": 1,
  "name": "Dr. João Silva",
  "email": "joao@clinic.com",
  "phone": "+55 11 98765-4321",
  "bio": "Orthodontist specializing in clear aligners",
  "profile_picture_url": "https://cdn.orthoclinic.com/profiles/user1.jpg",
  "role": "doctor",
  "is_verified": true,
  "language": "pt-BR",
  "theme": "light",
  "timezone": "America/Sao_Paulo",
  "currency": "BRL",
  "last_login_at": "2026-06-07T10:30:00Z",
  "created_at": "2025-01-15T08:00:00Z"
}
```

#### 2. Update User Profile
```
PUT /api/v1/users/me/profile
Content-Type: application/json

{
  "name": "Dr. João Silva",
  "phone": "+55 11 98765-4321",
  "bio": "Orthodontist specializing in clear aligners"
}
```

**Response:** `200 OK` with updated user object

**Validation:**
- `name`: 3-200 characters, required
- `phone`: Valid Brazilian format or international E.164
- `bio`: 0-500 characters

#### 3. Upload Profile Picture
```
POST /api/v1/users/me/profile-picture
Content-Type: multipart/form-data

{
  "file": <binary>
}
```

**Response:**
```json
{
  "profile_picture_url": "https://cdn.orthoclinic.com/profiles/user1.jpg",
  "message": "Profile picture updated successfully"
}
```

**Validation:**
- File size: Max 5MB
- Formats: JPEG, PNG, WebP
- Dimensions: Min 100x100, Max 4000x4000 (auto-resize to 500x500)

#### 4. Delete Profile Picture
```
DELETE /api/v1/users/me/profile-picture
```

**Response:** `204 No Content`

---

### Account Security Endpoints

#### 5. Change Password
```
POST /api/v1/users/me/password
Content-Type: application/json

{
  "current_password": "SecurePass123!",
  "new_password": "NewSecurePass456!",
  "confirm_password": "NewSecurePass456!"
}
```

**Response:**
```json
{
  "message": "Password changed successfully",
  "password_changed_at": "2026-06-07T11:00:00Z"
}
```

**Validation:**
- `current_password`: Must match stored hash
- `new_password`: 
  - Min 12 characters
  - At least 1 uppercase, 1 lowercase, 1 digit, 1 special character
  - Cannot be same as current password
  - Cannot contain email or name

**Security:**
- Log activity as "password_changed"
- Invalidate all other sessions
- Send email confirmation
- Require re-authentication

#### 6. Setup 2FA (TOTP)
```
POST /api/v1/users/me/2fa/setup
Content-Type: application/json
```

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qr_code_url": "https://api.orthoclinic.com/qr/user1",
  "backup_codes": [
    "12345678",
    "23456789",
    ...
  ],
  "setup_expires_at": "2026-06-07T11:15:00Z"
}
```

#### 7. Verify 2FA Setup
```
POST /api/v1/users/me/2fa/verify
Content-Type: application/json

{
  "totp_code": "123456"
}
```

**Response:**
```json
{
  "is_two_fa_enabled": true,
  "message": "2FA enabled successfully"
}
```

#### 8. Disable 2FA
```
DELETE /api/v1/users/me/2fa
Content-Type: application/json

{
  "current_password": "SecurePass123!"
}
```

**Response:** `204 No Content`

#### 9. Get Connected Devices (Sessions)
```
GET /api/v1/users/me/sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "id": 1,
      "device_name": "Chrome on Windows",
      "device_type": "desktop",
      "browser": "Chrome 126",
      "ip_address": "192.168.1.1",
      "last_activity_at": "2026-06-07T11:00:00Z",
      "created_at": "2026-06-05T09:00:00Z",
      "is_current_session": true
    }
  ]
}
```

#### 10. Revoke Device Session
```
DELETE /api/v1/users/me/sessions/{session_id}
```

**Response:** `204 No Content`

#### 11. Revoke All Other Sessions
```
POST /api/v1/users/me/sessions/revoke-all-others
Content-Type: application/json

{
  "current_password": "SecurePass123!"
}
```

**Response:** `204 No Content`

#### 12. Get Login History
```
GET /api/v1/users/me/login-history?limit=20&offset=0
```

**Response:**
```json
{
  "total": 42,
  "limit": 20,
  "offset": 0,
  "logins": [
    {
      "id": 1,
      "ip_address": "192.168.1.1",
      "device_type": "desktop",
      "browser": "Chrome 126",
      "location": "São Paulo, Brazil",
      "login_successful": true,
      "created_at": "2026-06-07T10:30:00Z"
    }
  ]
}
```

---

### Preferences Endpoints

#### 13. Get Preferences
```
GET /api/v1/users/me/preferences
```

**Response:**
```json
{
  "language": "pt-BR",
  "theme": "light",
  "timezone": "America/Sao_Paulo",
  "currency": "BRL",
  "email_notifications_enabled": true,
  "sms_notifications_enabled": false,
  "in_app_notifications_enabled": true,
  "email_frequency": "daily",
  "notification_settings": {
    "appointment_reminders": true,
    "prescription_updates": true,
    "patient_messages": true,
    "system_alerts": true,
    "financial_reports": true,
    "team_mentions": false,
    "schedule_changes": true
  },
  "show_in_team_directory": true,
  "allow_patient_direct_messaging": true,
  "share_calendar_with_team": false,
  "data_collection_allowed": true,
  "marketing_emails": false,
  "analytics_tracking": true,
  "terms_of_service_accepted_at": "2025-01-15T08:00:00Z",
  "privacy_policy_accepted_at": "2025-01-15T08:00:00Z"
}
```

#### 14. Update Preferences
```
PUT /api/v1/users/me/preferences
Content-Type: application/json

{
  "language": "pt-BR",
  "theme": "dark",
  "timezone": "America/Sao_Paulo",
  "currency": "BRL",
  "email_notifications_enabled": true,
  "email_frequency": "weekly",
  "notification_settings": {
    "appointment_reminders": true,
    "prescription_updates": false,
    "patient_messages": true
  },
  "show_in_team_directory": true
}
```

**Response:** `200 OK` with updated preferences

#### 15. Update Notification Settings
```
PUT /api/v1/users/me/preferences/notifications
Content-Type: application/json

{
  "email_notifications_enabled": true,
  "sms_notifications_enabled": true,
  "in_app_notifications_enabled": true,
  "email_frequency": "daily",
  "notification_categories": {
    "appointment_reminders": true,
    "prescription_updates": true,
    "patient_messages": true,
    "system_alerts": true,
    "financial_reports": false
  }
}
```

**Response:** `200 OK`

---

### Privacy & Security Endpoints

#### 16. Accept Terms
```
POST /api/v1/users/me/accept-terms
Content-Type: application/json

{
  "terms_type": "terms_of_service"
}
```

**Response:** `200 OK`

#### 17. Get API Keys
```
GET /api/v1/users/me/api-keys
```

**Response:**
```json
{
  "api_keys": [
    {
      "id": 1,
      "name": "Mobile App Integration",
      "key_prefix": "sk_live_3QJv",
      "permissions": ["read", "write"],
      "created_at": "2026-05-01T10:00:00Z",
      "last_used_at": "2026-06-07T09:30:00Z",
      "expires_at": null,
      "is_active": true
    }
  ]
}
```

#### 18. Create API Key
```
POST /api/v1/users/me/api-keys
Content-Type: application/json

{
  "name": "Mobile App Integration",
  "permissions": ["read", "write"],
  "description": "API key for mobile app",
  "expires_in_days": 365
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Mobile App Integration",
  "api_key": "sk_live_3QJvEXAMPLETOKEN123456",
  "message": "Save this API key securely. You won't be able to see it again."
}
```

#### 19. Revoke API Key
```
DELETE /api/v1/users/me/api-keys/{api_key_id}
Content-Type: application/json

{
  "current_password": "SecurePass123!"
}
```

**Response:** `204 No Content`

#### 20. Get Activity Log
```
GET /api/v1/users/me/activity-log?limit=50&offset=0&action=password_changed
```

**Response:**
```json
{
  "total": 127,
  "limit": 50,
  "offset": 0,
  "activities": [
    {
      "id": 1,
      "action": "password_changed",
      "resource_type": "user",
      "ip_address": "192.168.1.1",
      "description": "Password changed via settings page",
      "created_at": "2026-06-07T11:00:00Z"
    }
  ]
}
```

---

### Account Deletion Endpoint

#### 21. Request Account Deletion
```
POST /api/v1/users/me/deletion-request
Content-Type: application/json

{
  "reason": "Closing my clinic",
  "current_password": "SecurePass123!"
}
```

**Response:**
```json
{
  "deletion_token": "del_xxxxx",
  "message": "Confirmation email sent. Account will be deleted in 30 days."
}
```

#### 22. Confirm Account Deletion
```
POST /api/v1/users/me/confirm-deletion
Content-Type: application/json

{
  "deletion_token": "del_xxxxx",
  "confirm": true
}
```

**Response:** `204 No Content` + logout user

---

## Frontend Component Structure

```
frontend/
├── app/
│   └── settings/
│       ├── page.tsx                    # Settings page layout
│       ├── layout.tsx                  # Settings layout wrapper
│       ├── profile/page.tsx            # Profile tab
│       ├── account/page.tsx            # Account security tab
│       ├── preferences/page.tsx        # Preferences tab
│       └── privacy/page.tsx            # Privacy & security tab
│
├── components/
│   └── Settings/
│       ├── SettingsLayout.tsx          # Main layout with tabs
│       ├── SettingsTabs.tsx            # Tab navigation
│       ├── SettingsSidebar.tsx         # Mobile sidebar menu
│       │
│       ├── Profile/
│       │   ├── ProfileSection.tsx
│       │   ├── ProfileForm.tsx
│       │   ├── ProfilePictureUpload.tsx
│       │   ├── VerificationStatus.tsx
│       │   └── ProfileFormSchema.ts
│       │
│       ├── Account/
│       │   ├── AccountSection.tsx
│       │   ├── PasswordChangeForm.tsx
│       │   ├── TwoFactorAuth.tsx
│       │   ├── ConnectedDevices.tsx
│       │   ├── LoginHistory.tsx
│       │   ├── AccountDeletion.tsx
│       │   ├── TwoFactorSetup.tsx
│       │   ├── TwoFactorVerify.tsx
│       │   ├── AccountFormSchema.ts
│       │   └── usePasswordStrength.ts
│       │
│       ├── Preferences/
│       │   ├── PreferencesSection.tsx
│       │   ├── LocaleSettings.tsx
│       │   ├── ThemeSettings.tsx
│       │   ├── NotificationPreferences.tsx
│       │   ├── NotificationCategories.tsx
│       │   ├── PreferencesFormSchema.ts
│       │   └── useTimezoneSelect.ts
│       │
│       ├── Privacy/
│       │   ├── PrivacySection.tsx
│       │   ├── APIKeyManager.tsx
│       │   ├── ActivityLog.tsx
│       │   ├── PrivacySettings.tsx
│       │   ├── TermsAcceptance.tsx
│       │   ├── CreateAPIKeyModal.tsx
│       │   └── PrivacyFormSchema.ts
│       │
│       └── Common/
│           ├── SettingsCard.tsx
│           ├── FormSection.tsx
│           ├── SettingsSkeleton.tsx
│           ├── ConfirmationModal.tsx
│           └── SuccessNotification.tsx
│
├── hooks/
│   ├── useUserSettings.ts
│   ├── useProfileSettings.ts
│   ├── useAccountSettings.ts
│   ├── usePreferencesSettings.ts
│   ├── usePrivacySettings.ts
│   ├── useTwoFactorAuth.ts
│   ├── useAPIKeys.ts
│   └── useActivityLog.ts
│
├── lib/
│   ├── settings/
│   │   ├── api.ts                      # API client functions
│   │   ├── validation.ts               # Validation schemas
│   │   ├── formatters.ts               # Data formatting utilities
│   │   └── constants.ts                # Settings constants
│   │
│   └── security/
│       ├── passwordValidation.ts
│       ├── encryption.ts
│       └── deviceDetection.ts
│
├── store/
│   └── settingsStore.ts                # Zustand store for settings
│
└── types/
    └── settings.ts                     # TypeScript types
```

---

## Form Validation Schema

### Using Zod (Recommended)

```typescript
// frontend/lib/settings/validation.ts

import { z } from "zod";

// Profile Validation
export const profileFormSchema = z.object({
  name: z
    .string()
    .min(3, { message: "Nome deve ter pelo menos 3 caracteres" })
    .max(200, { message: "Nome não pode exceder 200 caracteres" }),
  phone: z
    .string()
    .optional()
    .refine((val) => !val || /^(\+55|0)?(\d{2})(\d{8,9})$/.test(val?.replace(/\D/g, "")), {
      message: "Formato de telefone inválido",
    }),
  bio: z
    .string()
    .max(500, { message: "Bio não pode exceder 500 caracteres" })
    .optional(),
});

// Password Validation
export const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, { message: "Senha atual é obrigatória" }),
  newPassword: z
    .string()
    .min(12, { message: "Nova senha deve ter pelo menos 12 caracteres" })
    .regex(/[A-Z]/, { message: "Deve conter pelo menos uma letra maiúscula" })
    .regex(/[a-z]/, { message: "Deve conter pelo menos uma letra minúscula" })
    .regex(/[0-9]/, { message: "Deve conter pelo menos um número" })
    .regex(/[!@#$%^&*]/, { message: "Deve conter pelo menos um caractere especial" }),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Senhas não correspondem",
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "Nova senha não pode ser igual à senha atual",
  path: ["newPassword"],
});

// Preferences Validation
export const preferencesFormSchema = z.object({
  language: z.enum(["pt-BR", "en-US", "es-ES"]),
  theme: z.enum(["light", "dark", "auto"]),
  timezone: z.string().min(1, { message: "Timezone é obrigatório" }),
  currency: z.enum(["BRL", "USD", "EUR"]),
  emailNotificationsEnabled: z.boolean(),
  emailFrequency: z.enum(["immediately", "daily", "weekly", "never"]),
  notificationCategories: z.record(z.boolean()).optional(),
});

// 2FA Verification
export const twoFactorVerifySchema = z.object({
  totpCode: z
    .string()
    .length(6, { message: "Código deve ter 6 dígitos" })
    .regex(/^\d{6}$/, { message: "Código deve conter apenas números" }),
});

// API Key Creation
export const apiKeyFormSchema = z.object({
  name: z
    .string()
    .min(3, { message: "Nome deve ter pelo menos 3 caracteres" })
    .max(255, { message: "Nome não pode exceder 255 caracteres" }),
  permissions: z.array(z.string()).min(1, { message: "Selecione pelo menos uma permissão" }),
  description: z.string().max(500).optional(),
  expiresInDays: z.number().positive().optional(),
});

// Account Deletion
export const accountDeletionSchema = z.object({
  currentPassword: z.string().min(1, { message: "Senha é obrigatória" }),
  reason: z
    .string()
    .min(10, { message: "Motivo deve ter pelo menos 10 caracteres" })
    .max(500, { message: "Motivo não pode exceder 500 caracteres" }),
  confirm: z.boolean().refine((val) => val === true, {
    message: "Você deve confirmar a exclusão",
  }),
});
```

---

## Security Considerations

### 1. Password Security
- **Hashing**: Use bcrypt with cost factor 12
- **History**: Track last 5 passwords, prevent reuse
- **Expiration**: Optional password expiration policy
- **Validation**: Enforce complexity requirements (12+ chars, uppercase, lowercase, digit, special)
- **Reset Flow**: Email-based verification with time-limited tokens (1 hour)

### 2. Two-Factor Authentication (2FA)
- **Method**: Time-based One-Time Password (TOTP) via authenticator apps
- **Backup Codes**: Generate 10 single-use backup codes on setup
- **Setup Flow**: 
  1. Generate secret + QR code
  2. User scans QR code
  3. User verifies with TOTP code
  4. System provides backup codes
- **Enforcement**: Optional, recommended for admins/doctors
- **Recovery**: Use backup codes for account recovery

### 3. Session Management
- **JWT Tokens**: 
  - Access token: 15 minutes
  - Refresh token: 30 days
  - Store refresh token in httpOnly, Secure cookie
- **Device Tracking**: Record device info for session list
- **Session Revocation**: Allow revoking individual sessions
- **Concurrent Sessions**: Max 5 concurrent sessions per user

### 4. Data Protection
- **Profile Picture**: Store in S3/CDN with encryption
- **Sensitive Fields**: Never log passwords, API keys
- **PII**: Encrypt at rest for compliance
- **Activity Logs**: Immutable, append-only

### 5. API Key Security
- **Generation**: Use cryptographically secure random generation (32 bytes)
- **Storage**: Hash with SHA-256, store only hash
- **Display**: Show only prefix (first 8 chars) and suffix (last 4 chars)
- **Rotation**: Support expiration and manual revocation
- **Audit**: Log all API key operations

### 6. Account Recovery
- **Deletion Requests**: 30-day grace period before actual deletion
- **Email Verification**: All account changes require email confirmation
- **Recovery Email**: Allow setting alternate recovery email
- **Phone Verification**: Optional SMS verification for sensitive actions

### 7. Rate Limiting
```
Password attempts: 5 attempts / 15 minutes (temporary lock)
Login attempts: 10 attempts / 15 minutes
API calls: 100 requests / minute (per API key)
Password change: 1 per hour
Email verification: 5 per day
```

### 8. CSRF & XSS Protection
- **CSRF Tokens**: Required for POST/PUT/DELETE requests
- **Content Security Policy**: Strict CSP headers
- **XSS Prevention**: Input sanitization, output encoding
- **Cookie Security**: SameSite=Strict, Secure, HttpOnly

### 9. Compliance
- **LGPD (Brazil)**: Data minimization, user consent, right to deletion
- **GDPR (if international)**: Data export, consent management
- **PCI DSS**: If payment methods stored
- **HIPAA**: If handling medical records

### 10. Audit Trail
Every setting change must log:
```json
{
  "user_id": 1,
  "action": "password_changed",
  "resource_type": "user",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "old_value": null,
  "new_value": { "password_changed_at": "2026-06-07T11:00:00Z" },
  "created_at": "2026-06-07T11:00:00Z"
}
```

---

## Notification Preferences Flow

### Architecture
```
User Settings → Preferences → Notification Settings
                                  ↓
                    [Email | SMS | In-App]
                            ↓
                [Frequency: Immediately | Daily | Weekly | Never]
                            ↓
                [Categories: Appointments, Prescriptions, Messages, etc]
                            ↓
                    Activity Log Stored
                            ↓
                    Notification Service Consumes
```

### Implementation Steps

#### Step 1: Update Preferences Endpoint
```python
# backend/app/api/routes/settings.py

@router.put("/users/me/preferences/notifications")
async def update_notification_preferences(
    current_user: User = Depends(get_current_user),
    preferences: NotificationPreferencesSchema = None,
    db: Session = Depends(get_db)
):
    user_prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == current_user.id
    ).first()
    
    if not user_prefs:
        user_prefs = UserPreferences(user_id=current_user.id)
    
    # Update preferences
    user_prefs.email_notifications_enabled = preferences.email_notifications_enabled
    user_prefs.notification_settings = preferences.notification_categories
    user_prefs.email_frequency = preferences.email_frequency
    
    # Log activity
    log_activity(
        db=db,
        user_id=current_user.id,
        action="notification_preferences_updated",
        new_value=preferences.dict()
    )
    
    db.add(user_prefs)
    db.commit()
    
    return user_prefs
```

#### Step 2: Frontend Notification Preferences Component
```tsx
// frontend/components/Settings/Preferences/NotificationPreferences.tsx

'use client';

import { useState } from 'react';
import { useUserSettings } from '@/hooks/useUserSettings';
import { notificationCategoryLabels } from '@/lib/settings/constants';

export default function NotificationPreferences() {
  const { updatePreferences, isLoading } = useUserSettings();
  const [emailFrequency, setEmailFrequency] = useState('daily');
  const [categories, setCategories] = useState({
    appointment_reminders: true,
    prescription_updates: true,
    patient_messages: true,
    system_alerts: true,
    financial_reports: false,
    team_mentions: false,
    schedule_changes: true,
  });

  const handleCategoryChange = (category: string) => {
    setCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleSave = async () => {
    await updatePreferences({
      notification_settings: categories,
      email_frequency: emailFrequency,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium">Frequência de Emails</label>
        <select
          value={emailFrequency}
          onChange={(e) => setEmailFrequency(e.target.value)}
          className="mt-2 w-full rounded border px-3 py-2"
        >
          <option value="immediately">Imediatamente</option>
          <option value="daily">Diariamente</option>
          <option value="weekly">Semanalmente</option>
          <option value="never">Nunca</option>
        </select>
      </div>

      <div>
        <h3 className="font-semibold mb-4">Categorias de Notificação</h3>
        <div className="space-y-3">
          {Object.entries(categories).map(([key, value]) => (
            <label key={key} className="flex items-center">
              <input
                type="checkbox"
                checked={value}
                onChange={() => handleCategoryChange(key)}
                className="rounded border-gray-300 mr-3"
              />
              <span className="text-sm">{notificationCategoryLabels[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isLoading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        {isLoading ? 'Salvando...' : 'Salvar Preferências'}
      </button>
    </div>
  );
}
```

#### Step 3: Activity Log Integration
Every preference change is logged with:
- Action type: `notification_preferences_updated`
- Category affected: `user_preferences`
- Previous value vs new value
- Timestamp and IP address

#### Step 4: Notification Service Integration
```python
# backend/app/services/notification_service.py

async def should_send_notification(
    user_id: int,
    notification_type: str,
    db: Session
) -> bool:
    user_prefs = db.query(UserPreferences).filter(
        UserPreferences.user_id == user_id
    ).first()
    
    if not user_prefs:
        return True  # Default to enabled
    
    # Check if notifications enabled
    if not user_prefs.email_notifications_enabled:
        return False
    
    # Check category
    if not user_prefs.notification_settings.get(notification_type, True):
        return False
    
    # Check frequency
    if user_prefs.email_frequency == 'never':
        return False
    
    return True
```

---

## Testing Plan

### Unit Tests

```typescript
// frontend/__tests__/settings/validation.test.ts

import { profileFormSchema, passwordFormSchema } from '@/lib/settings/validation';

describe('Profile Form Validation', () => {
  test('should accept valid profile data', () => {
    const data = {
      name: 'Dr. João Silva',
      phone: '+5511987654321',
      bio: 'Orthodontist'
    };
    expect(profileFormSchema.parse(data)).toEqual(data);
  });

  test('should reject name shorter than 3 characters', () => {
    const data = { name: 'Dr', phone: '', bio: '' };
    expect(() => profileFormSchema.parse(data)).toThrow();
  });
});

describe('Password Validation', () => {
  test('should reject password without uppercase', () => {
    const data = {
      currentPassword: 'test123!',
      newPassword: 'newpass123!',
      confirmPassword: 'newpass123!'
    };
    expect(() => passwordFormSchema.parse(data)).toThrow();
  });

  test('should require 12+ characters', () => {
    const data = {
      currentPassword: 'Test123!',
      newPassword: 'Short1!',
      confirmPassword: 'Short1!'
    };
    expect(() => passwordFormSchema.parse(data)).toThrow();
  });
});
```

### Integration Tests

```typescript
// frontend/__tests__/settings/profile.integration.test.ts

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileForm from '@/components/Settings/Profile/ProfileForm';

describe('Profile Settings Integration', () => {
  test('should update profile and show success message', async () => {
    render(<ProfileForm />);
    
    const nameInput = screen.getByLabelText(/nome/i);
    fireEvent.change(nameInput, { target: { value: 'Dr. New Name' } });
    
    const submitButton = screen.getByRole('button', { name: /salvar/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/salvo com sucesso/i)).toBeInTheDocument();
    });
  });

  test('should show validation errors', async () => {
    render(<ProfileForm />);
    
    const nameInput = screen.getByLabelText(/nome/i);
    fireEvent.change(nameInput, { target: { value: 'AB' } });
    fireEvent.blur(nameInput);
    
    await waitFor(() => {
      expect(screen.getByText(/pelo menos 3 caracteres/i)).toBeInTheDocument();
    });
  });
});
```

### API Tests (Backend)

```python
# backend/tests/test_settings_api.py

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

@pytest.fixture
def auth_headers(user):
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}

def test_get_user_profile(auth_headers):
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    assert "id" in response.json()
    assert "name" in response.json()

def test_update_user_profile(auth_headers):
    payload = {
        "name": "Dr. Updated",
        "phone": "+5511987654321"
    }
    response = client.put("/api/v1/users/me/profile", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Dr. Updated"

def test_password_change_requires_current_password(auth_headers):
    payload = {
        "current_password": "wrong_password",
        "new_password": "NewPass123!@",
        "confirm_password": "NewPass123!@"
    }
    response = client.post("/api/v1/users/me/password", json=payload, headers=auth_headers)
    assert response.status_code == 400
    assert "invalid" in response.json()["detail"].lower()
```

### E2E Tests

```typescript
// frontend/e2e/settings.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Settings Page E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'doctor@clinic.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button:has-text("Entrar")');
    await page.goto('/settings');
  });

  test('should update profile successfully', async ({ page }) => {
    await page.click('text=Perfil');
    await page.fill('input[name="name"]', 'Dr. Updated Name');
    await page.click('button:has-text("Salvar")');
    
    await expect(page.locator('text=Perfil salvo com sucesso')).toBeVisible();
  });

  test('should enable 2FA', async ({ page }) => {
    await page.click('text=Segurança da Conta');
    await page.click('button:has-text("Configurar 2FA")');
    
    const qrCode = page.locator('[data-testid="2fa-qr-code"]');
    await expect(qrCode).toBeVisible();
  });

  test('should show activity log', async ({ page }) => {
    await page.click('text=Privacidade & Segurança');
    await page.click('text=Histórico de Atividades');
    
    const logEntries = page.locator('[data-testid="activity-log-entry"]');
    await expect(logEntries.first()).toBeVisible();
  });
});
```

### Test Coverage Goals
- **Unit Tests**: 90% coverage for validation schemas and utilities
- **Integration Tests**: 80% coverage for components
- **API Tests**: 95% coverage for all endpoints
- **E2E Tests**: Critical user flows (password change, 2FA, profile update)

---

## Implementation Checklist

### Phase 1: Backend Models & Database (Day 1)
- [ ] Create database migrations for all 7 new models
- [ ] Update User model with new fields
- [ ] Implement UserPreferences model
- [ ] Implement UserSettings model
- [ ] Implement UserSession model
- [ ] Implement LoginHistory model
- [ ] Implement ActivityLog model
- [ ] Implement APIKey model
- [ ] Create database indexes for query optimization
- [ ] Write database migration scripts
- [ ] Test migration rollback/forward

### Phase 2: Backend API Endpoints (Day 2)
- [ ] Create settings router file
- [ ] Implement profile endpoints (GET, PUT, DELETE picture)
- [ ] Implement password change endpoint with validation
- [ ] Implement 2FA setup/verify/disable endpoints
- [ ] Implement session management endpoints
- [ ] Implement login history endpoint
- [ ] Implement preferences endpoints
- [ ] Implement API key management endpoints
- [ ] Implement activity log endpoint
- [ ] Add request/response validation schemas
- [ ] Implement error handling and status codes
- [ ] Add comprehensive logging
- [ ] Test all endpoints with Postman/insomnia

### Phase 3: Security Implementation (Day 2-3)
- [ ] Implement password hashing with bcrypt
- [ ] Implement TOTP/2FA using pyotp library
- [ ] Implement password strength validation
- [ ] Implement rate limiting middleware
- [ ] Add CORS security headers
- [ ] Implement CSRF token validation
- [ ] Add audit logging for sensitive operations
- [ ] Implement session token generation
- [ ] Test security with OWASP Top 10 checklist
- [ ] Implement file upload security (size, format, malware check)

### Phase 4: Frontend Components - Profile (Day 3)
- [ ] Create SettingsLayout component
- [ ] Create SettingsTabs navigation
- [ ] Create ProfileSection component
- [ ] Create ProfileForm component with RHF
- [ ] Implement profile picture upload with preview
- [ ] Add profile validation with Zod
- [ ] Create success/error notifications
- [ ] Add loading states and error boundaries
- [ ] Implement profile picture cropping tool
- [ ] Test mobile responsiveness

### Phase 5: Frontend Components - Account (Day 3-4)
- [ ] Create PasswordChangeForm with strength meter
- [ ] Implement 2FA setup flow with QR code
- [ ] Create TwoFactorVerify component
- [ ] Create ConnectedDevices component
- [ ] Create LoginHistory component
- [ ] Create AccountDeletion confirmation flow
- [ ] Add password requirements display
- [ ] Implement form validation
- [ ] Add loading states and transitions
- [ ] Test all security flows

### Phase 6: Frontend Components - Preferences (Day 4)
- [ ] Create PreferencesSection component
- [ ] Create LocaleSettings with language select
- [ ] Create ThemeSettings with toggle
- [ ] Create NotificationPreferences component
- [ ] Create NotificationCategories checkboxes
- [ ] Implement timezone selector with search
- [ ] Add preference validation
- [ ] Implement preference persistence
- [ ] Add success notifications
- [ ] Test preference syncing

### Phase 7: Frontend Components - Privacy (Day 4)
- [ ] Create PrivacySection component
- [ ] Create APIKeyManager with list
- [ ] Create CreateAPIKeyModal
- [ ] Create ActivityLog with filtering
- [ ] Create PrivacySettings toggles
- [ ] Create TermsAcceptance flow
- [ ] Add key masking and copy functionality
- [ ] Implement log pagination and filtering
- [ ] Add confirmation dialogs for destructive actions
- [ ] Test all privacy features

### Phase 8: Hooks & State Management (Day 4)
- [ ] Create useUserSettings hook
- [ ] Create useProfileSettings hook
- [ ] Create useAccountSettings hook
- [ ] Create usePreferencesSettings hook
- [ ] Create usePrivacySettings hook
- [ ] Create useTwoFactorAuth hook
- [ ] Create useAPIKeys hook
- [ ] Create useActivityLog hook
- [ ] Implement Zustand store for settings
- [ ] Test hook functionality

### Phase 9: Utilities & Helpers (Day 4)
- [ ] Create API client functions (api.ts)
- [ ] Create validation schema file
- [ ] Create data formatters (dates, phone, etc)
- [ ] Create constants file
- [ ] Create password strength calculator
- [ ] Create device detection utility
- [ ] Create timezone helper
- [ ] Create notification category labels
- [ ] Create type definitions
- [ ] Test all utility functions

### Phase 10: Testing (Day 5)
- [ ] Write unit tests for validation schemas
- [ ] Write unit tests for utilities
- [ ] Write unit tests for components
- [ ] Write integration tests for forms
- [ ] Write API endpoint tests
- [ ] Write E2E tests for critical flows
- [ ] Test mobile responsiveness
- [ ] Test accessibility (WCAG 2.1 AA)
- [ ] Test i18n with PT-BR translations
- [ ] Achieve 85%+ code coverage

### Phase 11: Internationalization (Day 5)
- [ ] Extract all strings to i18n files
- [ ] Create PT-BR translation keys
- [ ] Create EN-US translation keys
- [ ] Test language switching
- [ ] Test number/date formatting
- [ ] Test form labels and messages
- [ ] Add locale detection
- [ ] Test mobile locale support

### Phase 12: Documentation & Deployment (Day 5)
- [ ] Write API documentation (OpenAPI/Swagger)
- [ ] Write component documentation
- [ ] Write setup guide for developers
- [ ] Create migration checklist
- [ ] Write troubleshooting guide
- [ ] Prepare deployment scripts
- [ ] Create rollback procedures
- [ ] Test production build
- [ ] Performance optimization
- [ ] Security audit checklist

---

## Additional Resources

### Password Strength Meter Implementation
```typescript
// frontend/components/Settings/Account/PasswordStrengthMeter.tsx

export function getPasswordStrength(password: string): {
  score: number;
  level: 'weak' | 'fair' | 'good' | 'strong';
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*]/.test(password)) score += 1;

  if (score < 3) return { score, level: 'weak', feedback: ['Muito fraca'] };
  if (score < 4) return { score, level: 'fair', feedback: ['Adicione mais caracteres'] };
  if (score < 5) return { score, level: 'good', feedback: ['Boa'] };
  return { score, level: 'strong', feedback: ['Muito forte'] };
}
```

### QR Code Generation for 2FA
```python
# backend/app/services/totp_service.py

import qrcode
import io
import base64
from pyotp import TOTP

def generate_2fa_setup(user_id: int, user_email: str):
    # Generate secret
    totp = TOTP.new()
    secret = totp.secret
    
    # Generate QR code
    uri = totp.provisioning_uri(name=user_email, issuer_name='OrthoClinic')
    qr = qrcode.QRCode()
    qr.add_data(uri)
    qr.make()
    
    # Convert to base64
    img = qr.make_image()
    buffer = io.BytesIO()
    img.save(buffer)
    qr_code = base64.b64encode(buffer.getvalue()).decode()
    
    # Generate backup codes
    backup_codes = [base64.b32encode(os.urandom(4)).decode() for _ in range(10)]
    
    return {
        "secret": secret,
        "qr_code": qr_code,
        "backup_codes": backup_codes
    }
```

---

## Summary

This specification provides a comprehensive blueprint for implementing the ORTHOCLINIC User Settings Page:

**Key Deliverables:**
1. **7 Database Models** with relationships and indexes
2. **21 API Endpoints** with full CRUD operations
3. **Component Architecture** organized by feature
4. **Validation Schemas** using Zod for type safety
5. **Security Best Practices** covering OWASP Top 10
6. **Notification System** with preferences and categories
7. **Testing Strategy** covering unit, integration, E2E
8. **Implementation Checklist** across 12 phases

**Technology Stack:**
- Frontend: Next.js 14, React Hook Form, Zod, Zustand
- Backend: FastAPI, SQLAlchemy, PostgreSQL
- Security: bcrypt, TOTP (pyotp), JWT
- Testing: Jest, Playwright, pytest
- i18n: next-i18next with PT-BR priority

**Timeline:** 5 days (12-14 hours/day)

**Quality Metrics:**
- Code Coverage: 85%+
- Performance: < 2s page load
- Accessibility: WCAG 2.1 AA
- Mobile: Fully responsive (320px - 4K)
- i18n: Full PT-BR support

