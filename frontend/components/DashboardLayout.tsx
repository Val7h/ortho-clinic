'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router, isMounted]);

  if (!isMounted || loading) {
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
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - sempre presente */}
      <Sidebar />

      {/* Conteúdo Principal */}
      <main className="flex-1 ml-64 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
