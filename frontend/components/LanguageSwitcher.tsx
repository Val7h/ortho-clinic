'use client';

import React, { useState } from 'react';
import { useLanguageSwitcher } from '@/lib/i18n/hooks';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'inline' | 'compact';
  showLabel?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function LanguageSwitcher({
  variant = 'dropdown',
  showLabel = true,
  position = 'top-right',
}: LanguageSwitcherProps) {
  const { language, isLoading, switchLanguage } = useLanguageSwitcher();
  const [isOpen, setIsOpen] = useState(false);

  const handleLanguageChange = async (lang: string) => {
    await switchLanguage(lang as any);
    setIsOpen(false);
  };

  if (variant === 'inline') {
    return (
      <div className="flex gap-2 flex-wrap">
        {Object.entries(SUPPORTED_LANGUAGES).map(([code, { name, flag }]) => (
          <button
            key={code}
            onClick={() => handleLanguageChange(code)}
            disabled={isLoading}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              language === code
                ? 'bg-brand-600 text-white shadow-lg'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={name}
          >
            <span className="mr-2">{flag}</span>
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium transition-all disabled:opacity-50"
          title="Change language"
        >
          <Globe className="w-4 h-4" />
          <span>{language.toUpperCase()}</span>
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2">
            {Object.entries(SUPPORTED_LANGUAGES).map(([code, { name, flag }]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  language === code
                    ? 'bg-brand-100 dark:bg-brand-900 text-brand-900 dark:text-brand-100'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="mr-2">{flag}</span>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: dropdown variant
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        aria-label="Select language"
        aria-expanded={isOpen}
      >
        <Globe className="w-4 h-4" />
        {showLabel && <span className="text-sm font-medium">{language}</span>}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            className={`absolute z-50 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[200px] ${
              position.includes('left') ? 'left-0' : 'right-0'
            } ${position.includes('bottom') ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            {Object.entries(SUPPORTED_LANGUAGES).map(([code, { name, flag }]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-3 ${
                  language === code
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 border-l-4 border-brand-600'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-l-4 border-transparent'
                }`}
              >
                <span className="text-xl">{flag}</span>
                <span>{name}</span>
                {language === code && <span className="ml-auto text-brand-600 dark:text-brand-400">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default LanguageSwitcher;
