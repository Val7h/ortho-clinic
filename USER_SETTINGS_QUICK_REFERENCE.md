# ORTHOCLINIC User Settings - Quick Reference Guide

**For Developers:** Fast lookup guide for implementing user settings

---

## Files Created in Phase 1

| File | Purpose | Lines | Status |
|------|---------|-------|--------|
| `USER_SETTINGS_SPECIFICATION.md` | Complete technical spec | 1,200+ | ✅ Ready |
| `backend/models/user_settings.py` | 7 database models | 200+ | ✅ Complete |
| `backend/models/organization.py` | Enhanced User model | Updated | ✅ Complete |
| `backend/app/schemas/user_settings.py` | Pydantic validators | 400+ | ✅ Complete |
| `backend/app/api/routes/settings.py` | 21 API endpoints | 700+ | ✅ Complete |
| `backend/app/services/password_service.py` | Password hashing & validation | 100+ | ✅ Complete |
| `backend/app/services/totp_service.py` | 2FA & backup codes | 150+ | ✅ Complete |
| `backend/app/services/activity_service.py` | Audit logging | 100+ | ✅ Complete |
| `backend/app/services/api_key_service.py` | API key management | 80+ | ✅ Complete |
| `backend/app/services/device_service.py` | Device detection | 150+ | ✅ Complete |
| `frontend/types/settings.ts` | TypeScript types | 140+ | ✅ Complete |
| `frontend/lib/settings/constants.ts` | Configuration & constants | 150+ | ✅ Complete |
| `USER_SETTINGS_IMPLEMENTATION_SUMMARY.md` | Progress & next steps | 600+ | ✅ This doc |

**Total Lines of Code:** 3,600+ | **Models:** 7 | **Endpoints:** 21 | **Services:** 5

---

## Database Models (7 Models)

### Quick Reference Table

| Model | Primary Key | Key Fields | Relationships | Status |
|-------|------------|-----------|---|---|
| **UserPreferences** | id | email_notifications, sms_notifications, in_app_notifications, email_frequency, notification_settings, privacy_settings | User (1:1) | ✅ |
| **UserSettings** | id | items_per_page, sidebar_collapsed, compact_view, custom_settings | User (1:1) | ✅ |
| **UserSession** | id | session_token, ip_address, device_type, browser, is_active, is_revoked | User (1:many) | ✅ |
| **LoginHistory** | id | user_id, ip_address, device_type, login_successful, created_at | User (1:many) | ✅ |
| **ActivityLog** | id | user_id, action, resource_type, old_value, new_value, ip_address | User (1:many) | ✅ |
| **APIKey** | id | user_id, key_hash, key_prefix, permissions, is_active | User (1:many) | ✅ |
| **User** (Enhanced) | id | Added 20+ fields | All above | ✅ |

### Database Imports
```python
from models.user_settings import (
    UserPreferences, UserSettings, UserSession,
    LoginHistory, ActivityLog, APIKey
)
from models.organization import User
```

---

## API Endpoints Quick Map

### Base: `/api/v1/users/me`

```
PROFILE MANAGEMENT
├── GET    /               → Get user profile
├── PUT    /profile        → Update profile (name, phone, bio)
├── POST   /profile-picture → Upload profile picture
└── DELETE /profile-picture → Delete profile picture

ACCOUNT SECURITY
├── POST   /password                          → Change password
├── POST   /2fa/setup                         → Setup 2FA
├── POST   /2fa/verify                        → Verify TOTP + enable
├── DELETE /2fa                               → Disable 2FA
├── GET    /sessions                          → List connected devices
├── DELETE /sessions/{id}                     → Revoke specific session
├── POST   /sessions/revoke-all-others        → Revoke all other sessions
└── GET    /login-history?limit=20&offset=0   → Get login history

PREFERENCES
├── GET    /preferences                       → Get all preferences
├── PUT    /preferences                       → Update preferences
└── PUT    /preferences/notifications         → Update notification settings

PRIVACY & API KEYS
├── GET    /api-keys                          → List API keys
├── POST   /api-keys                          → Create API key
├── DELETE /api-keys/{id}                     → Revoke API key
├── POST   /accept-terms                      → Accept T&C/Privacy
└── GET    /activity-log?limit=50&offset=0    → View activity audit log

ACCOUNT DELETION
├── POST   /deletion-request                  → Request account deletion
└── POST   /confirm-deletion                  → Confirm with token
```

