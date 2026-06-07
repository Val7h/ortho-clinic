/**
 * Settings Constants
 */

export const LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español' },
];

export const THEMES = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'auto', label: 'Automático' },
];

export const CURRENCIES = [
  { code: 'BRL', label: 'Real Brasileiro (R$)' },
  { code: 'USD', label: 'Dólar Americano ($)' },
  { code: 'EUR', label: 'Euro (€)' },
];

export const EMAIL_FREQUENCIES = [
  { value: 'immediately', label: 'Imediatamente' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'never', label: 'Nunca' },
];

export const NOTIFICATION_CATEGORIES: Record<string, string> = {
  appointment_reminders: 'Lembretes de Agendamentos',
  prescription_updates: 'Atualizações de Prescrições',
  patient_messages: 'Mensagens de Pacientes',
  system_alerts: 'Alertas do Sistema',
  financial_reports: 'Relatórios Financeiros',
  team_mentions: 'Menções de Equipe',
  schedule_changes: 'Mudanças de Agenda',
};

export const API_KEY_PERMISSIONS = [
  { value: 'read', label: 'Leitura' },
  { value: 'write', label: 'Escrita' },
  { value: 'delete', label: 'Exclusão' },
];

export const TIMEZONE_EXAMPLES = [
  'America/Sao_Paulo',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'Mínimo de 12 caracteres', regex: /.{12,}/ },
  { id: 'uppercase', label: 'Pelo menos uma letra maiúscula', regex: /[A-Z]/ },
  { id: 'lowercase', label: 'Pelo menos uma letra minúscula', regex: /[a-z]/ },
  { id: 'number', label: 'Pelo menos um número', regex: /[0-9]/ },
  { id: 'special', label: 'Pelo menos um caractere especial (!@#$%^&*)', regex: /[!@#$%^&*]/ },
];

export const ACTIVITY_ACTIONS = {
  profile_updated: 'Perfil atualizado',
  profile_picture_uploaded: 'Foto de perfil enviada',
  profile_picture_deleted: 'Foto de perfil removida',
  password_changed: 'Senha alterada',
  '2fa_enabled': '2FA ativado',
  '2fa_disabled': '2FA desativado',
  session_revoked: 'Sessão revogada',
  notification_preferences_updated: 'Preferências de notificação atualizadas',
  preferences_updated: 'Preferências atualizadas',
  api_key_created: 'Chave API criada',
  api_key_revoked: 'Chave API revogada',
  terms_of_service_accepted: 'Termos de serviço aceitos',
  privacy_policy_accepted: 'Política de privacidade aceita',
  cookie_policy_accepted: 'Política de cookies aceita',
  deletion_requested: 'Exclusão de conta solicitada',
  account_deleted: 'Conta excluída',
};

export const DEVICE_TYPES = {
  desktop: 'Desktop',
  mobile: 'Celular',
  tablet: 'Tablet',
  unknown: 'Desconhecido',
};

export const ROUTES = {
  SETTINGS: '/settings',
  PROFILE: '/settings/profile',
  ACCOUNT: '/settings/account',
  PREFERENCES: '/settings/preferences',
  PRIVACY: '/settings/privacy',
};

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const SETTINGS_API_PREFIX = `${API_BASE_URL}/api/v1/users/me`;

// File upload constraints
export const FILE_UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MIN_WIDTH: 100,
  MIN_HEIGHT: 100,
  MAX_WIDTH: 4000,
  MAX_HEIGHT: 4000,
  RESIZE_WIDTH: 500,
  RESIZE_HEIGHT: 500,
};

// Session constants
export const SESSION_DEFAULTS = {
  MAX_SESSIONS: 5,
  INACTIVITY_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Rate limiting (client-side)
export const RATE_LIMITS = {
  PASSWORD_CHANGE: { max: 1, window: 3600 * 1000 }, // 1 per hour
  API_KEY_CREATE: { max: 10, window: 24 * 3600 * 1000 }, // 10 per day
};

export const TOAST_DURATION = 3000; // milliseconds

export const FORM_DEBOUNCE_DELAY = 300; // milliseconds
