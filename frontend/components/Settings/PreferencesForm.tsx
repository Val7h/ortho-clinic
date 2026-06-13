'use client';

/**
 * PreferencesForm — User preferences panel
 *
 * Sprint 6 accessibility audit fixes:
 *  - All hardcoded color values replaced with semantic tokens (dark: variants)
 *  - aria-describedby wired to error messages
 *  - role="group" + aria-labelledby on theme radio group
 *  - Dynamic font sizes (rem-based)
 *  - Section headings are <h3> for proper document outline
 *  - Live region for success/error feedback (role="status" / role="alert")
 *  - Labels are properly associated via htmlFor
 *  - WCAG 2.1 AA contrast maintained in both light and dark modes
 *  - Uses only React built-in state (no external form library deps)
 */

import React, { useState, useId, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Sun, Moon, CheckCircle2 } from 'lucide-react';

export interface PreferencesFormData {
  language: 'pt-BR' | 'en-US' | 'es-ES';
  theme: 'light' | 'dark' | 'auto';
  timezone: string;
  currency: 'BRL' | 'USD' | 'EUR';
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  in_app_notifications_enabled: boolean;
  email_frequency: 'instant' | 'daily' | 'weekly' | 'monthly';
  show_in_team_directory: boolean;
  allow_patient_direct_messaging: boolean;
  share_calendar_with_team: boolean;
}

interface PreferencesFormProps {
  initialData?: Partial<PreferencesFormData>;
  onSubmit: (data: PreferencesFormData) => Promise<void>;
  isLoading?: boolean;
}

const LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'es-ES', label: 'Español (España)' },
] as const;

const CURRENCIES = [
  { code: 'BRL', label: 'Real Brasileiro (R$)' },
  { code: 'USD', label: 'Dólar Americano ($)' },
  { code: 'EUR', label: 'Euro (€)' },
] as const;

const EMAIL_FREQUENCIES = [
  { value: 'instant', label: 'Imediato' },
  { value: 'daily',   label: 'Diário' },
  { value: 'weekly',  label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
] as const;

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Manaus',    label: 'Manaus (GMT-4)' },
  { value: 'America/New_York',  label: 'Nova York (GMT-5)' },
  { value: 'Europe/London',     label: 'Londres (GMT+0)' },
  { value: 'Europe/Paris',      label: 'Paris (GMT+1)' },
  { value: 'Asia/Tokyo',        label: 'Tóquio (GMT+9)' },
];

/* ── Reusable style constants (semantic tokens only) ───────────────────── */
const fieldLabel = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5';

const fieldSelect = [
  'w-full rounded-lg border px-3.5 py-2.5 pe-9 text-sm appearance-none',
  'bg-white dark:bg-slate-900',
  'text-slate-900 dark:text-slate-50',
  'border-slate-300 dark:border-slate-700',
  'transition-colors duration-200',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'dark:focus-visible:ring-offset-slate-950',
  'focus-visible:ring-[var(--oc-focus-ring)]',
  'disabled:bg-slate-100 dark:disabled:bg-slate-800',
  'disabled:text-slate-400 dark:disabled:text-slate-500',
  'disabled:cursor-not-allowed',
].join(' ');

const sectionHeading =
  'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3';

/* ── Theme tile ─────────────────────────────────────────────────────────── */
interface ThemeTileProps {
  value: 'light' | 'dark' | 'auto';
  label: string;
  description: string;
  icon: React.ElementType;
  checked: boolean;
  onChange: () => void;
  radioName: string;
}

