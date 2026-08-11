"use client";

/**
 * /perfil — perfil do usuário logado + configurações
 *
 * Rota tab "Perfil" da navegação inferior.
 */

import { useState } from "react";
import { User, Mail, Shield, Moon, Sun, LogOut, ChevronRight, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPageLayout } from "@/components/ProtectedPageLayout";
import { ThemeToggle } from "@/components/ui";
import { authApi, msgErro } from "@/lib/api";
import toast from "react-hot-toast";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  doctor: "Médico",
  secretary: "Secretária",
};

export default function PerfilPage() {
  const { user, logout } = useAuth();

  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  const trocarSenha = async () => {
    if (!atual || !nova) { toast.error("Preencha a senha atual e a nova."); return; }
    if (nova.length < 8) { toast.error("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (nova !== confirma) { toast.error("A confirmação não confere com a nova senha."); return; }
    setSalvando(true);
    try {
      await authApi.changePassword(atual, nova);
      setAtual(""); setNova(""); setConfirma("");
      toast.success("Senha alterada! Use a nova no próximo login.");
    } catch (err: any) {
      toast.error(msgErro(err, "Não foi possível trocar a senha."));
    } finally {
      setSalvando(false);
    }
  };

  if (!user) return null;

  return (
    <ProtectedPageLayout title="Perfil">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-20 h-20 rounded-2xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
            <User className="w-9 h-9 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{user.name}</p>
            <span className="inline-block mt-1 text-xs px-3 py-0.5 rounded-full font-bold uppercase tracking-wide bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
        </div>

        {/* Info card */}
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">E-mail</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Shield className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Função</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Aparência</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tema claro ou escuro</p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Trocar senha (endpoint /auth/change-password já existia; faltava a tela) */}
        <div className="card px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Trocar senha</p>
          </div>
          <input
            type="password"
            value={atual}
            onChange={e => setAtual(e.target.value)}
            placeholder="Senha atual"
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="password"
            value={nova}
            onChange={e => setNova(e.target.value)}
            placeholder="Nova senha (mínimo 8 caracteres)"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="password"
            value={confirma}
            onChange={e => setConfirma(e.target.value)}
            placeholder="Confirmar nova senha"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={trocarSenha}
            disabled={salvando}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Salvar nova senha
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3.5 card text-left hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <LogOut className="w-4 h-4 text-red-500 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400 flex-1">Sair da conta</span>
          <ChevronRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
        </button>

      </div>
    </ProtectedPageLayout>
  );
}
