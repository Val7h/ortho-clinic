"use client";

// Cadastros duplicados (19/08). Caso que motivou: o Alexandre César tinha a
// anamnese do formulário e os exames num cadastro, e o agendamento do dia em
// outro — o médico abria a ficha pelo painel e caía na versão vazia.
//
// A regra da tela é a mesma do backend: nada é apagado. O cadastro escolhido
// recebe tudo do outro, e o outro é desativado.

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Users, ArrowRight } from "lucide-react";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { patientsApi, msgErro } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";

type Pessoa = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  nascimento: string | null;
  criado_em: string | null;
};
type Grupo = { motivo: string; pacientes: Pessoa[] };

function dataBR(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso.length <= 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR");
}

export default function DuplicadosPage() {
  const { user } = useProtectedPage();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [unificando, setUnificando] = useState<number | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    patientsApi.duplicados()
      .then(setGrupos)
      .catch((e) => toast.error(msgErro(e, "Não consegui carregar os duplicados")))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { if (user) carregar(); }, [user, carregar]);

  const unificar = async (fica: Pessoa, sai: Pessoa) => {
    const ok = window.confirm(
      `Manter o cadastro #${fica.id} (${fica.nome}) e trazer tudo do #${sai.id} para ele?\n\n` +
      `Consultas, receitas, laudos, exames, agendamentos e financeiro do #${sai.id} ` +
      `passam para o #${fica.id}. Nada é apagado — o #${sai.id} apenas sai de circulação.`
    );
    if (!ok) return;
    setUnificando(sai.id);
    try {
      const r = await patientsApi.unificar(fica.id, sai.id);
      toast.success(
        r.total_movido > 0
          ? `Unificado — ${r.total_movido} registro(s) movido(s) para #${fica.id}`
          : `Unificado — o cadastro #${sai.id} estava vazio`,
        { duration: 6000 }
      );
      carregar();
    } catch (e: any) {
      toast.error(msgErro(e, "Não consegui unificar"));
    } finally {
      setUnificando(null);
    }
  };

  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <NavBar title="Cadastros duplicados" subtitle="Mesma pessoa cadastrada mais de uma vez" />

        <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
          {carregando && <p className="text-sm text-slate-500">Procurando…</p>}

          {!carregando && grupos.length === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Nenhum cadastro duplicado.
              </p>
            </div>
          )}

          {grupos.map((g, i) => (
            <div key={i} className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300 mb-3">
                {g.motivo}
              </p>

              <div className="space-y-2">
                {g.pacientes.map((p) => (
                  <div key={p.id} className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-50">
                          #{p.id} · {p.nome}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {p.telefone || "sem telefone"} · nasc. {dataBR(p.nascimento)}
                          {p.cpf ? ` · CPF ${p.cpf}` : ""}
                        </p>
                        <p className="text-[11px] text-slate-400">cadastrado em {dataBR(p.criado_em)}</p>
                      </div>

                      <button
                        onClick={() => {
                          const outro = g.pacientes.find((x) => x.id !== p.id);
                          if (outro) unificar(p, outro);
                        }}
                        disabled={unificando !== null || g.pacientes.length !== 2}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40"
                      >
                        Manter este <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {g.pacientes.length > 2 && (
                <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">
                  Três ou mais cadastros: unifique dois de cada vez.
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Escolha o cadastro que fica — costuma ser o mais antigo, que tem o histórico.
                Nada é apagado.
              </p>
            </div>
          ))}
        </main>
      </div>
    </PageWithSidebar>
  );
}
