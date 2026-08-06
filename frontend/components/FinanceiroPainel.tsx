'use client';

import { useEffect, useState } from 'react';
import { financialApi } from '@/lib/api';

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function FinanceiroPainel() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    financialApi.painel().then(setDados).catch(() => setErro('Não consegui carregar o painel.'));
  }, []);

  if (erro) return <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>;

  // Esqueleto com os titulos das faixas: o bloco cinza unico parecia tela
  // em branco no dashboard, e o Valth achou que tinha quebrado.
  if (!dados) {
    return (
      <div className="space-y-4">
        {['O mês', 'Onde seu tempo rende mais', 'Consulta ou procedimento?'].map((t) => (
          <div key={t} className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <p className="text-sm font-semibold text-slate-500">{t}</p>
            <div className="mt-3 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        ))}
        <p className="text-center text-sm text-slate-400">Carregando os números…</p>
      </div>
    );
  }

  const { mes, turnos, mix } = dados;
  const maxSerie = Math.max(1, ...(mes.serie_12m || []).map((p: any) => p.valor));
  const totalMix = (mix?.consulta?.valor || 0) + (mix?.procedimento?.valor || 0);
  const pctConsulta = totalMix ? Math.round((mix.consulta.valor / totalMix) * 100) : 100;
  const maxHora = Math.max(1, ...(turnos || []).map((t: any) => t.receita_por_hora));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          {mes.label} · dia {mes.dias_uteis_decorridos} de {mes.dias_uteis_total} úteis
        </p>
        <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-slate-50">
          {brl(mes.realizado)} até agora
        </p>
        {mes.projecao != null ? (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            No ritmo atual, fecha em <strong>{brl(mes.projecao)}</strong>
            {mes.variacao_vs_anterior != null && (
              <> — {Math.abs(Math.round(mes.variacao_vs_anterior * 100))}% {mes.variacao_vs_anterior >= 0 ? 'acima' : 'abaixo'} do mês anterior</>
            )}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Projeção a partir do 5º dia útil do mês — com poucos dias, o número exagera.
          </p>
        )}
        {mes.projecao != null && mes.variacao_vs_anterior == null && (
          <p className="mt-2 text-xs text-slate-500">
            Ainda não há mês anterior fechado para comparar. Esta faixa fica útil em cerca de 60 dias.
          </p>
        )}
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {(mes.serie_12m || []).map((p: any) => (
            <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-blue-500/70"
                style={{ height: `${Math.max(4, (p.valor / maxSerie) * 100)}%` }}
              />
              <span className="text-[10px] text-slate-400">{p.label.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Onde seu tempo rende mais</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Faturamento por hora de consultório — a mesma hora sua, em cada turno
        </p>
        {(turnos || []).length === 0 && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Nenhum turno com horário cadastrado. Cadastre os horários da clínica em Configurações para ver o retorno por hora.
          </p>
        )}
        <div className="mt-4 space-y-0">
          {(turnos || []).map((t: any) => (
            <div
              key={`${t.clinic_id}-${t.dia_semana}-${t.periodo}`}
              className="grid grid-cols-[1fr_84px_84px_72px] items-center gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800"
            >
              <div>
                <p className="text-sm text-slate-900 dark:text-slate-100">{t.label}</p>
                <div className="mt-1 h-1.5 rounded-full" style={{
                  width: `${Math.max(6, (t.receita_por_hora / maxHora) * 100)}%`,
                  backgroundColor: t.atencao ? '#d97706' : '#2563eb',
                }} />
              </div>
              <p className={`text-right text-sm font-semibold ${t.atencao ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                {brl(t.receita_por_hora)}/h
              </p>
              <p className="text-right text-sm text-slate-500">{brl(t.receita_mes)}</p>
              <p className="text-right text-sm text-slate-500">
                {t.ocupacao != null ? `${Math.round(t.ocupacao * 100)}%` : '—'}
              </p>
            </div>
          ))}
        </div>
        {(turnos || []).some((t: any) => t.atencao) && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Este turno tem ocupação alta e o pior retorno por hora. Agenda cheia não é o problema — preço ou mix é.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Consulta ou procedimento?</h3>
        <p className="mt-0.5 text-sm text-slate-500">De onde veio o faturamento do mês</p>

        {mix.procedimento.qtd === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Ainda não há procedimento registrado neste mês. A etiqueta é escolhida no momento de
            registrar a chegada, então esta faixa começa a valer com os atendimentos daqui em diante.
          </p>
        ) : (
          <>
            <div className="mt-4 flex h-9 overflow-hidden rounded-lg">
              <div className="flex items-center bg-blue-100 pl-3 text-xs text-blue-800 dark:bg-blue-950" style={{ width: `${pctConsulta}%` }}>
                Consulta · {brl(mix.consulta.valor)}
              </div>
              <div className="flex items-center bg-blue-600 pl-3 text-xs text-white" style={{ width: `${100 - pctConsulta}%` }}>
                Proc. · {brl(mix.procedimento.valor)}
              </div>
            </div>
            <div className="mt-3">
              {mix.linhas.map((l: any) => (
                <div key={l.tipo} className="grid grid-cols-[1fr_48px_80px_72px] gap-2 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
                  <span className="text-slate-900 dark:text-slate-100">{l.tipo}</span>
                  <span className="text-right text-slate-500">{l.qtd}</span>
                  <span className="text-right text-slate-900 dark:text-slate-100">{brl(l.valor)}</span>
                  <span className="text-right text-slate-500">{l.ticket ? brl(l.ticket) : '—'}</span>
                </div>
              ))}
            </div>
            {mix.razao_ticket && (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Cada procedimento vale {mix.razao_ticket.toString().replace('.', ',')} consultas — na mesma hora de agenda.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
