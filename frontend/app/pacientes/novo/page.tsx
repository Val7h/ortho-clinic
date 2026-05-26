"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { patientsApi } from "@/lib/api";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = [{ v: "M", l: "Masculino" }, { v: "F", l: "Feminino" }, { v: "O", l: "Outro" }];
const CIVIL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];

export default function NewPatientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const patient = await patientsApi.create(form);
      toast.success("Paciente cadastrado com sucesso!");
      router.push(`/pacientes/${patient.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar title="Novo Paciente" back="/pacientes" />

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Dados pessoais */}
        <section className="card p-6 space-y-4">
          <h2 className="section-title">Dados Pessoais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Nome completo *</label>
              <input className="input" placeholder="Nome do paciente" onChange={set("name")} required />
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
              <label className="label">CPF</label>
              <input className="input" placeholder="000.000.000-00" onChange={set("cpf")} />
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
              <label className="label">Telefone / WhatsApp</label>
              <input className="input" placeholder="(11) 99999-9999" onChange={set("phone")} />
            </div>
            <div>
              <label className="label">Telefone 2</label>
              <input className="input" placeholder="(11) 99999-9999" onChange={set("phone2")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">E-mail</label>
              <input type="email" className="input" placeholder="email@exemplo.com" onChange={set("email")} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Endereço</label>
              <input className="input" placeholder="Rua, número, bairro" onChange={set("address_street")} />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input className="input" placeholder="Cidade" onChange={set("address_city")} />
            </div>
            <div>
              <label className="label">CEP</label>
              <input className="input" placeholder="00000-000" onChange={set("address_zip")} />
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
            <div>
              <label className="label">Convênio</label>
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
  );
}
