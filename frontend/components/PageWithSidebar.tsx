'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { useAuth } from './AuthProvider';

/**
 * Thin wrapper that adds the persistent Sidebar to pages that manage
 * their own NavBar internally (Agenda, Painel, Financeiro, etc.).
 * For pages that need a standard header, use ProtectedPageLayout instead.
 */
export function PageWithSidebar({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="fixed left-0 top-0 h-screen w-64 z-40">
        <Sidebar />
      </div>
      <div className="flex-1 ml-64 overflow-auto">
        {children}
      </div>
    </div>
  );
}
