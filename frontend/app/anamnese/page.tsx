'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Search, ChevronRight, Send } from 'lucide-react';
import { ProtectedPageLayout } from '@/components/ProtectedPageLayout';
import { api } from '@/lib/api';
import { Card, Button, Badge, Input } from '@/components/ui';

export default function AnamnesePage() {
  const router = useRouter();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/patients')
      .then((r) => setPatients(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.name?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s);
  });

  return (
    <ProtectedPageLayout
      title="Anamnese"
      subtitle="Histórico de saúde dos pacientes"
      back="/"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 px-4 py-3 text-sm text-brand-800 dark:text-brand-300">
          Selecione um paciente para visualizar ou enviar um formulário de anamnese.
        </div>

        <Input
          type="search"
          placeholder="Buscar paciente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="h-5 w-5" />}
          iconPosition="left"
          fullWidth
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card shadow="sm">
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4">
                <BookOpen className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {search ? 'Tente ajustar a busca' : 'Cadastre pacientes para enviar formulários de anamnese'}
              </p>
              {!search && (
                <Button variant="primary" onClick={() => router.push('/pacientes/novo')}>
                  Cadastrar paciente
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 px-1">
              {filtered.length} paciente{filtered.length !== 1 ? 's' : ''}
            </p>
            <Card shadow="sm">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 px-5 py-3.5"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
                      <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {p.email || 'Sem e-mail'}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        onClick={() => router.push(`/anamnese/patient/${p.id}`)}
                        className="flex items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        <Send className="h-3 w-3" />
                        Enviar
                      </button>
                      <button
                        onClick={() => router.push(`/anamnese/patient/${p.id}`)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Ver
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </ProtectedPageLayout>
  );
}
