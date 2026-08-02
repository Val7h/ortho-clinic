'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Button, Input, Card } from '@/components/ui';

function OrthoIcon() {
  // Logomarca OrthoClinic "Articulacao" (Opcao 2 aprovada pelo Dr. Valth):
  // o "O" de Ortho como articulacao bola-e-soquete.
  return (
    <svg width="32" height="32" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="ocg-login" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0F2D5E" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#ocg-login)" />
      <path d="M50 18 a32 32 0 1 0 32 32" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
      <circle cx="63" cy="37" r="14" fill="#22d3ee" />
      <circle cx="58" cy="32" r="4" fill="#fff" opacity="0.85" />
    </svg>
  );
}

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

        </Card>

        <p className="text-center text-sm font-medium text-white/60">
          © {new Date().getFullYear()} OrthoClinic · Premium Edition
        </p>
      </div>
    </div>
  );
}
