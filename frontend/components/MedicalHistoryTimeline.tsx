'use client';
/**
 * MedicalHistoryTimeline
 *
 * Enhanced timeline for the patient profile page.
 * Features beyond the base Timeline component:
 * - Groups events by month/year for easier navigation
 * - Expandable consultation cards (tap to reveal full notes)
 * - Type filter chips (all / consulta / receita / exame / fisio / laudo)
 * - Lazy-render: only first 10 items visible; "load more" shows the rest
 *   to avoid measuring/layout cost for patients with long histories.
 */

import { useState, useMemo } from 'react';
import {
  Stethoscope, FileText, FlaskConical, Dumbbell, ClipboardList,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TimelineItem {
  id: number;
  type: 'consulta' | 'receita' | 'exame' | 'fisio' | 'laudo';
  subtype?: string;
  date: string;
  title: string;
  summary?: string;
  diagnosis?: string;
  notes?: string;
}

// ── Config ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  darkColor: string;
  darkBg: string;
  label: string;
}> = {
  consulta: { icon: Stethoscope, color: 'text-brand-600', bg: 'bg-brand-100', darkColor: 'dark:text-brand-300', darkBg: 'dark:bg-brand-900/40', label: 'Consulta' },
  receita:  { icon: FileText,    color: 'text-teal-600',  bg: 'bg-teal-100',  darkColor: 'dark:text-teal-300',  darkBg: 'dark:bg-teal-900/40',  label: 'Receita'  },
  exame:    { icon: FlaskConical,color: 'text-purple-600',bg: 'bg-purple-100',darkColor: 'dark:text-purple-300',darkBg: 'dark:bg-purple-900/40',label: 'Exame'    },
  fisio:    { icon: Dumbbell,    color: 'text-amber-600', bg: 'bg-amber-100', darkColor: 'dark:text-amber-300', darkBg: 'dark:bg-amber-900/40', label: 'Fisio'    },
  laudo:    { icon: ClipboardList,color:'text-gray-600',  bg: 'bg-gray-100',  darkColor: 'dark:text-slate-300', darkBg: 'dark:bg-slate-800',    label: 'Laudo'    },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG) as TimelineItem['type'][];
const INITIAL_COUNT = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

function monthLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

// Group items by year-month string
function groupByMonth(items: TimelineItem[]): Map<string, TimelineItem[]> {
  const map = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const key = item.date.slice(0, 7); // "2025-03"
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

// ── Single item card ───────────────────────────────────────────────────────

function TimelineCard({ item, patientId }: { item: TimelineItem; patientId: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.laudo;
  const Icon = cfg.icon;
  const hasDetails = !!(item.notes || item.summary);
  const detailUrl = item.type === 'consulta' ? `/pacientes/${patientId}/consulta/${item.id}` : null;

  return (
    <div className="flex gap-3 items-start">
      {/* Icon */}
      <div className={`relative z-10 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.darkBg}`}>
        <Icon className={`w-5 h-5 ${cfg.color} ${cfg.darkColor}`} />
      </div>

      {/* Card */}
      <div className="card flex-1 min-w-0 overflow-hidden">
        <button
          onClick={() => hasDetails && setExpanded(v => !v)}
          className={`w-full text-left p-3.5 ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900 dark:text-slate-50 text-sm leading-snug">{item.title}</p>
              {item.summary && !expanded && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{item.summary}</p>
              )}
              {item.diagnosis && (
                <p className="text-xs text-brand-700 dark:text-brand-300 mt-1 font-medium truncate">{item.diagnosis}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <time className="text-xs text-slate-400 dark:text-slate-500">{formatDateTime(item.date)}</time>
              {hasDetails && (
                expanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
          </div>

          {/* Expanded notes */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              {item.summary && (
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{item.summary}</p>
              )}
              {item.notes && (
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
              )}
              {detailUrl && (
                <Link
                  href={detailUrl}
                  className="inline-block text-xs font-semibold text-brand-600 hover:text-brand-700 mt-1"
                  onClick={e => e.stopPropagation()}
                >
                  Ver consulta completa →
                </Link>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  items: TimelineItem[];
  patientId: number;
}

export default function MedicalHistoryTimeline({ items, patientId }: Props) {
  const [typeFilter, setTypeFilter] = useState<TimelineItem['type'] | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter(i => i.type === typeFilter);
  }, [items, typeFilter]);

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_COUNT);
  const grouped = useMemo(() => groupByMonth(visible), [visible]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        <Stethoscope className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhum registro encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {(['all', ...ALL_TYPES] as const).map(t => {
          const cfg = t !== 'all' ? TYPE_CONFIG[t] : null;
          const isActive = typeFilter === t;
          return (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setShowAll(false); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                isActive
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}
            >
              {t === 'all' ? 'Todos' : cfg?.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-center text-slate-400 py-8">Sem registros desse tipo</p>
      ) : (
        <>
          {/* Grouped timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100 dark:bg-slate-800" />

            <div className="space-y-6">
              {Array.from(grouped.entries()).map(([monthKey, monthItems]) => (
                <div key={monthKey} className="space-y-3">
                  {/* Month header */}
                  <div className="relative flex items-center gap-3 pl-12">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide capitalize">
                      {monthLabel(monthItems[0].date)}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="pl-2 space-y-3">
                    {monthItems.map(item => (
                      <TimelineCard key={`${item.type}-${item.id}`} item={item} patientId={patientId} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Load more */}
          {!showAll && filtered.length > INITIAL_COUNT && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-sm font-semibold text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-xl hover:bg-brand-50 transition-colors"
            >
              Ver todos os {filtered.length} registros
            </button>
          )}
        </>
      )}
    </div>
  );
}
