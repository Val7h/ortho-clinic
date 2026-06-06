'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { Logo } from './Logo';

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detectar se está em mobile
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Fechar sidebar em mobile ao navegar
    if (isMobile) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }
  }, [pathname, isMobile]);

  const menuItems = [
    {
      label: 'Dashboard',
      href: '/',
      icon: '📊',
      roles: ['admin', 'doctor', 'secretary'],
    },
    {
      label: 'Pacientes',
      href: '/pacientes',
      icon: '👥',
      roles: ['admin', 'doctor', 'secretary'],
    },
    {
      label: 'Consultas',
      href: '/agenda',
      icon: '📅',
      roles: ['admin', 'doctor', 'secretary'],
    },
    {
      label: 'Receitas',
      href: '/pacientes',
      icon: '💊',
      roles: ['admin', 'doctor'],
    },
    {
      label: 'Anamnese',
      href: '/anamnese',
      icon: '📝',
      roles: ['admin', 'doctor'],
    },
    {
      label: 'Painel Atendimento',
      href: '/painel',
      icon: '⏱️',
      roles: ['admin', 'doctor', 'secretary'],
    },
    {
      label: 'Financeiro',
      href: '/financeiro',
      icon: '💰',
      roles: ['admin'],
    },
    {
      label: 'Usuários',
      href: '/usuarios',
      icon: '🔑',
      roles: ['admin'],
    },
    {
      label: 'Clínicas',
      href: '/clinicas',
      icon: '🏥',
      roles: ['admin'],
    },
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
      {/* Botão toggle para mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 p-2 lg:hidden bg-blue-600 text-white rounded-md"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-blue-900 to-blue-800 text-white overflow-y-auto transition-all duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 z-40`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-blue-700 flex justify-center">
          <Logo width={160} />
        </div>

        {/* Menu Principal */}
        <nav className="p-4">
          <p className="text-xs font-semibold text-blue-300 mb-3 uppercase">Menu Principal</p>

          <div className="space-y-2">
            {filteredMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // Fechar sidebar apenas em mobile ao navegar
                  if (isMobile) {
                    setIsOpen(false);
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive(item.href)
                    ? 'bg-white text-blue-900 font-semibold shadow-lg'
                    : 'text-blue-100 hover:bg-blue-700 hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        {/* Divisor */}
        <div className="mx-4 my-4 border-t border-blue-700"></div>

        {/* Perfil do Usuário */}
        <div className="p-4">
          <p className="text-xs font-semibold text-blue-300 mb-3 uppercase">Minha Conta</p>

          <div className="bg-blue-700 rounded-lg p-3 mb-3">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-blue-200 truncate">{user?.email}</p>
            <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-600 rounded">
              {user?.role === 'doctor' && '👨‍⚕️ Médico'}
              {user?.role === 'secretary' && '👩‍💼 Secretária'}
              {user?.role === 'admin' && '⚙️ Admin'}
            </span>
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

      {/* Overlay para mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
