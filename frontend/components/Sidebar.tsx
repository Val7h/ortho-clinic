'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { Logo } from './Logo';
import { Monitor } from 'lucide-react';

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const menuItems = [
    // --- Fluxo clínico diário ---
    { label: 'Agenda',        href: '/agenda',     icon: '📅', group: 'clinic', roles: ['admin', 'superadmin', 'doctor', 'secretary'] },
    { label: 'Pacientes',     href: '/pacientes',  icon: '👥', group: 'clinic', roles: ['admin', 'superadmin', 'doctor', 'secretary'] },
    { label: 'Sala de Espera',href: '/painel',     icon: null,  group: 'clinic', roles: ['admin', 'superadmin', 'doctor', 'secretary'] },
    // Caixa do Dia (decisão Valth 02/08): secretária registra pagamentos e vê
    // só o total de HOJE — a página /financeiro se adapta pelo papel.
    { label: 'Caixa do Dia',  href: '/financeiro', icon: '💰', group: 'clinic', roles: ['secretary'] },
    // Documentos FICA no menu (Valth 02/08): além do prontuário por paciente,
    // a página guarda FOLHETOS informativos e CONTRATOS da clínica.
    { label: 'Documentos',    href: '/documentos', icon: '📄', group: 'clinic', roles: ['admin', 'superadmin', 'doctor'] },
    { label: 'Dashboard',     href: '/',           icon: '📊', group: 'clinic', roles: ['admin', 'superadmin', 'doctor'] },
    // --- Administrativo ---
    { label: 'Financeiro',    href: '/financeiro', icon: '💰', group: 'admin', roles: ['admin', 'superadmin', 'doctor'] },
    { label: 'Equipe',        href: '/usuarios',   icon: '👤', group: 'admin', roles: ['admin', 'superadmin'] },
    { label: 'Configurações', href: '/clinicas',   icon: '⚙️', group: 'admin', roles: ['admin', 'superadmin'] },
  ];

  const filteredMenuItems = menuItems.filter(
    item => !user || item.roles.includes(user.role)
  );

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      {/* Sidebar — sempre visível */}
      <aside
        className="fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-blue-900 to-blue-800 text-white overflow-y-auto z-40"
      >
        {/* Logomarca OrthoMedic (pedido do Dr. Valth) */}
        <div className="p-4 border-b border-blue-700 flex flex-col items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/orthomedic-logo.png" alt="OrthoMedic" className="h-16 w-16 rounded-xl object-cover shadow" />
          <p className="text-sm font-bold tracking-widest"><span className="text-white">ORTHO</span><span className="text-teal-300">MEDIC</span></p>
        </div>

        {/* Menu Principal */}
        <nav className="p-4 flex-1">
          <p className="text-xs font-semibold text-blue-300 mb-3 uppercase tracking-wider">Clínica</p>

          <div className="space-y-1">
            {filteredMenuItems.map((item, idx) => {
              const isAdminItem = item.group === 'admin';
              const prevIsNotAdmin = idx > 0 && filteredMenuItems[idx - 1].group !== 'admin';
              return (
                <div key={item.href}>
                  {isAdminItem && prevIsNotAdmin && (
                    <div className="pt-3 pb-2">
                      <div className="border-t border-blue-700 mb-2" />
                      <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider px-1">Administração</p>
                    </div>
                  )}
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                      isActive(item.href)
                        ? 'bg-white text-blue-900 font-semibold shadow-md'
                        : 'text-blue-100 hover:bg-blue-700 hover:text-white'
                    }`}
                  >
                    {item.icon === null ? (
                      <Monitor className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <span className="text-lg w-6 text-center">{item.icon}</span>
                    )}
                    <span>{item.label}</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Divisor */}
        <div className="mx-4 my-4 border-t border-blue-700"></div>

        {/* Perfil do Usuário */}
        <div className="p-4">
          <p className="text-xs font-semibold text-blue-300 mb-3 uppercase">Minha Conta</p>

          <div className="bg-blue-700 rounded-lg p-3 mb-3" suppressHydrationWarning>
            {mounted && (
              <>
                <p className="text-sm font-semibold truncate">{user?.name}</p>
                <p className="text-xs text-blue-200 truncate">{user?.email}</p>
                <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-600 rounded">
                  {user?.role === 'doctor' && '👨‍⚕️ Médico'}
                  {user?.role === 'secretary' && '👩‍💼 Secretária'}
                  {user?.role === 'admin' && '⚙️ Admin'}
                </span>
              </>
            )}
          </div>

          {/* Botão Logout */}
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-all"
          >
            Sair
          </button>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-blue-700 text-center">
          <p className="text-xs text-blue-300">© 2026 OrthoClinic</p>
          <p className="text-xs text-blue-400">v2.0.0 Premium</p>
        </div>
      </aside>

    </>
  );
}