---

## Validation Rules Quick Reference

### Password
```
Minimum:  12 characters
Required: 1 Uppercase + 1 Lowercase + 1 Digit + 1 Special (!@#$%^&*)
Blocked:  Same as current password, matches email/name
```

### Phone Number
```
Format: +55 (11) 98765-4321 OR international E.164
Regex:  ^(\+\d{1,3})?(\d{10,15})$
```

### TOTP Code
```
Length: Exactly 6 digits
Type:   Numbers only
Regex:  ^\d{6}$
```

### API Key Name
```
Min:  3 characters
Max:  255 characters
```

### Profile Picture
```
Max Size:    5 MB
Formats:     JPEG, PNG, WebP
Min Dims:    100 × 100 px
Max Dims:    4000 × 4000 px
Resize To:   500 × 500 px
```

---

## Service Functions Reference

### Password Service
```python
from app.services.password_service import (
    hash_password,           # str → hashed
    verify_password,         # (plain, hash) → bool
    validate_password_strength,  # str → raises if weak
    get_password_strength    # str → {score, level, feedback}
)
```

### TOTP Service
```python
from app.services.totp_service import (
    generate_totp_secret,    # (email, issuer) → (secret, qr_code)
    verify_totp,            # (secret, token) → bool
    generate_backup_codes,   # (count) → [codes]
    hash_backup_code,       # str → hashed
    verify_backup_code      # (code, hash) → bool
)
```

### Activity Service
```python
from app.services.activity_service import (
    log_activity,           # Log user action to audit trail
    get_activity_log,       # Retrieve filtered activity logs
    cleanup_old_activities  # Delete logs older than N days
)
```

### API Key Service
```python
from app.services.api_key_service import (
    generate_api_key,       # Generate secure key
    hash_api_key,          # Hash for storage
    verify_api_key,        # Verify plain vs hash
    get_api_key_prefix,    # Get first 8 chars
    get_api_key_suffix,    # Get last 4 chars
    mask_api_key           # Return "XXXX...XXXX"
)
```

### Device Service
```python
from app.services.device_service import (
    detect_device,         # user_agent → {type, name, os, browser}
    detect_os,            # user_agent → os_name
    detect_browser,       # user_agent → browser_name
    get_device_name_for_session  # (type, browser, os) → name
)
```

---

## Status Codes & Error Handling

### Success Responses
```
200 OK              ← GET, PUT successful
201 Created         ← POST successful (rarely used here)
204 No Content      ← DELETE successful
```

### Client Errors
```
400 Bad Request     ← Validation failed, invalid password, etc
401 Unauthorized    ← No auth token provided
403 Forbidden       ← Permission denied (rare in settings)
404 Not Found       ← Resource (session, API key) not found
429 Too Many Requests ← Rate limit exceeded
```

### Server Errors
```
500 Internal Server Error ← Database error, service error
```

### Error Response Format
```json
{
  "detail": "Error message",
  "error_code": "VALIDATION_ERROR",
  "timestamp": "2026-06-07T11:00:00Z"
}
```

---

## Frontend Constants

