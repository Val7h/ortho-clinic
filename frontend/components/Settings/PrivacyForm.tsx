'use client';

import React, { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

/**
 * PrivacyForm Component
 *
 * Manages user privacy settings:
 * - Data collection preferences
 * - Marketing emails
 * - Analytics tracking
 * - Patient messaging
 * - Calendar sharing
 * - Terms and policy acceptance tracking
 */

const PrivacySchema = z.object({
  data_collection_allowed: z.boolean(),
  marketing_emails: z.boolean(),
  analytics_tracking: z.boolean(),
  allow_patient_direct_messaging: z.boolean(),
  share_calendar_with_team: z.boolean(),
});

type PrivacyFormData = z.infer<typeof PrivacySchema>;

interface PrivacyFormProps {
  initialData?: Partial<PrivacyFormData>;
  onSubmit: (data: PrivacyFormData) => Promise<void>;
  isLoading?: boolean;
  termsAcceptedAt?: string;
  privacyPolicyAcceptedAt?: string;
  cookiePolicyAcceptedAt?: string;
}

export const PrivacyForm: React.FC<PrivacyFormProps> = ({
  initialData,
  onSubmit,
  isLoading = false,
  termsAcceptedAt,
  privacyPolicyAcceptedAt,
  cookiePolicyAcceptedAt,
}) => {
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PrivacyFormData>({
    resolver: zodResolver(PrivacySchema),
    defaultValues: {
      data_collection_allowed: initialData?.data_collection_allowed ?? true,
      marketing_emails: initialData?.marketing_emails ?? false,
      analytics_tracking: initialData?.analytics_tracking ?? true,
      allow_patient_direct_messaging: initialData?.allow_patient_direct_messaging ?? true,
      share_calendar_with_team: initialData?.share_calendar_with_team ?? false,
    },
  });

  const handleFormSubmit = async (data: PrivacyFormData) => {
    try {
      setErrorMessage('');
      setSuccessMessage('');
      await onSubmit(data);
      setSuccessMessage('Privacy settings updated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update privacy settings';
      setErrorMessage(message);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not accepted';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
      {/* Data Collection Section */}
      <div className="border-l-4 border-blue-500 pl-4 py-2">
        <div className="flex items-start">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="data_collection_allowed"
              {...register('data_collection_allowed')}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="data_collection_allowed" className="text-sm font-medium text-gray-900">
              Allow data collection
            </label>
            <p className="text-sm text-gray-500 mt-1">
              We use this data to improve your experience and provide better services. Your data is encrypted and never shared with third parties.
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Tracking Section */}
      <div className="border-l-4 border-purple-500 pl-4 py-2">
        <div className="flex items-start">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="analytics_tracking"
              {...register('analytics_tracking')}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="analytics_tracking" className="text-sm font-medium text-gray-900">
              Allow analytics tracking
            </label>
            <p className="text-sm text-gray-500 mt-1">
              Help us understand how you use OrthoClinic. This includes anonymized usage patterns and feature performance metrics.
            </p>
          </div>
        </div>
      </div>

      {/* Marketing Emails Section */}
      <div className="border-l-4 border-green-500 pl-4 py-2">
        <div className="flex items-start">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="marketing_emails"
              {...register('marketing_emails')}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="marketing_emails" className="text-sm font-medium text-gray-900">
              Receive marketing emails
            </label>
            <p className="text-sm text-gray-500 mt-1">
              Get updates about new features, special offers, and important announcements. You can unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>

      {/* Patient Direct Messaging Section */}
      <div className="border-l-4 border-indigo-500 pl-4 py-2">
        <div className="flex items-start">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="allow_patient_direct_messaging"
              {...register('allow_patient_direct_messaging')}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="allow_patient_direct_messaging" className="text-sm font-medium text-gray-900">
              Allow patient direct messaging
            </label>
            <p className="text-sm text-gray-500 mt-1">
              Patients can send you direct messages about their appointments and treatments. Essential for communication.
            </p>
          </div>
        </div>
      </div>

      {/* Calendar Sharing Section */}
      <div className="border-l-4 border-orange-500 pl-4 py-2">
        <div className="flex items-start">
          <div className="flex items-center h-6">
            <input
              type="checkbox"
              id="share_calendar_with_team"
              {...register('share_calendar_with_team')}
              className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="share_calendar_with_team" className="text-sm font-medium text-gray-900">
              Share calendar with team
            </label>
            <p className="text-sm text-gray-500 mt-1">
              Team members can view your availability. Useful for scheduling appointments and meetings.
            </p>
          </div>
        </div>
      </div>

      {/* Terms & Policies Section */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Terms & Policies Acceptance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Terms of Service</p>
              <p className="text-xs text-gray-500">
                {termsAcceptedAt ? `Accepted on ${formatDate(termsAcceptedAt)}` : 'Not yet accepted'}
              </p>
            </div>
            {termsAcceptedAt && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✓ Accepted
              </span>
            )}
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Privacy Policy</p>
              <p className="text-xs text-gray-500">
                {privacyPolicyAcceptedAt ? `Accepted on ${formatDate(privacyPolicyAcceptedAt)}` : 'Not yet accepted'}
              </p>
            </div>
            {privacyPolicyAcceptedAt && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✓ Accepted
              </span>
            )}
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Cookie Policy</p>
              <p className="text-xs text-gray-500">
                {cookiePolicyAcceptedAt ? `Accepted on ${formatDate(cookiePolicyAcceptedAt)}` : 'Not yet accepted'}
              </p>
            </div>
            {cookiePolicyAcceptedAt && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✓ Accepted
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="rounded-md bg-green-50 p-4 border border-green-200">
          <p className="text-sm font-medium text-green-800">✓ {successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <p className="text-sm font-medium text-red-800">✗ {errorMessage}</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="inline-flex justify-center items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting || isLoading ? 'Saving...' : 'Save Privacy Settings'}
        </button>
      </div>
    </form>
  );
};

export default PrivacyForm;
