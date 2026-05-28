"use client";
import { useEffect, useState } from "react";
import { BookOpen, Search, ChevronRight, X } from "lucide-react";
import NavBar from "@/components/NavBar";
import { leafletsApi } from "@/lib/api";

export default function LeafletsPage() {
  const [leaflets, setLeaflets] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    leafletsApi.list().then(setLeaflets).catch(() => {});
  }, []);

  const categories = Array.from(new Set(leaflets.map((l) => l.category)));
  const filtered = leaflets.filter(
    (l) =>
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.category.toLowerCase().includes(search.toLowerCase()) ||
      l.tags?.some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar title="Folhetos Informativos" back="/" />

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por condição, categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {categories.map((cat) => {
          const items = filtered.filter((l) => l.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</h3>
              <div className="space-y-2">
                {items.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelected(l)}
                    className="card w-full p-4 flex items-center gap-3 text-left hover:shadow-md active:scale-95 transition-all"
                  >
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{l.title}</p>
                      <div className="flex gap-1 mt-1">
                        {l.tags?.slice(0, 3).map((t: string) => (
                          <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum folheto encontrado</p>
          </div>
        )}
      </main>

      {/* Modal de visualização */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{selected.title}</h2>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="btn-secondary text-sm">Imprimir</button>
                <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div
              className="overflow-y-auto p-5 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selected.content_html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
