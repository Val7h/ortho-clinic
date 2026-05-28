"use client";
import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

const CID_ORTHO = [
  // Coluna vertebral
  { code: "M47.8", desc: "Espondilose, não especificada" },
  { code: "M51.1", desc: "Degeneração de disco lombar" },
  { code: "M54.4", desc: "Lombociatalgia" },
  { code: "M54.5", desc: "Dor lombar baixa" },
  { code: "M54.2", desc: "Cervicalgia" },
  { code: "M50.1", desc: "Degeneração de disco cervical" },
  { code: "M48.0", desc: "Estenose do canal espinhal" },
  { code: "M43.1", desc: "Espondilolistese" },
  { code: "M54.3", desc: "Ciatalgia" },
  // Joelho
  { code: "M17.1", desc: "Gonartrose primária unilateral" },
  { code: "M17.0", desc: "Gonartrose primária bilateral" },
  { code: "M23.2", desc: "Lesão meniscal por ruptura antiga" },
  { code: "M23.6", desc: "Outros derangements internos do joelho" },
  { code: "S83.2", desc: "Ruptura do menisco" },
  { code: "S83.5", desc: "Ruptura do ligamento cruzado anterior" },
  { code: "M22.2", desc: "Desordem da patela" },
  // Quadril
  { code: "M16.0", desc: "Coxartrose primária bilateral" },
  { code: "M16.1", desc: "Coxartrose primária unilateral" },
  { code: "M70.6", desc: "Bursite trocantérica" },
  { code: "M16.5", desc: "Outras coxartroses secundárias" },
  // Ombro
  { code: "M75.1", desc: "Síndrome do manguito rotador" },
  { code: "M75.0", desc: "Capsulite adesiva do ombro" },
  { code: "M75.5", desc: "Bursite do ombro" },
  { code: "M75.2", desc: "Tendinite bicipital" },
  { code: "S46.0", desc: "Lesão do tendão do manguito rotador" },
  // Cotovelo
  { code: "M77.1", desc: "Epicondilite lateral (tênis)" },
  { code: "M77.0", desc: "Epicondilite medial (golfista)" },
  // Mão e punho
  { code: "G54.2", desc: "Síndrome do túnel do carpo" },
  { code: "M65.3", desc: "Dedo em gatilho" },
  { code: "M70.1", desc: "Tenossinovite da mão" },
  // Tornozelo e pé
  { code: "M77.3", desc: "Esporão calcâneo" },
  { code: "M72.2", desc: "Fasciite plantar" },
  { code: "M19.0", desc: "Artrose primária de articulações periféricas" },
  // Fraturas comuns
  { code: "S72.0", desc: "Fratura do colo do fêmur" },
  { code: "S82.1", desc: "Fratura da tíbia proximal" },
  { code: "S52.5", desc: "Fratura do rádio distal" },
  { code: "S42.2", desc: "Fratura da clavícula" },
  // Outros
  { code: "M06.9", desc: "Artrite reumatóide, não especificada" },
  { code: "M10.0", desc: "Gota idiopática" },
  { code: "M79.3", desc: "Paniculite" },
  { code: "M79.1", desc: "Mialgia" },
  { code: "M79.2", desc: "Nevralgia e neurite" },
  { code: "M89.0", desc: "Algoneurodistrofia" },
  { code: "T14.2", desc: "Fratura de região do corpo não especificada" },
];

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function CidSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.length >= 1
    ? CID_ORTHO.filter(
        (c) =>
          c.code.toLowerCase().includes(query.toLowerCase()) ||
          c.desc.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleSelect = (code: string, desc: string) => {
    const val = `${code} — ${desc}`;
    setQuery(val);
    onChange(val);
    setOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    setOpen(true);
  };

  const handleClear = () => {
    setQuery("");
    onChange("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          className="input pl-9 pr-8"
          placeholder="Buscar CID-10... (ex: M17, joelho, lombar)"
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 1 && setOpen(true)}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map((c) => (
            <button
              key={c.code}
              type="button"
              onMouseDown={() => handleSelect(c.code, c.desc)}
              className="w-full text-left px-4 py-2.5 hover:bg-brand-50 transition-colors flex items-center gap-3 border-b border-gray-50 last:border-0"
            >
              <span className="text-xs font-bold text-brand-600 bg-brand-50 rounded-md px-2 py-0.5 flex-shrink-0 font-mono">
                {c.code}
              </span>
              <span className="text-sm text-gray-700 truncate">{c.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
