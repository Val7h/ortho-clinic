"use client";
import { ChevronLeft, LogOut, Users, ChevronDown, User, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ui";
import { Logo } from "./Logo";
import { useNavigation } from "@/components/navigation/NavigationProvider";
import dynamic from "next/dynamic";

/**
 * NotificationCenter imports date-fns/locale/ptBR (~20KB) and the
 * push-notifications lib. Lazy-loading it removes those bytes from the
 * NavBar critical path and defers them until the bell icon is first rendered.
 */
const NotificationCenter = dynamic(
  () => import("@/components/NotificationCenter"),
  {
    loading: () => (
      <div className="w-8 h-8 rounded-lg bg-white/10 animate-pulse" />
    ),
    ssr: false,
  }
);

interface NavBarProps {
  title: string;
  subtitle?: string;
  back?: string | true;
  actions?: React.ReactNode;
}

function OrthoIcon() {
  // Logomarca OrthoClinic "Articulacao" (Opcao 2 aprovada pelo Dr. Valth):
  // o "O" de Ortho como articulacao bola-e-soquete.
  return (
    <svg width="32" height="32" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="ocg-nav" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0F2D5E" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#ocg-nav)" />
      <path d="M50 18 a32 32 0 1 0 32 32" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
      <circle cx="63" cy="37" r="14" fill="#22d3ee" />
      <circle cx="58" cy="32" r="4" fill="#fff" opacity="0.85" />
    </svg>
  );
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  doctor: "Médico",
  secretary: "Secretária",
};

function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar menu de usuário" : "Abrir menu de usuário"}
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 transition-colors border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
      >
        <div className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="hidden sm:block text-xs font-semibold text-white max-w-[100px] truncate">
          {user.name}
        </span>
        <ChevronDown className={`w-3 h-3 text-white/70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-950 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50" role="menu">
          {/* User info */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-50 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
              {ROLE_LABEL[user.role] || user.role}
            </span>
          </div>

          {/* Actions */}
          <div className="py-1">
            {isAdmin && (
              <button
                onClick={() => { setOpen(false); router.push("/usuarios"); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-900"
                role="menuitem"
              >
                <Users className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Gerenciar usuários
              </button>
            )}
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors focus:outline-none focus:bg-red-50 dark:focus:bg-red-950/30"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NavBar({ title, subtitle, back, actions }: NavBarProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // NavigationProvider is always mounted in the root layout — safe to call unconditionally
  const { toggleDrawer } = useNavigation();

  const handleBack = () => {
    if (typeof back === "string") router.push(back);
    else router.back();
  };

  return (
    <header
      className="sticky top-0 z-20 no-print"
      style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">

        {back ? (
          <button
            onClick={handleBack}
            className="p-2 -ml-1.5 rounded-xl hover:bg-white/15 active:bg-white/25 transition-colors"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        ) : (
          <div className="flex items-center gap-1 mr-1">
            {/* Hamburger — mobile only, hidden when sidebar is visible */}
            <button
              onClick={toggleDrawer}
              aria-label="Abrir menu de navegação"
              className="md:hidden p-2 rounded-xl hover:bg-white/15 active:bg-white/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              data-testid="nav-hamburger"
            >
              <Menu className="w-5 h-5 text-white" aria-hidden="true" />
            </button>
            <span className="hidden md:block">
              <Logo width={45} height={45} />
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-[15px] truncate leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-blue-200/80 truncate leading-tight mt-0.5">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-white" suppressHydrationWarning>
          {actions}
          <ThemeToggle />
          <NotificationCenter />
          {mounted && <UserMenu />}
        </div>
      </div>
    </header>
  );
}
