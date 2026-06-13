"use client";

/**
 * /perfil — perfil do usuário logado + configurações
 *
 * Rota tab "Perfil" da navegação inferior.
 */

import { User, Mail, Shield, Moon, Sun, LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPageLayout } from "@/components/ProtectedPageLayout";
import { ThemeToggle } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  doctor: "Médico",
  secretary: "Secretária",
};

export default function PerfilPage() {
  const { user, logout } = useAuth();

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
