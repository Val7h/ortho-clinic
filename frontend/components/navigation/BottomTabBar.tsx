"use client";

/**
 * BottomTabBar — navegação inferior para mobile (< lg)
 *
 * Tabs: Dashboard · Agenda · Pacientes · Documentos · Perfil
 * - Esconde em lg+ (usa Sidebar)
 * - Safe-area para dispositivos com home indicator (iOS)
 * - Badge de notificação opcional por tab
 * - Acessibilidade: aria-current, role="tablist", rótulos VoiceOver/TalkBack
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, Users, FileText, UserCircle } from "lucide-react";
import { useNotificationBadge } from "@/components/navigation/useNotificationBadge";

export interface TabItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Mostra badge vermelho quando > 0 */
  badge?: number;
  /** Padrão de pathname que considera esta tab ativa (regex ou string prefix) */
  matchPrefix?: string;
}

function isTabActive(pathname: string, item: TabItem): boolean {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  if (item.href === "/") return pathname === "/";
  return pathname.startsWith(item.href);
}

export default function BottomTabBar() {
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw ?? "/";
  const { agendaBadge, documentosBadge } = useNotificationBadge();

  const TABS: TabItem[] = [
    {
      href: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      matchPrefix: undefined,
    },
    {
      href: "/agenda",
      label: "Agenda",
      icon: Calendar,
      badge: agendaBadge,
      matchPrefix: "/agenda",
    },
    {
      href: "/pacientes",
      label: "Pacientes",
      icon: Users,
      matchPrefix: "/pacientes",
    },
    {
      href: "/documentos",
      label: "Documentos",
      icon: FileText,
      badge: documentosBadge,
      matchPrefix: "/documentos",
    },
    {
      href: "/perfil",
      label: "Perfil",
      icon: UserCircle,
      matchPrefix: "/perfil",
    },
  ];

  // Não renderiza no login nem em rotas PÚBLICAS (paciente sem login) — a paciente
  // que abre um link de anamnese/pré-consulta NÃO deve ver a navegação da clínica.
  const isPublicRoute = [
    "/login", "/confirmar", "/privacidade", "/termos", "/contrato",
    "/anamnese/", "/pre-consulta", "/agendar", "/documentos/publico",
  ].some((r) => (pathname as string).startsWith(r));
  if (isPublicRoute) return null;

  return (
    <nav
      role="tablist"
      aria-label="Navegação principal"
      data-testid="bottom-tab-bar"
      className={[
        // Visível apenas em mobile; md+ usa a Sidebar
        "md:hidden",
        "fixed bottom-0 left-0 right-0 z-40",
        "bg-white dark:bg-slate-950",
        "border-t border-slate-200 dark:border-slate-800",
        // Safe-area padding para iPhone com home indicator
        "pb-safe",
        "h-16",
        "flex items-center justify-around",
        "shadow-[0_-2px_12px_rgba(0,0,0,0.06)]",
      ].join(" ")}
    >
      {TABS.map((tab) => {
        const active = isTabActive(pathname, tab);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
            data-testid={`tab-${tab.label.toLowerCase()}`}
            className={[
              "relative flex flex-col items-center justify-center",
              "w-14 h-14 rounded-xl",
              "transition-all duration-200 ease-out",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              "active:scale-90",
              active
                ? "text-brand-600 dark:text-brand-400"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300",
            ].join(" ")}
          >
            {/* Pill indicator for active tab */}
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-brand-600 dark:bg-brand-400"
              />
            )}

            {/* Icon with badge */}
            <span className="relative">
              <Icon
                className={["w-6 h-6 transition-transform", active ? "scale-110" : ""].join(" ")}
                strokeWidth={active ? 2.2 : 1.8}
                aria-hidden="true"
              />
              {!!tab.badge && (
                <span
                  aria-label={`${tab.badge} notificações`}
                  className={[
                    "absolute -top-1 -right-1",
                    "min-w-[16px] h-4 px-0.5",
                    "flex items-center justify-center",
                    "bg-red-500 text-white",
                    "text-[9px] font-bold rounded-full",
                  ].join(" ")}
                >
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </span>

            <span className="text-[10px] mt-0.5 font-medium leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
