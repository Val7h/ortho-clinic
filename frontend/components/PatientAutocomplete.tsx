'use client';
/**
 * PatientAutocomplete
 *
 * Combobox for selecting a patient when creating/editing an appointment.
 * Challenges:
 * - Debounced search to avoid hammering the API on every keystroke.
 * - Keyboard navigation (ArrowUp/Down/Enter/Escape) following ARIA combobox pattern.
 * - "New patient" escape hatch: if no match found, user can type a free-form name
 *   (name only, no patient_id link) so appointments still get created for walk-ins.
 * - Closes on outside click and on selection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, User, X } from 'lucide-react';
import { appointmentsApi } from '@/lib/api';

interface PatientOption {
  id: number;
  name: string;
  phone?: string;
  cpf?: string;
}

interface PatientAutocompleteProps {
  value: string;
  patientId?: number | null;
  onChange: (name: string, patient: PatientOption | null) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-100 text-brand-800 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function PatientAutocomplete({
  value,
  patientId,
  onChange,
  disabled,
  required,
  error,
}: PatientAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [options, setOptions] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value
  useEffect(() => { setInputValue(value); }, [value]);

  const search = useCallback((q: string) => {
    if (q.length < 2) { setOptions([]); setOpen(false); return; }
    setLoading(true);
    appointmentsApi.searchPatients(q)
      .then(results => {
        setOptions(results);
        setOpen(true);
        setActiveIdx(-1);
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    onChange(v, null); // clear linked patient when user types
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 280);
  };

  const select = (patient: PatientOption) => {
    setInputValue(patient.name);
    onChange(patient.name, patient);
    setOpen(false);
    setOptions([]);
  };

  const clear = () => {
    setInputValue('');
    onChange('', null);
    setOptions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(options[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isLinked = !!patientId;

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="label" htmlFor="patient-autocomplete">
        Paciente {required && <span className="text-red-500">*</span>}
      </label>

      <div className={`flex items-center rounded-xl border bg-white dark:bg-slate-900 transition-colors ${
        error
          ? 'border-red-400 focus-within:ring-2 focus-within:ring-red-300'
          : isLinked
            ? 'border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-300'
            : 'border-slate-300 dark:border-slate-700 focus-within:ring-2 focus-within:ring-brand-300'
      }`}>
        <div className="pl-3 text-slate-400 dark:text-slate-500 flex-shrink-0">
          {isLinked
            ? <User className="w-4 h-4 text-emerald-600" />
            : <Search className="w-4 h-4" />
          }
        </div>
        <input
          id="patient-autocomplete"
          ref={inputRef}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          disabled={disabled}
          required={required}
          value={inputValue}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Nome, CPF ou telefone..."
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
        />
        {loading && (
          <div className="pr-3">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {inputValue && !loading && (
          <button type="button" onClick={clear} className="pr-3 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isLinked && (
        <p className="mt-1 text-xs text-emerald-600 font-medium">Paciente vinculado ao prontuário</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {/* Dropdown */}
      {open && options.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        >
          {options.map((p, idx) => (
            <li
              key={p.id}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={() => select(p)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                idx === activeIdx
                  ? 'bg-brand-50 dark:bg-brand-950'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {highlight(p.name, inputValue)}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {[p.phone, p.cpf].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                </p>
              </div>
            </li>
          ))}
          <li className="px-4 py-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              Digite um nome livre para agendamento sem prontuário vinculado
            </p>
          </li>
        </ul>
      )}

      {open && options.length === 0 && inputValue.length >= 2 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum paciente encontrado. Agendamento será criado com este nome.
          </p>
        </div>
      )}
    </div>
  );
}
