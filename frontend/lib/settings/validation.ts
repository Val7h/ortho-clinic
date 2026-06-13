/**
 * Settings Form Validation Schemas
 *
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// ========================
// Password Validation
// ========================

export const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character');

export const passwordStrengthSchema = z.object({
  score: z.number().min(0).max(5),
  level: z.enum(['weak', 'fair', 'good', 'strong', 'very_strong']),
  feedback: z.array(z.string()),
});

// ========================
// Profile Validation
// ========================

export const profileSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(200, 'Name must not exceed 200 characters'),
  phone: z.string()
    .optional()
    .refine(
      (val) => !val || /^(\+\d{1,3})?(\d{10,15})$/.test(val),
      'Invalid phone number format'
    ),
  bio: z.string()
    .max(500, 'Bio must not exceed 500 characters')
    .optional(),
});

// ========================
// Password Change Validation
// ========================

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: passwordSchema,
  confirm_password: z.string(),
}).refine(
  (data) => data.new_password === data.confirm_password,
  {
    message: "Passwords don't match",
    path: ['confirm_password'],
  }
).refine(
  (data) => data.current_password !== data.new_password,
  {
    message: 'New password must be different from current password',
    path: ['new_password'],
  }
);

// ========================
// 2FA Validation
// ========================

export const totpCodeSchema = z.string()
  .length(6, 'Code must be 6 digits')
  .regex(/^\d{6}$/, 'Code must contain only numbers');

export const twoFactorVerifySchema = z.object({
  totp_code: totpCodeSchema,
});

export const twoFactorDisableSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
});

// ========================
// Preferences Validation
// ========================

export const preferencesSchema = z.object({
  language: z.enum(['pt-BR', 'en-US', 'es-ES']),
  theme: z.enum(['light', 'dark', 'auto']),
  timezone: z.string().min(1, 'Timezone is required'),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  email_notifications_enabled: z.boolean(),
  sms_notifications_enabled: z.boolean(),
  in_app_notifications_enabled: z.boolean(),
  email_frequency: z.enum(['instant', 'daily', 'weekly', 'monthly']),
  show_in_team_directory: z.boolean(),
  allow_patient_direct_messaging: z.boolean().optional(),
  share_calendar_with_team: z.boolean().optional(),
  notification_settings: z.record(z.boolean()).optional(),
});

// ========================
// Privacy Validation
// ========================

export const privacySchema = z.object({
  data_collection_allowed: z.boolean(),
  marketing_emails: z.boolean(),
  analytics_tracking: z.boolean(),
  allow_patient_direct_messaging: z.boolean().optional(),
  share_calendar_with_team: z.boolean().optional(),
});

// ========================
// API Key Validation
// ========================

export const apiKeyCreateSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must not exceed 255 characters'),
  permissions: z.array(z.enum(['read', 'write', 'delete']))
    .min(1, 'At least one permission is required'),
  description: z.string()
    .max(500, 'Description must not exceed 500 characters')
    .optional(),
  expires_in_days: z.number()
    .int()
    .positive('Expiry days must be positive')
    .optional(),
});

export const apiKeyDeleteSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
});

// ========================
// Session Management Validation
// ========================

export const revokeSessionSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
});

// ========================
// Account Deletion Validation
// ========================

export const accountDeletionSchema = z.object({
  reason: z.string()
    .min(10, 'Please provide a reason (at least 10 characters)')
    .max(500, 'Reason must not exceed 500 characters'),
  current_password: z.string().min(1, 'Current password is required'),
  confirm_deletion: z.boolean().refine(
    (val) => val === true,
    'You must confirm account deletion'
  ),
});

export const confirmDeletionSchema = z.object({
  deletion_token: z.string().min(1, 'Deletion token is required'),
  confirm: z.boolean().refine(
    (val) => val === true,
    'You must confirm account deletion'
  ),
});

// ========================
// Terms & Policies Validation
// ========================

export const acceptTermsSchema = z.object({
  terms_type: z.enum(['terms_of_service', 'privacy_policy', 'cookie_policy']),
});

// ========================
// Notification Preferences Validation
// ========================

export const notificationCategoriesSchema = z.record(z.boolean()).optional();

export const notificationPreferencesSchema = z.object({
  email_notifications_enabled: z.boolean(),
  sms_notifications_enabled: z.boolean(),
  in_app_notifications_enabled: z.boolean(),
  email_frequency: z.enum(['instant', 'daily', 'weekly', 'monthly']),
  notification_categories: notificationCategoriesSchema,
});

// ========================
// Type Exports
// ========================

export type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>;
export type PreferencesFormData = z.infer<typeof preferencesSchema>;
export type PrivacyFormData = z.infer<typeof privacySchema>;
export type APIKeyCreateFormData = z.infer<typeof apiKeyCreateSchema>;
export type ProfileFormData = z.infer<typeof profileSchema>;
export type TwoFactorVerifyFormData = z.infer<typeof twoFactorVerifySchema>;
export type AccountDeletionFormData = z.infer<typeof accountDeletionSchema>;
export type NotificationPreferencesFormData = z.infer<typeof notificationPreferencesSchema>;
export type PasswordStrengthData = z.infer<typeof passwordStrengthSchema>;
