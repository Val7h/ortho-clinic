'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import NavBar from './NavBar';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedPageLayoutProps {
  title: string;
  subtitle?: string;
  back?: string | true;
  actions?: ReactNode;
  children: ReactNode;
}

export function ProtectedPageLayout({
  title,
  subtitle,
  back,
  actions,
  children
}: ProtectedPageLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar — montada uma única vez, visibilidade por CSS */}
      <div className="hidden md:block fixed left-0 top-0 h-screen w-64 z-40 border-r border-gray-200">
        <Sidebar />
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-1 md:ml-64 overflow-auto flex flex-col">
        <NavBar
          title={title}
          subtitle={subtitle}
          back={back}
          actions={actions}
        />

        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
