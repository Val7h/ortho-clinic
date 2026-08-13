"use client";

// Retornos de procedimento (11/08). Visco, ácido zoledrônico e afins têm data
// certa para repetir — quem não é chamado não volta. Quem liga é a secretária,
// então a lista é dela (decisão do Valth).
//
// Contato é SEMPRE individual, um a um. Disparo em massa está vetado.

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PhoneCall, CheckCircle, X } from "lucide-react";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { remindersApi, msgErro } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";

const CORES: Record<string, string> = {
  vencido: "border-red-400 bg-red-50 dark:bg-red-950/30",
  "última chamada": "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
  "avisar agora": "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
  "no prazo": "border-slate-200 dark:border-slate-700",
};

export default function RetornosPage() {
  const { user } = useProtectedPage();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verTodos, setVerTodos] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    remindersApi.list(verTodos)
      .then(setLista)
      .catch((e) => toast.error(msgErro(e, "Não consegui carregar os retornos")))
      .finally(() => setCarregando(false));
  }, [verTodos]);

  useEffect(() => { if (user) carregar(); }, [user, carregar]);

  const resolver = async (id: number, status: "done" | "cancelled", nome: string) => {
    try {
      await remindersApi.resolve(id, status);
      toast.success(status === "done" ? `${nome.split(" ")[0]}: marcado como remarcado` : "Retorno cancelado");
      setLista((l) => l.filter((r) => r.id !== id));
    } catch (e: any) {
      toast.error(msgErro(e, "Não consegui atualizar"));
    }
  };

  const whatsapp = (telefone: string, nome: string, procedimento: string) => {
    const texto = encodeURIComponent(
      `Olá, ${nome.split(" ")[0]}! Aqui é da clínica do Dr. Valth. ` +
      `Está chegando a data de repetir seu procedimento (${procedimento}). ` +
      `Quer que eu já reserve um horário?`
    );
    window.open(`https://wa.me/${(telefone || "").replace(/\D/g, "")}?text=${texto}`, "_blank");
  };

  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <NavBar title="Retornos de procedimento" subtitle="Quem está na hora de chamar de volta" />

        <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {carregando ? "Carregando…" : `${lista.length} paciente(s)`}
            </p>
            <button
              onClick={() => setVerTodos((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {verTodos ? "Ver só quem já deve ser chamado" : "Ver todos os agendados"}
            </button>
          </div>

          {!carregando && lista.length === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Ninguém para chamar agora.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Os retornos aparecem aqui 1 mês antes de vencer, e de novo faltando 1 semana.
              </p>
            </div>
          )}

          {lista.map((r) => (
            <div key={r.id} className={`rounded-xl border-l-4 border p-4 ${CORES[r.fase] || CORES["no prazo"]}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{r.paciente}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{r.procedure}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Aplicado em {new Date(r.applied_on + "T12:00:00").toLocaleDateString("pt-BR")} ·
                    repete a cada {r.interval_months} meses ·
                    vence {new Date(r.vence_em + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide bg-white/70 dark:bg-slate-900/50">
                  {r.fase === "vencido"
                    ? `vencido há ${Math.abs(r.dias_para_vencer)} dia(s)`
                    : `faltam ${r.dias_para_vencer} dia(s)`}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.telefone && (
                  <button
                    onClick={() => whatsapp(r.telefone, r.paciente, r.procedure)}
                    className="flex items-center gap-1.5 rounded-lg border border-green-500 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    <PhoneCall className="h-3.5 w-3.5" /> Falar no WhatsApp
                  </button>
                )}
                <button
                  onClick={() => resolver(r.id, "done", r.paciente)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Já remarcou
                </button>
                <button
                  onClick={() => resolver(r.id, "cancelled", r.paciente)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"
                  title="Não vai repetir este procedimento"
                >
                  <X className="h-3.5 w-3.5" /> Não repetir
                </button>
              </div>
            </div>
          ))}
        </main>
      </div>
    </PageWithSidebar>
  );
}
