'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import PatientCard from '@/components/PatientCard';
import { patientsApi } from '@/lib/api';
import { useProtectedPage } from '@/components/AuthProvider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function PatientsPage() {
  const { user, loading: authLoading } = useProtectedPage();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await patientsApi.list(q);
      setPatients(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar
        title="Pacientes"
        back="/"
        actions={
          <Link href="/pacientes/novo">
            <Button size="md" icon={<Plus className="h-5 w-5" />}>
              Novo paciente
            </Button>
          </Link>
        }
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* Busca */}
        <Input
          type="search"
          placeholder="Buscar por nome, CPF, email ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="h-5 w-5" />}
          iconPosition="left"
          fullWidth
        />

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} shadow="sm">
                <div className="h-20 animate-pulse bg-gradient-to-r from-slate-200 to-slate-100" />
              </Card>
            ))}
          </div>
        ) : patients.length === 0 ? (
          <Card shadow="sm">
            <div className="space-y-4 py-16 text-center">
              <div className="flex justify-center">
                <div className="rounded-full bg-slate-100 p-4">
                  <Users className="h-8 w-8 text-slate-400" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {search
                    ? 'Tente ajustar os filtros de busca'
                    : 'Comece cadastrando seu primeiro paciente'}
                </p>
              </div>
              {!search && (
                <Link href="/pacientes/novo">
                  <Button variant="primary">Cadastrar primeiro paciente</Button>
                </Link>
              )}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-slate-600">
                {patients.length} paciente{patients.length !== 1 ? 's' : ''}
              </p>
            </div>
            {patients.map((p) => (
              <PatientCard key={p.id} patient={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
