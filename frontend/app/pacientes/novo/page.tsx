"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { patientsApi, msgErro } from "@/lib/api";
import { buscarCep, cepCompleto, formatarCep, montarEndereco } from "@/lib/cep";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = [{ v: "M", l: "Masculino" }, { v: "F", l: "Feminino" }, { v: "O", l: "Outro" }];
const CIVIL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function NewPatientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  // Particular × Convênio (obrigatório — decisão Valth 02/08)
  const [pagamento, setPagamento] = useState<"" | "particular" | "convenio">("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // CEP preenche o endereço sozinho (pedido Valth 06/08): a secretária digita
  // o CEP e só completa número e complemento. O banco guarda tudo em
  // address_street, então logradouro/nº/compl./bairro são remontados aqui.
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepNaoEncontrado, setCepNaoEncontrado] = useState(false);
  const [cepSemRua, setCepSemRua] = useState(false);
  const [end, setEnd] = useState({ logradouro: "", numero: "", complemento: "", bairro: "" });
  const numeroRef = useRef<HTMLInputElement>(null);

  // Guarda em colunas (número, complemento, bairro) E na linha montada, que é
  // o que os documentos imprimem. As colunas existem para filtrar por bairro.
  const aplicarEndereco = (e: typeof end) => {
    setEnd(e);
    setForm((f) => ({
      ...f,
      address_number: e.numero,
      address_complement: e.complemento,
      address_neighborhood: e.bairro,
      address_street: montarEndereco(e.logradouro, e.numero, e.complemento, e.bairro),
    }));
  };

  const onCepChange = async (valor: string) => {
    const cep = formatarCep(valor);
    setForm((f) => ({ ...f, address_zip: cep }));
    setCepNaoEncontrado(false);
    setCepSemRua(false);
    if (!cepCompleto(cep)) return;
    setBuscandoCep(true);
    const achado = await buscarCep(cep);
    setBuscandoCep(false);
    if (!achado) { setCepNaoEncontrado(true); return; }
    // CEP único de cidade pequena (ex.: Palmares/PE) vem sem rua nem bairro:
    // cidade e UF entram, e a rua fica para digitar à mão.
    setCepSemRua(!achado.logradouro);
    const novo = { ...end, logradouro: achado.logradouro, bairro: achado.bairro };
    setEnd(novo);
    setForm((f) => ({
      ...f,
      address_city: achado.cidade,
      address_state: achado.uf,
      address_neighborhood: achado.bairro,
      address_street: montarEndereco(achado.logradouro, novo.numero, novo.complemento, achado.bairro),
    }));
    numeroRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Obrigatórios do cadastro manual (decisão Valth 02/08). O cadastro
    // automático do bot continua parcial (badge "Incompleto") — a exigência
    // vale pra quem cadastra AQUI, no balcão.
    const obrigatorios: Array<[string, string]> = [
      ["name", "Nome completo"], ["cpf", "CPF"], ["phone", "Telefone"],
      ["address_street", "Endereço"], ["address_city", "Cidade"], ["address_state", "Estado"],
    ];
    for (const [k, label] of obrigatorios) {
      if (!form[k]?.trim()) { toast.error(`${label} é obrigatório`); return; }
    }
    if (!pagamento) { toast.error("Informe se o atendimento é Particular ou Convênio"); return; }
    if (pagamento === "convenio" && !form.insurance?.trim()) { toast.error("Informe o nome do convênio"); return; }
    setSaving(true);
    try {
      const patient = await patientsApi.create({
        ...form,
        name: form.name.trim().toUpperCase(), // nome sempre em CAIXA ALTA
        insurance: pagamento === "particular" ? "Particular" : form.insurance,
      });
      toast.success("Paciente cadastrado com sucesso!");
      router.push(`/pacientes/${patient.id}`);
    } catch (err: any) {
      toast.error(msgErro(err, "Erro ao salvar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-100">
      <NavBar title="Novo Paciente" back="/pacientes" />

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Dados pessoais */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Dados Pessoais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Nome completo *</label>
              {/* uppercase: nome aparece SEMPRE em caixa alta (e é salvo assim) */}
              <input className="input uppercase" placeholder="NOME COMPLETO DO PACIENTE" onChange={set("name")} required />
            </div>
            <div>
              <label className="label">Data de nascimento</label>
              <input type="date" className="input" onChange={set("birthdate")} />
            </div>
            <div>
              <label className="label">Gênero</label>
              <select className="input" onChange={set("gender")}>
                <option value="">Selecionar</option>
                {GENDERS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">CPF *</label>
              <input className="input" placeholder="000.000.000-00" onChange={set("cpf")} required />
            </div>
            <div>
              <label className="label">RG</label>
              <input className="input" placeholder="RG" onChange={set("rg")} />
            </div>
            <div>
              <label className="label">Estado civil</label>
              <select className="input" onChange={set("civil_status")}>
                <option value="">Selecionar</option>
                {CIVIL.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Profissão</label>
              <input className="input" placeholder="Profissão" onChange={set("occupation")} />
            </div>
          </div>
        </section>

        {/* Contato */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Contato</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Telefone / WhatsApp *</label>
              <input className="input" placeholder="(83) 99999-9999" onChange={set("phone")} required />
            </div>
            <div>
              <label className="label">Telefone 2</label>
              <input className="input" placeholder="(11) 99999-9999" onChange={set("phone2")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">E-mail</label>
              <input type="email" className="input" placeholder="email@exemplo.com" onChange={set("email")} />
            </div>
            {/* CEP vem primeiro: preenche rua, bairro, cidade e UF sozinho e
                pula o cursor para o número (pedido Valth 06/08). */}
            <div>
              <label className="label">CEP</label>
              <input
                className="input"
                placeholder="00000-000"
                inputMode="numeric"
                value={form.address_zip || ""}
                onChange={(e) => onCepChange(e.target.value)}
              />
              {buscandoCep && <p className="text-xs text-slate-500 mt-1">Buscando endereço…</p>}
              {cepNaoEncontrado && (
                <p className="text-xs text-amber-600 mt-1">CEP não encontrado — preencha o endereço à mão.</p>
              )}
              {cepSemRua && (
                <p className="text-xs text-amber-600 mt-1">
                  Cidade pequena: o CEP só traz o município. Digite a rua no campo Endereço.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Número</label>
                <input
                  ref={numeroRef}
                  className="input"
                  placeholder="120"
                  value={end.numero}
                  onChange={(e) => aplicarEndereco({ ...end, numero: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Complemento</label>
                <input
                  className="input"
                  placeholder="Apto 302"
                  value={end.complemento}
                  onChange={(e) => aplicarEndereco({ ...end, complemento: e.target.value })}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Bairro</label>
              <input
                className="input"
                placeholder="Bairro"
                value={end.bairro}
                onChange={(e) => aplicarEndereco({ ...end, bairro: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Endereço *</label>
              <input
                className="input"
                placeholder="Rua, número, bairro"
                value={form.address_street || ""}
                onChange={set("address_street")}
                required
              />
            </div>
            <div>
              <label className="label">Cidade *</label>
              <input
                className="input"
                placeholder="Cidade"
                value={form.address_city || ""}
                onChange={set("address_city")}
                required
              />
            </div>
            <div>
              <label className="label">Estado (UF) *</label>
              <select
                className="input"
                value={form.address_state || ""}
                onChange={set("address_state")}
                required
              >
                <option value="">Selecionar</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Dados médicos */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Dados Médicos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo sanguíneo</label>
              <select className="input" onChange={set("blood_type")}>
                <option value="">Selecionar</option>
                {BLOOD_TYPES.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Atendimento *</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPagamento("particular")}
                  className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                    pagamento === "particular" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-300"
                  }`}
                >
                  Particular
                </button>
                <button
                  type="button"
                  onClick={() => setPagamento("convenio")}
                  className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                    pagamento === "convenio" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-300"
                  }`}
                >
                  Convênio
                </button>
              </div>
            </div>
            {pagamento === "convenio" && (
              <>
                <div>
                  <label className="label">Convênio *</label>
                  <input className="input" placeholder="Unimed, Bradesco..." onChange={set("insurance")} />
                </div>
                <div>
                  <label className="label">Número do convênio</label>
                  <input className="input" placeholder="Número da carteirinha" onChange={set("insurance_number")} />
                </div>
                <div>
                  <label className="label">Plano</label>
                  <input className="input" placeholder="Plano / categoria" onChange={set("insurance_plan")} />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="label">Alergias</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Medicamentos, alimentos..." onChange={set("allergies")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Doenças crônicas</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Hipertensão, diabetes..." onChange={set("chronic_conditions")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Medicamentos em uso</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Medicamentos que usa regularmente" onChange={set("current_medications")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Cirurgias anteriores</label>
              <textarea className="input min-h-[80px] resize-none" placeholder="Histórico cirúrgico" onChange={set("surgeries_history")} />
            </div>
          </div>
        </section>

        {/* Emergência e indicação */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Contato de Emergência & Indicação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Contato de emergência</label>
              <input className="input" placeholder="Nome" onChange={set("emergency_contact")} />
            </div>
            <div>
              <label className="label">Telefone de emergência</label>
              <input className="input" placeholder="(11) 99999-9999" onChange={set("emergency_phone")} />
            </div>
            <div>
              <label className="label">Parentesco</label>
              <input className="input" placeholder="Cônjuge, filho(a)..." onChange={set("emergency_relation")} />
            </div>
            <div>
              <label className="label">Como nos conheceu</label>
              <input className="input" placeholder="Indicação, Google, Instagram..." onChange={set("referral_source")} />
            </div>
            <div>
              <label className="label">Médico que indicou</label>
              <input className="input" placeholder="Nome do médico" onChange={set("referring_doctor")} />
            </div>
          </div>
        </section>

        <div className="flex gap-3 pb-8">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Salvando..." : "Cadastrar Paciente"}
          </button>
        </div>
      </form>
    </div>
    </PageWithSidebar>
  );
}