### Configuration Import
```typescript
import {
  LANGUAGES,              // [{code, label}, ...]
  THEMES,                // [{value, label}, ...]
  CURRENCIES,            // [{code, label}, ...]
  EMAIL_FREQUENCIES,     // [{value, label}, ...]
  NOTIFICATION_CATEGORIES,  // {key: label}
  API_KEY_PERMISSIONS,   // [{value, label}, ...]
  PASSWORD_REQUIREMENTS, // [{id, label, regex}, ...]
  ACTIVITY_ACTIONS,      // {action: label}
  FILE_UPLOAD,           // {MAX_SIZE, ALLOWED_TYPES, ...}
  SETTINGS_API_PREFIX,   // "http://localhost:8000/api/v1/users/me"
  ROUTES,                // {SETTINGS, PROFILE, ACCOUNT, ...}
} from '@/lib/settings/constants';
```

### Type Import
```typescript
import type {
  UserProfile,
  UserPreferences,
  UserSession,
  LoginHistoryEntry,
  ActivityLogEntry,
  APIKey,
  TwoFactorSetup,
  PasswordStrengthResult,
  SettingsStore,
} from '@/types/settings';
```

---

## Common Implementation Patterns

### 1. Log Activity (Backend)
```python
log_activity(
    db=db,
    user_id=current_user.id,
    action="password_changed",
    resource_type="user",
    old_value=None,
    new_value={"password_changed_at": datetime.utcnow()},
    ip_address=request.client.host if request.client else None,
    user_agent=request.headers.get("user-agent"),
    description="Password changed via settings page"
)
```

### 2. Verify Password (Backend)
```python
if not verify_password(request_data.current_password, current_user.password_hash):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Current password is incorrect"
    )
```

### 3. Validate Password Strength (Backend)
```python
try:
    validate_password_strength(request_data.new_password)
except HTTPException as e:
    # Re-raise with proper HTTP status
    raise
```

### 4. Setup 2FA (Backend)
```python
secret, qr_code_url = generate_totp_secret(
    user_email=current_user.email,
    issuer_name="OrthoClinic"
)
backup_codes = generate_backup_codes(count=10)
# Return to user, don't save yet (save on verify)
```

### 5. Verify 2FA (Backend)
```python
if not verify_totp(current_user.two_fa_secret, request_data.totp_code):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid TOTP code"
    )
# Now enable: current_user.is_two_fa_enabled = True
```

### 6. Create API Key (Backend)
```python
api_key_value = generate_api_key()
key_hash = hash_api_key(api_key_value)
key_prefix = api_key_value[:8]

api_key = APIKey(
    user_id=current_user.id,
    name=request_data.name,
    key_hash=key_hash,
    key_prefix=key_prefix,
    permissions=request_data.permissions
)
db.add(api_key)
db.commit()

# Return actual key ONLY on creation (not stored)
return {
    "api_key": api_key_value,
    "message": "Save this key securely. You won't see it again."
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Password strength validation
- [ ] Password hashing (bcrypt)
- [ ] TOTP generation & verification
- [ ] Backup code generation
- [ ] API key generation & hashing
- [ ] Device detection from user-agent
- [ ] Validation schemas (all Pydantic schemas)

### Integration Tests
- [ ] Profile update flow
- [ ] Password change (with verification)
- [ ] 2FA setup → verify → enable
- [ ] Session creation & revocation
- [ ] API key CRUD
- [ ] Activity log creation & retrieval

### API Tests
- [ ] All 21 endpoints with valid data
- [ ] Error scenarios (invalid input, unauthorized, not found)
- [ ] Status codes (200, 201, 204, 400, 401, 404, 429)
- [ ] Pagination (limit, offset)
- [ ] Filtering (action, resource_type)

### E2E Tests (Frontend)
- [ ] Settings page loads
- [ ] Update profile form
- [ ] Change password flow
- [ ] Enable/disable 2FA
- [ ] Revoke device session
- [ ] Update preferences
- [ ] Create/delete API key
- [ ] View activity log

---

## Common Pitfalls & Solutions

### ❌ Problem: Password not updating
```python
# WRONG: Database didn't update
current_user.password_hash = hash_password(new_password)
# db.add(current_user) <- Missing!
# db.commit()

