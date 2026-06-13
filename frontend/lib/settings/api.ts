/**
 * Settings API Client
 *
 * Provides functions for calling the user settings endpoints.
 * Base URL: /api/v1/users/me
 */

import axios, { AxiosError } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SETTINGS_API_PREFIX = `${API_BASE_URL}/api/v1/users/me`;

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: SETTINGS_API_PREFIX,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ========================
// Profile Endpoints
// ========================

export async function getUserProfile() {
  const response = await apiClient.get('/');
  return response.data;
}

export async function updateUserProfile(data: {
  name: string;
  phone?: string;
  bio?: string;
}) {
  const response = await apiClient.put('/profile', data);
  return response.data;
}

export async function uploadProfilePicture(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/profile-picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteProfilePicture() {
  const response = await apiClient.delete('/profile-picture');
  return response.data;
}

// ========================
// Preferences Endpoints
// ========================

export async function getPreferences() {
  const response = await apiClient.get('/preferences');
  return response.data;
}

export async function updatePreferences(data: {
  language?: string;
  theme?: string;
  timezone?: string;
  currency?: string;
  email_notifications_enabled?: boolean;
  email_frequency?: string;
  notification_settings?: Record<string, boolean>;
  show_in_team_directory?: boolean;
}) {
  const response = await apiClient.put('/preferences', data);
  return response.data;
}

export async function updateNotificationPreferences(data: {
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  in_app_notifications_enabled: boolean;
  email_frequency: string;
  notification_categories?: Record<string, boolean>;
}) {
  const response = await apiClient.put('/preferences/notifications', data);
  return response.data;
}

// ========================
// Privacy Endpoints
// ========================

export async function getPrivacySettings() {
  const response = await apiClient.get('/privacy');
  return response.data;
}

export async function updatePrivacySettings(data: {
  data_collection_allowed?: boolean;
  marketing_emails?: boolean;
  analytics_tracking?: boolean;
  allow_patient_direct_messaging?: boolean;
  share_calendar_with_team?: boolean;
}) {
  const response = await apiClient.put('/privacy', data);
  return response.data;
}

// ========================
// Password & Security Endpoints
// ========================

export async function changePassword(data: {
  current_password: string;
  new_password: string;
}) {
  const response = await apiClient.post('/password', data);
  return response.data;
}

export async function setup2FA() {
  const response = await apiClient.post('/2fa/setup', {});
  return response.data;
}

export async function verify2FA(totp_code: string) {
  const response = await apiClient.post('/2fa/verify', { totp_code });
  return response.data;
}

export async function disable2FA(current_password: string) {
  const response = await apiClient.delete('/2fa', {
    data: { current_password },
  });
  return response.data;
}

// ========================
// Session & Login History Endpoints
// ========================

export async function getUserSessions() {
  const response = await apiClient.get('/sessions');
  return response.data;
}

export async function revokeSession(session_id: number) {
  const response = await apiClient.delete(`/sessions/${session_id}`);
  return response.data;
}

export async function revokeAllOtherSessions(current_password: string) {
  const response = await apiClient.post('/sessions/revoke-all-others', {
    current_password,
  });
  return response.data;
}

export async function getLoginHistory(limit = 20, offset = 0) {
  const response = await apiClient.get('/login-history', {
    params: { limit, offset },
  });
  return response.data;
}

// ========================
// API Keys Endpoints
// ========================

export async function getAPIKeys() {
  const response = await apiClient.get('/api-keys');
  return response.data;
}

export async function createAPIKey(data: {
  name: string;
  permissions: string[];
  description?: string;
  expires_in_days?: number;
}) {
  const response = await apiClient.post('/api-keys', data);
  return response.data;
}

export async function deleteAPIKey(api_key_id: number, current_password: string) {
  const response = await apiClient.delete(`/api-keys/${api_key_id}`, {
    data: { current_password },
  });
  return response.data;
}

// ========================
// Activity Log Endpoints
// ========================

export async function getActivityLog(limit = 50, offset = 0, action?: string) {
  const response = await apiClient.get('/activity-log', {
    params: { limit, offset, action },
  });
  return response.data;
}

// ========================
// Terms & Policies Endpoints
// ========================

export async function acceptTerms(terms_type: 'terms_of_service' | 'privacy_policy' | 'cookie_policy') {
  const response = await apiClient.post('/accept-terms', { terms_type });
  return response.data;
}

// ========================
// Account Deletion Endpoints
// ========================

export async function requestAccountDeletion(data: {
  reason: string;
  current_password: string;
}) {
  const response = await apiClient.post('/deletion-request', data);
  return response.data;
}

export async function confirmAccountDeletion(deletion_token: string) {
  const response = await apiClient.post('/confirm-deletion', {
    deletion_token,
    confirm: true,
  });
  return response.data;
}

/**
 * Error handling utility
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.detail || error.message || 'An error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}
