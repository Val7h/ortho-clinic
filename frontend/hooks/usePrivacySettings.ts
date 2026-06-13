/**
 * usePrivacySettings Hook
 *
 * Manages user privacy settings state and API interactions
 */

import { useState, useEffect } from 'react';
import * as settingsAPI from '@/lib/settings/api';
import { getErrorMessage } from '@/lib/settings/api';

export interface PrivacySettings {
  data_collection_allowed: boolean;
  marketing_emails: boolean;
  analytics_tracking: boolean;
  allow_patient_direct_messaging?: boolean;
  share_calendar_with_team?: boolean;
  terms_of_service_accepted_at?: string;
  privacy_policy_accepted_at?: string;
  cookie_policy_accepted_at?: string;
}

interface UsePrivacySettingsReturn {
  privacy: PrivacySettings | null;
  isLoading: boolean;
  error: string | null;
  updatePrivacy: (data: Partial<PrivacySettings>) => Promise<void>;
  acceptTerms: (termsType: 'terms_of_service' | 'privacy_policy' | 'cookie_policy') => Promise<void>;
  refetch: () => Promise<void>;
}

export function usePrivacySettings(): UsePrivacySettingsReturn {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrivacy = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await settingsAPI.getPrivacySettings();
      setPrivacy(data);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrivacy();
  }, []);

  const updatePrivacy = async (data: Partial<PrivacySettings>) => {
    try {
      setError(null);
      const updated = await settingsAPI.updatePrivacySettings(data);
      setPrivacy((prev) => ({
        ...prev,
        ...updated,
      }));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      throw err;
    }
  };

  const acceptTerms = async (termsType: 'terms_of_service' | 'privacy_policy' | 'cookie_policy') => {
    try {
      setError(null);
      await settingsAPI.acceptTerms(termsType);
      // Refetch to get updated acceptance dates
      await fetchPrivacy();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      throw err;
    }
  };

  const refetch = async () => {
    await fetchPrivacy();
  };

  return {
    privacy,
    isLoading,
    error,
    updatePrivacy,
    acceptTerms,
    refetch,
  };
}
