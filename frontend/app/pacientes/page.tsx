'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Users, WifiOff, Filter, X,
  ChevronDown, QrCode,
} from 'lucide-react';
import Link from 'next/link';
import { ProtectedPageLayout } from '@/components/ProtectedPageLayout';
import PatientCard from '@/components/PatientCard';
import PatientCardSkeleton from '@/components/PatientCardSkeleton';
import { patientsApi, dedupGet } from '@/lib/api';
import { Input, Button, Badge } from '@/components/ui';
import { usePatientCache } from '@/hooks/usePatientCache';
import { useDebounce } from '@/hooks/useDebounce';
import { useAbortOnUnmount } from '@/hooks/useAbortOnUnmount';

// ── Filter types ───────────────────────────────────────────────────────────

type FilterGender = 'all' | 'M' | 'F';
type SortBy = 'name' | 'recent';

interface Filters {
  gender: FilterGender;
  hasInsurance: boolean | null;
  sortBy: SortBy;
}

const DEFAULT_FILTERS: Filters = { gender: 'all', hasInsurance: null, sortBy: 'name' };

// ── Virtual list constants ─────────────────────────────────────────────────
// We implement a lightweight window-based virtualizer without a library dep.
const ROW_HEIGHT = 80; // px — approximate height of each PatientCard
const OVERSCAN = 5;    // extra rows rendered above/below viewport

// ── Component ──────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const router = useRouter();
  const { isOnline, putMany, search: cacheSearch } = usePatientCache();
  const signal = useAbortOnUnmount();

  const [patients, setPatients] = useState<any[]>([]);
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounce(rawSearch, 180);

  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Virtual-scroll state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // ── Data loading ──────────────────────────────────────────────────────

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      if (!isOnline) {
        // Offline: serve from cache
        const cached = cacheSearch(q || '');
        setPatients(cached);
        return;
      }
      // dedupGet coalesces concurrent identical requests into one in-flight call
      const data = await dedupGet(
        '/patients',
        q ? { search: q } : {},
        signal
      );
      setPatients(data);
      // Write to cache without blocking UI
      putMany(data);
    } catch (err: any) {
      // Ignore intentional aborts (component unmounted mid-fetch)
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      // Fallback to cache on network error
      const cached = cacheSearch(q || '');
      setPatients(cached);
    } finally {
      setLoading(false);
    }
  }, [isOnline, cacheSearch, putMany, signal]);

  // BUSCA-PRIMEIRO (decisão Valth 02/08): a tela abre VAZIA e instantânea —
  // nada de carregar 50 pacientes de cara (não escala pra 1000+). Digitou
  // 2+ letras (nome/CPF/telefone), o servidor devolve só o que casa.
  useEffect(() => {
    const q = (search || '').trim();
    if (q.length >= 2) {
      load(q);
    } else {
      setPatients([]);
      setLoading(false);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Client-side filter + sort (applied on top of server search) ───────

  const filteredPatients = useMemo(() => {
    let list = [...patients];

    if (filters.gender !== 'all') {
      list = list.filter(p => p.gender === filters.gender);
    }
    if (filters.hasInsurance === true) {
      list = list.filter(p => !!p.insurance);
    } else if (filters.hasInsurance === false) {
      list = list.filter(p => !p.insurance);
    }
    if (filters.sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    // 'recent' keeps server order (most recently updated first)
    return list;
  }, [patients, filters]);

  const activeFilterCount = [
    filters.gender !== 'all',
    filters.hasInsurance !== null,
  ].filter(Boolean).length;

  // ── Virtual scroll logic ──────────────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      setViewportHeight(entries[0].contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = filteredPatients.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(filteredPatients.length, startIdx + visibleCount);
  const visiblePatients = filteredPatients.slice(startIdx, endIdx);
  const offsetTop = startIdx * ROW_HEIGHT;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <ProtectedPageLayout
      title="Pacientes"
      back="/"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<QrCode className="h-4 w-4" />}
            aria-label="Scanner QR/Código de barras"
            onClick={() => router.push('/pacientes/scanner')}
          />
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => router.push('/pacientes/novo')}>
            Novo
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">

        {/* Offline banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <span>Modo offline — exibindo pacientes em cache</span>
          </div>
        )}

        {/* Search + Filter bar */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Buscar por nome, CPF, email ou telefone..."
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              icon={<Search className="h-5 w-5" />}
              iconPosition="left"
              fullWidth
            />
          </div>
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              filtersOpen
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filter panel */}
        {filtersOpen && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Filtros</span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  <X className="h-3 w-3" />
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Gender */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">Gênero</p>
                <div className="flex gap-1.5">
                  {(['all', 'M', 'F'] as FilterGender[]).map(g => (
                    <button
                      key={g}
                      onClick={() => setFilters(f => ({ ...f, gender: g }))}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        filters.gender === g
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {g === 'all' ? 'Todos' : g === 'M' ? 'Masculino' : 'Feminino'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Insurance */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">Convênio</p>
                <div className="flex gap-1.5">
                  {([null, true, false] as (boolean | null)[]).map(v => (
                    <button
                      key={String(v)}
                      onClick={() => setFilters(f => ({ ...f, hasInsurance: v }))}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        filters.hasInsurance === v
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {v === null ? 'Todos' : v ? 'Com' : 'Sem'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">Ordenar por</p>
                <div className="flex gap-1.5">
                  {(['name', 'recent'] as SortBy[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilters(f => ({ ...f, sortBy: s }))}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        filters.sortBy === s
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {s === 'name' ? 'Nome A-Z' : 'Recentes'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          /* Skeleton screens */
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <PatientCardSkeleton key={i} />)}
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm">
            <div className="flex justify-center">
              <div className="rounded-full bg-slate-100 p-4">
                <Users className="h-8 w-8 text-slate-400" />
              </div>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              {rawSearch.trim().length >= 2 || activeFilterCount > 0
                ? 'Nenhum paciente encontrado'
                : 'Busque um paciente'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {rawSearch.trim().length >= 2 || activeFilterCount > 0
                ? 'Tente ajustar a busca ou os filtros'
                : 'Digite o nome, CPF ou telefone no campo acima — ou cadastre um novo'}
            </p>
            {!rawSearch && activeFilterCount === 0 && (
              <Button
                variant="primary"
                className="mt-4"
                onClick={() => router.push('/pacientes/novo')}
              >
                Cadastrar primeiro paciente
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Count header */}
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium text-slate-600">
                {filteredPatients.length} resultado{filteredPatients.length !== 1 ? 's' : ''}
                {activeFilterCount > 0 && <span className="ml-1 text-slate-400">(filtrado)</span>}
              </p>
              {!isOnline && (
                <Badge variant="warning" size="sm">Cache</Badge>
              )}
            </div>

            {/* Virtualized list */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="relative overflow-y-auto"
              style={{ height: 'calc(100vh - 260px)' }}
            >
              {/* Total height spacer */}
              <div style={{ height: totalHeight, position: 'relative' }}>
                {/* Visible window */}
                <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0 }}>
                  <div className="space-y-3 pb-2">
                    {visiblePatients.map(p => (
                      <PatientCard key={p.id} patient={p} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedPageLayout>
  );
}
