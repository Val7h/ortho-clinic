/**
 * usePreferencesSettings Hook
 *
 * Manages user preferences state and API interactions
 */

import { useState, useEffect } from 'react';
import * as settingsAPI from '@/lib/settings/api';
import { getErrorMessage } from '@/lib/settings/api';

export interface UserPreferences {
  language: string;
  theme: string;
  timezone: string;
  currency: string;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  in_app_notifications_enabled: boolean;
  email_frequency: string;
  notification_settings?: Record<string, boolean>;
  show_in_team_directory: boolean;
  allow_patient_direct_messaging?: boolean;
  share_calendar_with_team?: boolean;
}

interface UsePreferencesSettingsReturn {
  preferences: UserPreferences | null;
  isLoading: boolean;
  error: string | null;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<void>;
  updateNotificationPreferences: (data: any) => Promise<void>;
  refetch: () => Promise<void>;
}

export function usePreferencesSettings(): UsePreferencesSettingsReturn {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await settingsAPI.getPreferences();
      setPreferences(data);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  const updatePreferences = async (data: Partial<UserPreferences>) => {
    try {
      setError(null);
      const updated = await settingsAPI.updatePreferences(data);
      setPreferences(updated);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      throw err;
    }
  };

  const updateNotificationPreferences = async (data: any) => {
    try {
      setError(null);
      const updated = await settingsAPI.updateNotificationPreferences(data);
      setPreferences(updated);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      throw err;
    }
  };

  const refetch = async () => {
    await fetchPreferences();
  };

  return {
    preferences,
    isLoading,
    error,
    updatePreferences,
    updateNotificationPreferences,
    refetch,
  };
}
