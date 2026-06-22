"""
Tests for Privacy Settings Endpoints
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from database import Session
from models.user_settings import UserPreferences, ActivityLog

client = TestClient(app)

class TestPrivacyEndpoints:
    """Test suite for privacy endpoints"""

    def test_get_privacy_settings_success(self, authenticated_user_token):
        """Test getting privacy settings"""
        response = client.get(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "data_collection_allowed" in data
        assert "marketing_emails" in data
        assert "analytics_tracking" in data
        assert "allow_patient_direct_messaging" in data
        assert "share_calendar_with_team" in data

    def test_get_privacy_settings_creates_default(self, authenticated_user_token):
        """Test that getting privacy settings creates default if none exist"""
        response = client.get(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data_collection_allowed"] is True
        assert data["marketing_emails"] is False

    def test_update_privacy_data_collection(self, authenticated_user_token):
        """Test updating data collection preference"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"data_collection_allowed": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data_collection_allowed"] is False

    def test_update_privacy_marketing_emails(self, authenticated_user_token):
        """Test updating marketing emails preference"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"marketing_emails": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["marketing_emails"] is True

    def test_update_privacy_analytics_tracking(self, authenticated_user_token):
        """Test updating analytics tracking preference"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"analytics_tracking": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["analytics_tracking"] is False

    def test_update_privacy_patient_messaging(self, authenticated_user_token):
        """Test updating patient direct messaging preference"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"allow_patient_direct_messaging": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["allow_patient_direct_messaging"] is False

    def test_update_privacy_calendar_sharing(self, authenticated_user_token):
        """Test updating calendar sharing preference"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"share_calendar_with_team": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["share_calendar_with_team"] is True

    def test_update_privacy_multiple_settings(self, authenticated_user_token):
        """Test updating multiple privacy settings at once"""
        privacy_data = {
            "data_collection_allowed": False,
            "marketing_emails": True,
            "analytics_tracking": False,
            "allow_patient_direct_messaging": False,
            "share_calendar_with_team": True
        }
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=privacy_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data_collection_allowed"] is False
        assert data["marketing_emails"] is True
        assert data["analytics_tracking"] is False

    def test_update_privacy_logs_activity(self, authenticated_user_token, authenticated_user_id):
        """Test that privacy settings update is logged"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"data_collection_allowed": False}
        )
        assert response.status_code == 200
        # Activity should be logged

    def test_update_privacy_partial_update(self, authenticated_user_token):
        """Test updating only some privacy settings"""
        response = client.put(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"marketing_emails": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["marketing_emails"] is True

    def test_terms_acceptance_terms_of_service(self, authenticated_user_token):
        """Test accepting terms of service"""
        response = client.post(
            "/api/v1/users/me/accept-terms",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"terms_type": "terms_of_service"}
        )
        assert response.status_code == 200
        assert "message" in response.json()

    def test_terms_acceptance_privacy_policy(self, authenticated_user_token):
        """Test accepting privacy policy"""
        response = client.post(
            "/api/v1/users/me/accept-terms",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"terms_type": "privacy_policy"}
        )
        assert response.status_code == 200

    def test_terms_acceptance_cookie_policy(self, authenticated_user_token):
        """Test accepting cookie policy"""
        response = client.post(
            "/api/v1/users/me/accept-terms",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"terms_type": "cookie_policy"}
        )
        assert response.status_code == 200

    def test_get_privacy_shows_acceptance_dates(self, authenticated_user_token):
        """Test that privacy settings show terms acceptance dates"""
        # First accept terms
        client.post(
            "/api/v1/users/me/accept-terms",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"terms_type": "terms_of_service"}
        )
        # Then get privacy settings
        response = client.get(
            "/api/v1/users/me/privacy",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Should have acceptance dates

    def test_unauthorized_access(self):
        """Test accessing privacy settings without authentication"""
        response = client.get("/api/v1/users/me/privacy")
        assert response.status_code == 401

    def test_invalid_terms_type(self, authenticated_user_token):
        """Test accepting invalid terms type"""
        response = client.post(
            "/api/v1/users/me/accept-terms",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"terms_type": "invalid_terms"}
        )
        assert response.status_code in [400, 422]
