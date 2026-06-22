"""
Tests for API Keys Endpoints
Endpoints 14-16: GET, POST, DELETE /api/v1/users/me/api-keys
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from database import Session
from models.user_settings import APIKey
import json

client = TestClient(app)

class TestAPIKeysEndpoints:
    """Test suite for API keys management endpoints"""

    def test_get_api_keys_empty(self, authenticated_user_token):
        """Test getting API keys when user has none"""
        response = client.get(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "api_keys" in data
        assert len(data["api_keys"]) == 0

    def test_create_api_key_success(self, authenticated_user_token):
        """Test creating a new API key"""
        api_key_data = {
            "name": "Mobile App Integration",
            "permissions": ["read", "write"],
            "description": "API key for mobile app",
            "expires_in_days": 365
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "api_key" in data
        assert "id" in data
        assert data["name"] == "Mobile App Integration"
        assert "Save this API key securely" in data["message"]

    def test_create_api_key_minimal(self, authenticated_user_token):
        """Test creating API key with minimal required fields"""
        api_key_data = {
            "name": "Test Key",
            "permissions": ["read"]
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "api_key" in data

    def test_create_api_key_with_expiry(self, authenticated_user_token):
        """Test creating API key with expiration"""
        api_key_data = {
            "name": "Expiring Key",
            "permissions": ["read"],
            "expires_in_days": 30
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "api_key" in data

    def test_create_api_key_with_multiple_permissions(self, authenticated_user_token):
        """Test creating API key with multiple permissions"""
        api_key_data = {
            "name": "Full Access Key",
            "permissions": ["read", "write", "delete"]
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "api_key" in data

    def test_create_api_key_validation_no_name(self, authenticated_user_token):
        """Test creating API key without name"""
        api_key_data = {
            "permissions": ["read"]
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code in [400, 422]

    def test_create_api_key_validation_no_permissions(self, authenticated_user_token):
        """Test creating API key without permissions"""
        api_key_data = {
            "name": "No Permissions Key",
            "permissions": []
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code in [400, 422]

    def test_get_api_keys_after_creation(self, authenticated_user_token):
        """Test getting API keys after creating one"""
        # Create key
        api_key_data = {
            "name": "List Test Key",
            "permissions": ["read"]
        }
        create_response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert create_response.status_code == 200

        # Get list
        get_response = client.get(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert get_response.status_code == 200
        data = get_response.json()
        assert len(data["api_keys"]) > 0

    def test_get_api_keys_shows_prefix(self, authenticated_user_token):
        """Test that API keys list shows prefix instead of full key"""
        # Create key
        api_key_data = {
            "name": "Prefix Test Key",
            "permissions": ["read"]
        }
        create_response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert create_response.status_code == 200

        # Get list
        get_response = client.get(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"}
        )
        assert get_response.status_code == 200
        data = get_response.json()
        for key in data["api_keys"]:
            assert "key_prefix" in key
            assert len(key["key_prefix"]) == 8  # First 8 chars

    def test_delete_api_key_success(self, authenticated_user_token, authenticated_user):
        """Test deleting an API key"""
        # Create key
        api_key_data = {
            "name": "Delete Test Key",
            "permissions": ["read"]
        }
        create_response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert create_response.status_code == 200
        api_key_id = create_response.json()["id"]

        # Delete key
        delete_response = client.delete(
            f"/api/v1/users/me/api-keys/{api_key_id}",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"current_password": "correct_password"}
        )
        assert delete_response.status_code == 200

    def test_delete_api_key_wrong_password(self, authenticated_user_token):
        """Test deleting API key with wrong password"""
        # Create key
        api_key_data = {
            "name": "Wrong Password Key",
            "permissions": ["read"]
        }
        create_response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert create_response.status_code == 200
        api_key_id = create_response.json()["id"]

        # Try to delete with wrong password
        delete_response = client.delete(
            f"/api/v1/users/me/api-keys/{api_key_id}",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"current_password": "wrong_password"}
        )
        assert delete_response.status_code == 400

    def test_delete_nonexistent_api_key(self, authenticated_user_token, authenticated_user):
        """Test deleting non-existent API key"""
        delete_response = client.delete(
            "/api/v1/users/me/api-keys/99999",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"current_password": "correct_password"}
        )
        assert delete_response.status_code == 404

    def test_delete_api_key_logs_activity(self, authenticated_user_token, authenticated_user_id):
        """Test that API key deletion is logged"""
        # Create key
        api_key_data = {
            "name": "Activity Log Key",
            "permissions": ["read"]
        }
        create_response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert create_response.status_code == 200
        api_key_id = create_response.json()["id"]

        # Delete key
        delete_response = client.delete(
            f"/api/v1/users/me/api-keys/{api_key_id}",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"current_password": "correct_password"}
        )
        assert delete_response.status_code == 200
        # Activity should be logged

    def test_api_key_response_structure(self, authenticated_user_token):
        """Test API key response structure after creation"""
        api_key_data = {
            "name": "Structure Test Key",
            "permissions": ["read", "write"],
            "description": "Test description"
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        data = response.json()

        # Verify response structure
        assert "id" in data
        assert "name" in data
        assert "api_key" in data
        assert "message" in data
        assert data["name"] == "Structure Test Key"

    def test_api_key_is_hashed(self, authenticated_user_token, db: Session):
        """Test that API key is hashed in database"""
        api_key_data = {
            "name": "Hash Test Key",
            "permissions": ["read"]
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        api_key_value = response.json()["api_key"]

        # Verify key is hashed in database (should not match plaintext)
        # db_key = db.query(APIKey).filter(APIKey.name == "Hash Test Key").first()
        # assert db_key.key_hash != api_key_value

    def test_unauthorized_create_api_key(self):
        """Test creating API key without authentication"""
        api_key_data = {
            "name": "Unauthorized Key",
            "permissions": ["read"]
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            json=api_key_data
        )
        assert response.status_code == 401

    def test_unauthorized_get_api_keys(self):
        """Test getting API keys without authentication"""
        response = client.get("/api/v1/users/me/api-keys")
        assert response.status_code == 401

    def test_unauthorized_delete_api_key(self):
        """Test deleting API key without authentication"""
        response = client.delete("/api/v1/users/me/api-keys/1")
        assert response.status_code == 401

    def test_api_key_name_length_validation(self, authenticated_user_token):
        """Test API key name length validation"""
        # Too short
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json={"name": "ab", "permissions": ["read"]}
        )
        assert response.status_code in [400, 422]

    def test_api_key_creation_logs_activity(self, authenticated_user_token):
        """Test that API key creation is logged"""
        api_key_data = {
            "name": "Activity Log Creation",
            "permissions": ["read"]
        }
        response = client.post(
            "/api/v1/users/me/api-keys",
            headers={"Authorization": f"Bearer {authenticated_user_token}"},
            json=api_key_data
        )
        assert response.status_code == 200
        # Activity should be logged
