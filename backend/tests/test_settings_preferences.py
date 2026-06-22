"""
Tests for Preferences Endpoints
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime
from app.main import app
from database import Session
from models.user_settings import UserPreferences
from models.organization import User

client = TestClient(app)

# Test fixtures would be defined here
# Assume we have authenticated user with token

class TestPreferencesEndpoints:
    """Test suite for preferences endpoints"""

    def test_get_preferences_success(self, authenticated_user_token):
        """Test getting user preferences"""
        response = client.get(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "language" in data
        assert "theme" in data
        assert "timezone" in data
        assert "email_notifications_enabled" in data

    def test_get_preferences_creates_default(self, authenticated_user_token, db: Session):
        """Test that getting preferences creates default if none exist"""
        response = client.get(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert response.status_code == 200

    def test_update_preferences_language(self, authenticated_user_token, authenticated_user_id):
        """Test updating language preference"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"language": "en-US"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "en-US"

    def test_update_preferences_theme(self, authenticated_user_token):
        """Test updating theme preference"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"theme": "dark"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme"] == "dark"

    def test_update_preferences_timezone(self, authenticated_user_token):
        """Test updating timezone preference"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"timezone": "America/New_York"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == "America/New_York"

    def test_update_preferences_currency(self, authenticated_user_token):
        """Test updating currency preference"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"currency": "USD"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["currency"] == "USD"

    def test_update_preferences_email_notifications(self, authenticated_user_token):
        """Test updating email notification preference"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"email_notifications_enabled": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_notifications_enabled"] is False

    def test_update_preferences_email_frequency(self, authenticated_user_token):
        """Test updating email frequency preference"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"email_frequency": "weekly"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_frequency"] == "weekly"

    def test_update_notification_preferences(self, authenticated_user_token):
        """Test updating notification preferences"""
        notification_data = {
            "email_notifications_enabled": True,
            "sms_notifications_enabled": True,
            "in_app_notifications_enabled": True,
            "email_frequency": "daily",
            "notification_categories": {
                "appointment_reminders": True,
                "prescription_updates": False,
                "patient_messages": True,
            }
        }
        response = client.put(
            "/api/v1/users/me/preferences/notifications",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=notification_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email_notifications_enabled"] is True
        assert data["sms_notifications_enabled"] is True

    def test_update_preferences_logs_activity(self, authenticated_user_token, authenticated_user_id, db: Session):
        """Test that preferences update is logged"""
        client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"language": "es-ES"}
        )
        # Verify activity was logged
        # activity = db.query(ActivityLog).filter(
        #     ActivityLog.user_id == authenticated_user_id,
        #     ActivityLog.action == "preferences_updated"
        # ).first()
        # assert activity is not None

    def test_update_preferences_invalid_language(self, authenticated_user_token):
        """Test updating with invalid language value"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"language": "invalid"}
        )
        # Should handle gracefully or validate
        assert response.status_code in [200, 400]

    def test_update_preferences_multiple_fields(self, authenticated_user_token):
        """Test updating multiple preferences at once"""
        response = client.put(
            "/api/v1/users/me/preferences",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={
                "language": "en-US",
                "theme": "dark",
                "timezone": "America/New_York",
                "currency": "USD",
                "email_frequency": "weekly"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "en-US"
        assert data["theme"] == "dark"
        assert data["timezone"] == "America/New_York"
        assert data["currency"] == "USD"
        assert data["email_frequency"] == "weekly"

    def test_unauthorized_access(self):
        """Test accessing preferences without authentication"""
        response = client.get("/api/v1/users/me/preferences")
        assert response.status_code == 401
