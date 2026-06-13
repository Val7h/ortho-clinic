"use client";

/**
 * MobileDrawer — slide-in lateral para navegação secundária (mobile)
 *
 * Abre a partir de um botão no NavBar (hamburger).
 * Contém: perfil do usuário, links secundários (Financeiro, Usuários, Config),
 * dark mode toggle, e logout.
 *
 * Gestos: swipe-left fecha o drawer.
 * Acessibilidade: focus-trap, aria-dialog, role="navigation".
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  UserCircle,
  DollarSign,
  Settings,
  UserCog,
  LogOut,
  Stethoscope,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ui";
import { useSwipeClose } from "@/components/navigation/useSwipeClose";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  doctor: "Médico",
  secretary: "Secretária",
};

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/painel", label: "Painel Atendimento", icon: Stethoscope },
];

const SECONDARY_LINKS: NavLink[] = [
  {
    href: "/financeiro",
    label: "Financeiro",
    icon: DollarSign,
    roles: ["admin", "superadmin"],
  },
  {
    href: "/usuarios",
    label: "Usuários",
    icon: UserCog,
    roles: ["admin", "superadmin"],
  },
  { href: "/perfil", label: "Configurações", icon: Settings },
];

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const { user, logout, isAdmin } = useAuth();
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw ?? "/";
  const drawerRef = useRef<HTMLDivElement>(null);

  // Swipe-left to close
  const swipeHandlers = useSwipeClose({ onClose, direction: "left" });

  // Focus trap + ESC to close
  useEffect(() => {
    if (!open) return;
    const el = drawerRef.current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'a, button, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const visibleSecondary = SECONDARY_LINKS.filter(
    (l) => !l.roles || (user && l.roles.includes(user.role))
  );

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        data-testid="drawer-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        data-testid="mobile-drawer"
        {...swipeHandlers}
        className={[
          "fixed left-0 top-0 bottom-0 z-50 w-72",
          "bg-white dark:bg-slate-950",
          "border-r border-slate-200 dark:border-slate-800",
          "flex flex-col overflow-hidden",
          "shadow-2xl",
          "lg:hidden",
          "animate-in slide-in-from-left duration-250 ease-out",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-brand-600 to-brand-500">
          <span className="text-white font-bold text-base">OrthoClinic</span>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* User profile */}
        {user && (
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-50 truncate">
              {user.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
        )}

        {/* Scrollable nav area */}
        <nav
          aria-label="Links principais"
          className="flex-1 overflow-y-auto py-2"
        >
          {/* Primary links */}
          {PRIMARY_LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-3 px-4 py-3",
                  "text-sm font-medium",
                  "transition-colors focus:outline-none focus-visible:bg-brand-50 dark:focus-visible:bg-brand-900/30",
                  active
                    ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border-r-2 border-brand-600"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900",
                ].join(" ")}
              >
                <Icon
                  className={["w-5 h-5", active ? "text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-500"].join(" ")}
                  aria-hidden="true"
                />
                {link.label}
              </Link>
            );
          })}

          {/* Divider + secondary links */}
          {visibleSecondary.length > 0 && (
            <>
              <div className="my-2 mx-4 border-t border-slate-100 dark:border-slate-800" />
              {visibleSecondary.map((link) => {
                const active = pathname.startsWith(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 px-4 py-3",
                      "text-sm font-medium",
                      "transition-colors focus:outline-none focus-visible:bg-brand-50 dark:focus-visible:bg-brand-900/30",
                      active
                        ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border-r-2 border-brand-600"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900",
                    ].join(" ")}
                  >
                    <Icon className="w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    {link.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Footer: theme toggle + logout */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <ThemeToggle />
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      </div>
    </>
  );
}