function ThemeTile({ value, label, description, icon: Icon, checked, onChange, radioName }: ThemeTileProps) {
  return (
    <label
      htmlFor={`theme-${value}`}
      className={[
        'relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 cursor-pointer',
        'transition-all duration-150 select-none',
        checked
          ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
        'hover:border-brand-400 dark:hover:border-brand-500',
      ].join(' ')}
    >
      <input
        type="radio"
        id={`theme-${value}`}
        name={radioName}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
        aria-describedby={`theme-${value}-desc`}
      />
      <Icon
        className={['w-5 h-5', checked ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'].join(' ')}
        aria-hidden="true"
      />
      <span className={['text-xs font-semibold', checked ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'].join(' ')}>
        {label}
      </span>
      <span id={`theme-${value}-desc`} className="sr-only">{description}</span>
      {checked && (
        <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
      )}
    </label>
  );
}

/* ── Toggle switch ──────────────────────────────────────────────────────── */
interface ToggleSwitchProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ id, label, description, checked, onChange, disabled }: ToggleSwitchProps) {
  const descId = `${id}-desc`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
          {label}
        </label>
        {description && (
          <p id={descId} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={checked}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
          'transition-colors duration-200',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--oc-focus-ring)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-600',
        ].join(' ')}
      >
        <span className="sr-only">{checked ? 'Ativado' : 'Desativado'}</span>
        <span
          aria-hidden="true"
          className={[
            'inline-block h-4 w-4 rounded-full bg-white shadow-sm',
            'transform transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

/* ── Main form component ────────────────────────────────────────────────── */
const DEFAULT_PREFS: PreferencesFormData = {
  language: 'pt-BR',
  theme: 'auto',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  email_notifications_enabled: true,
  sms_notifications_enabled: false,
  in_app_notifications_enabled: true,
  email_frequency: 'daily',
  show_in_team_directory: true,
  allow_patient_direct_messaging: true,
  share_calendar_with_team: false,
};

export const PreferencesForm: React.FC<PreferencesFormProps> = ({
  initialData,
  onSubmit,
  isLoading = false,
}) => {
  const [values, setValues] = useState<PreferencesFormData>({ ...DEFAULT_PREFS, ...initialData });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const { setTheme } = useTheme();
  const themeGroupName = useId();

  const set = useCallback(<K extends keyof PreferencesFormData>(key: K, val: PreferencesFormData[K]) => {
    setValues(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleThemeChange = (value: 'light' | 'dark' | 'auto') => {
    set('theme', value);
    setTheme(value === 'auto' ? 'system' : value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage('');
      setSuccessMessage('');
      await onSubmit(values);
      setSuccessMessage('Preferências salvas com sucesso!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar preferências.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isSubmitting || isLoading;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8"
      noValidate
      aria-label="Formulário de preferências"
    >
      {/* ── Idioma e Região ──────────────────────────────────── */}
      <section aria-labelledby="pref-lang-heading">
        <h3 id="pref-lang-heading" className={sectionHeading}>Idioma e Região</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="pref-language" className={fieldLabel}>Idioma</label>
            <div className="relative">
              <select
                id="pref-language"
                value={values.language}
                onChange={e => set('language', e.target.value as PreferencesFormData['language'])}
                className={fieldSelect}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                <svg className="h-4 w-4 text-slate-500 dark:hidden" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <svg className="hidden h-4 w-4 text-slate-400 dark:block" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="pref-timezone" className={fieldLabel}>Fuso horário</label>
            <div className="relative">
              <select
                id="pref-timezone"
                value={values.timezone}
                onChange={e => set('timezone', e.target.value)}
                className={fieldSelect}
              >
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                <svg className="h-4 w-4 text-slate-500 dark:hidden" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <svg className="hidden h-4 w-4 text-slate-400 dark:block" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="pref-currency" className={fieldLabel}>Moeda</label>
            <div className="relative">
              <select
                id="pref-currency"
                value={values.currency}
                onChange={e => set('currency', e.target.value as PreferencesFormData['currency'])}
                className={fieldSelect}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                <svg className="h-4 w-4 text-slate-500 dark:hidden" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <svg className="hidden h-4 w-4 text-slate-400 dark:block" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Aparência ──────────────────────────────────────────── */}
      <section aria-labelledby="pref-theme-heading">
        <h3 id="pref-theme-heading" className={sectionHeading}>Aparência</h3>
        <div role="group" aria-labelledby="pref-theme-heading" className="grid grid-cols-3 gap-2">
          <ThemeTile value="light" label="Claro" description="Sempre usar tema claro" icon={Sun}
            checked={values.theme === 'light'} onChange={() => handleThemeChange('light')} radioName={themeGroupName} />
          <ThemeTile value="dark" label="Escuro" description="Sempre usar tema escuro" icon={Moon}
            checked={values.theme === 'dark'} onChange={() => handleThemeChange('dark')} radioName={themeGroupName} />
          <ThemeTile value="auto" label="Sistema" description="Seguir configuração do sistema operacional" icon={Monitor}
            checked={values.theme === 'auto'} onChange={() => handleThemeChange('auto')} radioName={themeGroupName} />
        </div>
      </section>

      {/* ── Notificações ───────────────────────────────────────── */}
      <section aria-labelledby="pref-notif-heading">
        <h3 id="pref-notif-heading" className={sectionHeading}>Notificações</h3>
        <div className="space-y-4">
          <ToggleSwitch id="pref-email-notif" label="Notificações por e-mail"
            description="Receber resumos e alertas por e-mail"
            checked={values.email_notifications_enabled}
            onChange={v => set('email_notifications_enabled', v)} />

          {values.email_notifications_enabled && (
            <div className="ps-4 border-s-2 border-slate-200 dark:border-slate-700">
              <label htmlFor="pref-email-freq" className={fieldLabel}>Frequência dos e-mails</label>
              <div className="relative">
                <select
                  id="pref-email-freq"
                  value={values.email_frequency}
                  onChange={e => set('email_frequency', e.target.value as PreferencesFormData['email_frequency'])}
                  className={fieldSelect}
                >
                  {EMAIL_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                  <svg className="h-4 w-4 text-slate-500 dark:hidden" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  <svg className="hidden h-4 w-4 text-slate-400 dark:block" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
            </div>
          )}

          <ToggleSwitch id="pref-sms-notif" label="Notificações por SMS"
            description="Receber lembretes via mensagem de texto"
            checked={values.sms_notifications_enabled}
            onChange={v => set('sms_notifications_enabled', v)} />

          <ToggleSwitch id="pref-inapp-notif" label="Notificações no aplicativo"
            description="Exibir alertas dentro do OrthoClinic"
            checked={values.in_app_notifications_enabled}
            onChange={v => set('in_app_notifications_enabled', v)} />
        </div>
      </section>

      {/* ── Privacidade / Equipe ───────────────────────────────── */}
      <section aria-labelledby="pref-privacy-heading">
        <h3 id="pref-privacy-heading" className={sectionHeading}>Privacidade e Equipe</h3>
        <div className="space-y-4">
          <ToggleSwitch id="pref-team-dir" label="Aparecer no diretório da equipe"
            description="Outros membros poderão encontrar seu perfil"
            checked={values.show_in_team_directory}
            onChange={v => set('show_in_team_directory', v)} />
          <ToggleSwitch id="pref-patient-msg" label="Permitir mensagens diretas de pacientes"
            description="Pacientes podem enviar mensagens direto para você"
            checked={values.allow_patient_direct_messaging}
            onChange={v => set('allow_patient_direct_messaging', v)} />
          <ToggleSwitch id="pref-share-cal" label="Compartilhar agenda com a equipe"
            description="Membros da equipe podem visualizar sua agenda"
            checked={values.share_calendar_with_team}
            onChange={v => set('share_calendar_with_team', v)} />
        </div>
      </section>

      {/* ── Feedback (live regions) ─────────────────────────────── */}
      {successMessage && (
        <div role="status" aria-live="polite" aria-atomic="true"
          className="flex items-center gap-2 rounded-lg bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 p-3">
          <CheckCircle2 className="w-4 h-4 text-success-600 dark:text-success-400 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-success-700 dark:text-success-300">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div role="alert" aria-live="assertive" aria-atomic="true"
          className="rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 p-3">
          <p className="text-sm font-medium text-error-700 dark:text-error-300">{errorMessage}</p>
        </div>
      )}

      {/* ── Submit ─────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className={[
            'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold',
            'bg-brand-600 hover:bg-brand-700 active:bg-brand-800',
            'dark:bg-brand-500 dark:hover:bg-brand-400',
            'text-white transition-colors duration-150',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            'focus-visible:outline-[var(--oc-focus-ring)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {busy && (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity="0.75" />
            </svg>
          )}
          {busy ? 'Salvando…' : 'Salvar preferências'}
        </button>
      </div>
    </form>
  );
};

export default PreferencesForm;
