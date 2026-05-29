"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

function OrthoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6a3 3 0 0 0-3-3 3 3 0 0 0-2.1 5.1L6.1 14.9A3 3 0 0 0 3 17a3 3 0 0 0 3 3 3 3 0 0 0 2.1-5.1l6.8-6.8A3 3 0 0 0 18 6z"/>
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  doctor: "Médico",
  secretary: "Secretária",
};

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already logged in → redirect
  useEffect(() => {
    if (!loading && user) router.push("/");
  }, [loading, user, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Erro ao entrar. Verifique suas credenciais.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 60%, #2563EB 100%)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 border border-white/25 mb-4">
            <span className="text-white"><OrthoIcon /></span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">OrthoClinic</h1>
          <p className="text-blue-200/80 text-sm mt-1">Sistema de gestão ortopédica</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-6 text-center">Entrar na conta</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #0F2D5E, #2563EB)" }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Entrando...
                </span>
              ) : "Entrar"}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 text-center">
              Acessos de demonstração
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { email: "medico@clinica.com", pass: "medico123", role: "doctor" },
                { email: "secretaria@clinica.com", pass: "secretaria123", role: "secretary" },
                { email: "admin@clinica.com", pass: "admin123", role: "admin" },
                { email: "super@ortho.app", pass: "super123", role: "superadmin" },
              ].map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword(u.pass); }}
                  className="text-left px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100"
                >
                  <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    {ROLE_LABELS[u.role]}
                  </span>
                  <span className="block text-[10px] text-slate-600 font-mono truncate">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-blue-200/50 text-[11px] mt-6">
          © {new Date().getFullYear()} OrthoClinic · v2.0
        </p>
      </div>
    </div>
  );
}
