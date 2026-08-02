'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Button, Input, Card } from '@/components/ui';

function OrthoIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6a3 3 0 0 0-3-3 3 3 0 0 0-2.1 5.1L6.1 14.9A3 3 0 0 0 3 17a3 3 0 0 0 3 3 3 3 0 0 0 2.1-5.1l6.8-6.8A3 3 0 0 0 18 6z" />
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  doctor: 'Médico',
  secretary: 'Secretária',
};

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in → redirect
  useEffect(() => {
    if (!loading && user) router.push('/');
  }, [loading, user, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || 'Erro ao entrar. Verifique suas credenciais.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 dark:border-brand-800 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo & Branding */}
        {/* Login é a cara do PRODUTO (OrthoClinic). A marca da clínica usuária
            (OrthoMedic) aparece depois do login: sidebar + documentos. */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-white/20 p-4 backdrop-blur-sm">
            <div className="text-white">
              <OrthoIcon />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white">OrthoClinic</h1>
          <p className="mt-2 text-base font-medium text-white/80">Gestão Ortopédica Premium</p>
        </div>

        {/* Login Card */}
        <Card padding="lg" shadow="lg" className="mb-6">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900 dark:text-slate-50">Bem-vindo!</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              type="email"
              label="E-mail"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="h-5 w-5" />}
              iconPosition="left"
              required
              aria-required="true"
              disabled={submitting}
            />

            <Input
              type="password"
              label="Senha"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="h-5 w-5" />}
              iconPosition="left"
              required
              aria-required="true"
              disabled={submitting}
            />

            {error && (
              <div className="flex items-start gap-3 rounded-lg bg-error-50 dark:bg-error-950/40 p-4 border border-error-200 dark:border-error-700">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-error-600 dark:text-error-400" />
                <p className="text-sm font-medium text-error-700 dark:text-error-300">{error}</p>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" isLoading={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-6">
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Demonstração
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { email: 'medico@clinica.com', pass: 'medico123', role: 'doctor' },
                { email: 'secretaria@clinica.com', pass: 'secretaria123', role: 'secretary' },
                { email: 'admin@clinica.com', pass: 'admin123', role: 'admin' },
                { email: 'super@ortho.app', pass: 'super123', role: 'superadmin' },
              ].map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword(u.pass);
                  }}
                  className="flex flex-col gap-1 rounded-lg bg-brand-50 dark:bg-brand-900/40 p-3 text-left transition-all hover:bg-brand-100 dark:hover:bg-brand-900/60 hover:shadow-sm border border-brand-200 dark:border-brand-700"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                    {ROLE_LABELS[u.role]}
                  </span>
                  <span className="truncate text-xs text-slate-600 dark:text-slate-400 font-mono">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <p className="text-center text-sm font-medium text-white/60">
          © {new Date().getFullYear()} OrthoClinic · Premium Edition
        </p>
      </div>
    </div>
  );
}