# RIGHT:
current_user.password_hash = hash_password(new_password)
db.add(current_user)
db.commit()
```

### ❌ Problem: 2FA secret exposed in response
```python
# WRONG: Don't return the secret for verification
return {"secret": secret}

# RIGHT: Return only what's needed for QR code
return {"qr_code_url": qr_code_url, "backup_codes": codes}
```

### ❌ Problem: API key visible in database
```python
# WRONG: Storing actual key
api_key.key = api_key_value

# RIGHT: Hash it
api_key.key_hash = hash_api_key(api_key_value)
```

### ❌ Problem: Missing activity log
```python
# WRONG: No audit trail
current_user.password_hash = hash_password(new_password)
db.commit()

# RIGHT: Log all changes
log_activity(db, user_id, action="password_changed", ...)
current_user.password_hash = hash_password(new_password)
db.commit()
```

### ❌ Problem: Device detection fails
```python
# WRONG: User-Agent might be None
browser = detect_browser(user_agent)

# RIGHT: Handle None case
browser = detect_browser(user_agent) if user_agent else None
```

---

## Performance Considerations

### Query Optimization
```python
# For activity logs with pagination:
# Always use .order_by(ActivityLog.created_at.desc()).limit(50)
# Index on (user_id, created_at)

# For sessions list:
# Filter is_active = True and is_revoked = False
# Index on user_id and created_at

# For login history:
# Index on user_id for filtering
# Index on created_at for ordering
```

### Caching Opportunities
- User preferences (cache for 5-10 minutes)
- API key list (cache for 1 minute)
- Activity log (no caching needed)
- User profile (cache for session duration)

### Database Indexes
```sql
-- User Settings Indexes
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_login_history_user_created ON login_history(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_api_keys_user_active ON api_keys(user_id, is_active);
```

---

## Security Checklist

- [ ] All passwords hashed with bcrypt (cost 12)
- [ ] 2FA optional but recommended for admins
- [ ] API keys hashed before storage
- [ ] All sensitive changes logged to activity log
- [ ] Session tokens stored securely (httpOnly cookies)
- [ ] CSRF tokens required for POST/PUT/DELETE
- [ ] Rate limiting on sensitive endpoints
- [ ] Password change invalidates other sessions
- [ ] Account deletion has 30-day grace period
- [ ] IP address and User-Agent captured for audit
- [ ] All user inputs validated with Pydantic
- [ ] Error messages don't leak sensitive info

---

## Useful Commands

### Database Migration (when created)
```bash
# Create migration
alembic revision --autogenerate -m "Add user settings models"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Testing
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app

# Run specific test
pytest tests/test_settings_api.py::test_change_password
```

### API Testing
```bash
# Using curl
curl -X PUT http://localhost:8000/api/v1/users/me/profile \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Name"}'

# Using HTTPie
http PUT localhost:8000/api/v1/users/me/profile \
  Authorization:"Bearer {token}" \
  name="New Name"
```

---

## Documentation Links

| Document | Purpose |
|----------|---------|
| `USER_SETTINGS_SPECIFICATION.md` | Complete technical specification |
| `USER_SETTINGS_IMPLEMENTATION_SUMMARY.md` | Implementation status & progress |
| `USER_SETTINGS_QUICK_REFERENCE.md` | This file - quick lookup |

---

## Contact & Support

For questions on:
- **Database Models:** See `backend/models/user_settings.py`
- **API Endpoints:** See `backend/app/api/routes/settings.py`
- **Validation:** See `backend/app/schemas/user_settings.py`
- **Security:** See `backend/app/services/`
- **Frontend Types:** See `frontend/types/settings.ts`

---

**Version:** 1.0 | **Last Updated:** 2026-06-07 | **Status:** Phase 1 Complete ✅

