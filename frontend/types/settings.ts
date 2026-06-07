/**
 * TypeScript Types for User Settings
 */

export interface UserProfile {
  id: number;
  organization_id: number;
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  profile_picture_url?: string;
  role: 'superadmin' | 'admin' | 'doctor' | 'secretary';
  is_verified: boolean;
  language: string;
  theme: 'light' | 'dark' | 'auto';
  timezone: string;
  currency: string;
  last_login_at?: string;
  created_at: string;
}

export interface UserPreferences {
  language: string;
  theme: 'light' | 'dark' | 'auto';
  timezone: string;
  currency: string;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  in_app_notifications_enabled: boolean;
  email_frequency: 'immediately' | 'daily' | 'weekly' | 'never';
  notification_settings: Record<string, boolean>;
  show_in_team_directory: boolean;
  allow_patient_direct_messaging: boolean;
  share_calendar_with_team: boolean;
  data_collection_allowed: boolean;
  marketing_emails: boolean;
  analytics_tracking: boolean;
  terms_of_service_accepted_at?: string;
  privacy_policy_accepted_at?: string;
  cookie_policy_accepted_at?: string;
}

export interface UserSession {
  id: number;
  device_name?: string;
  device_type?: string;
  browser?: string;
  ip_address?: string;
  last_activity_at: string;
  created_at: string;
  is_current_session: boolean;
}

export interface LoginHistoryEntry {
  id: number;
  ip_address?: string;
  device_type?: string;
  browser?: string;
  location?: string;
  login_successful: boolean;
  failure_reason?: string;
  created_at: string;
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  description?: string;
  created_at: string;
}

export interface APIKey {
  id: number;
  name: string;
  key_prefix: string;
  permissions: string[];
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
  is_active: boolean;
}

export interface APIKeySecret {
  id: number;
  name: string;
  api_key: string;
  message: string;
}

export interface TwoFactorSetup {
  secret: string;
  qr_code_url: string;
  backup_codes: string[];
  setup_expires_at: string;
}

export interface PasswordStrengthResult {
  score: number;
  level: 'weak' | 'fair' | 'good' | 'strong';
  feedback: string[];
  max_score: number;
}

export interface NotificationCategory {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
}

export interface SettingsStore {
  // State
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setProfile: (profile: UserProfile) => void;
  setPreferences: (preferences: UserPreferences) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export interface SettingsFormData {
  // Profile
  name?: string;
  phone?: string;
  bio?: string;

  // Preferences
  language?: string;
  theme?: string;
  timezone?: string;
  currency?: string;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  in_app_notifications_enabled?: boolean;
  email_frequency?: string;
  notification_settings?: Record<string, boolean>;

  // Account
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  status: number;
}

export interface PaginatedResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}
