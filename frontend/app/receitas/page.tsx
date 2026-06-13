'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Search, Pill, ChevronRight } from 'lucide-react';
import { ProtectedPageLayout } from '@/components/ProtectedPageLayout';
import { api } from '@/lib/api';
import { Card, Button, Badge, Input } from '@/components/ui';

interface RxItem {
  id: number;
  patient_id: number;
  patient_name: string;
  date: string;
  medications: { name: string }[];
  instructions?: string;
  validity_days?: number;
}

export default function ReceitasPage() {
  const router = useRouter();
  const [items, setItems] = useState<RxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const patRes = await api.get('/patients');
        const patients: { id: number; name: string; consultation_count?: number }[] = patRes.data;

        const withConsultations = patients.filter((p) => (p.consultation_count ?? 1) > 0);
        const results = await Promise.allSettled(
          withConsultations.map((p) =>
            api.get(`/patients/${p.id}/prescriptions`).then((r) =>
              (r.data as any[]).map((rx: any) => ({
                ...rx,
                patient_name: p.name,
              }))
            )
          )
        );

        const all: RxItem[] = results
          .filter((r): r is PromiseFulfilledResult<RxItem[]> => r.status === 'fulfilled')
          .flatMap((r) => r.value)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        setItems(all);
      } catch {
        // silent — show empty state
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = items.filter((rx) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return rx.patient_name.toLowerCase().includes(s);
  });

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <ProtectedPageLayout
      title="Receitas"
      subtitle="Prescrições médicas"
      back="/"
      actions={
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => router.push('/pacientes')}
        >
          Nova receita
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <Input
          type="search"
          placeholder="Buscar por paciente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="h-5 w-5" />}
          iconPosition="left"
          fullWidth
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card shadow="sm">
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4">
                <FileText className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {search ? 'Nenhuma receita encontrada' : 'Nenhuma receita cadastrada'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {search
                  ? 'Tente ajustar a busca'
                  : 'Prescreva medicamentos na tela do paciente'}
              </p>
              {!search && (
                <Button variant="primary" onClick={() => router.push('/pacientes')}>
                  Ver pacientes
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 px-1">
              {filtered.length} receita{filtered.length !== 1 ? 's' : ''}
            </p>
            <Card shadow="sm">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((rx) => {
                  const medCount = rx.medications?.length ?? 0;
                  return (
                    <button
                      key={`${rx.patient_id}-${rx.id}`}
                      onClick={() => router.push(`/pacientes/${rx.patient_id}`)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/30">
                        <Pill className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                          {rx.patient_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {medCount} medicamento{medCount !== 1 ? 's' : ''} · {formatDate(rx.date)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </ProtectedPageLayout>
  );
}
