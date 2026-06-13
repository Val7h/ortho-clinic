"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Building2, Users, Shield, Zap, Phone, FileText, CheckCircle,
  ArrowRight, Star, Clock, Lock, Globe, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormData {
  prospect_name: string;
  prospect_email: string;
  prospect_phone: string;
  prospect_company: string;
  clinic_count: string;
  user_count: string;
  contract_years: string;
  poc_requested: boolean;
  notes: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Features grid ─────────────────────────────────────────────────────────────

const ENTERPRISE_FEATURES = [
  {
    icon: Users,
    title: "Usuários ilimitados",
    desc: "Sem limite de equipe. Adicione médicos, secretárias e gestores sem custo extra.",
  },
  {
    icon: Building2,
    title: "Multi-unidade consolidado",
    desc: "Uma única fatura para todas as clínicas. Descontos por volume de 15% a 25%.",
  },
  {
    icon: Shield,
    title: "LGPD + HIPAA",
    desc: "Pacote completo de conformidade regulatória com DPA e relatório de auditoria.",
  },
  {
    icon: Lock,
    title: "SSO / SAML 2.0",
    desc: "Integração com Azure AD, Okta, Google Workspace e qualquer provedor SAML.",
  },
  {
    icon: Star,
    title: "SLA 99,99%",
    desc: "Contrato de nível de serviço com 99,99% de uptime e suporte via telefone.",
  },
  {
    icon: Globe,
    title: "SCIM + Logs de auditoria",
    desc: "Provisionamento automático de usuários e rastreabilidade completa de ações.",
  },
  {
    icon: Zap,
    title: "API ilimitada",
    desc: "Sem throttling. Integre com PACS, HIS, ERPs e sistemas de convênios.",
  },
  {
    icon: Phone,
    title: "CSM dedicado",
    desc: "Customer Success Manager exclusivo + suporte telefônico 24h para emergências.",
  },
];

const VOLUME_DISCOUNTS = [
  { range: "2–9 unidades",  discount: "0%",  note: "Preço padrão" },
  { range: "10–24 unidades", discount: "15%", note: "Desconto automático" },
  { range: "25+ unidades",  discount: "25%", note: "Melhor valor" },
];

const MULTI_YEAR = [
  { years: "1 ano",    discount: "0%",   note: "" },
  { years: "2 anos",   discount: "10%",  note: "" },
  { years: "3 anos",   discount: "15%",  note: "Máximo desconto" },
];

// ── Form ──────────────────────────────────────────────────────────────────────

function QuoteForm() {
  const [form, setForm] = useState<FormData>({
    prospect_name: "",
    prospect_email: "",
    prospect_phone: "",
    prospect_company: "",
    clinic_count: "",
    user_count: "",
    contract_years: "1",
    poc_requested: false,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ quote_id: number; price: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        prospect_name: form.prospect_name,
        prospect_email: form.prospect_email,
        prospect_phone: form.prospect_phone || undefined,
        prospect_company: form.prospect_company,
        clinic_count: form.clinic_count ? parseInt(form.clinic_count) : undefined,
        user_count: form.user_count ? parseInt(form.user_count) : undefined,
        contract_years: parseInt(form.contract_years),
        poc_requested: form.poc_requested,
        notes: form.notes || undefined,
      };
      const r = await fetch(`${API}/billing/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail ?? "Erro ao enviar solicitação.");
      }
      const data = await r.json();
      setSuccess({ quote_id: data.quote_id, price: data.price_estimate_monthly_brl });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-success-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Solicitação recebida!</h3>
        <p className="text-slate-600 text-sm max-w-sm mx-auto">
          Nossa equipe entrará em contato em até <strong>24 horas</strong> com uma proposta personalizada.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left max-w-sm mx-auto space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Nº da proposta</span>
            <span className="font-bold text-slate-900">#{success.quote_id}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Estimativa inicial</span>
            <span className="font-bold text-brand-700">
              R$ {success.price.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/mês
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Guarde o número da proposta. Enviaremos um link de acompanhamento por e-mail.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome completo *</label>
          <input
            required
            value={form.prospect_name}
            onChange={(e) => set("prospect_name", e.target.value)}
            placeholder="Dr. João Silva"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">E-mail corporativo *</label>
          <input
            required
            type="email"
            value={form.prospect_email}
            onChange={(e) => set("prospect_email", e.target.value)}
            placeholder="joao@clinica.com.br"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Telefone / WhatsApp</label>
          <input
            value={form.prospect_phone}
            onChange={(e) => set("prospect_phone", e.target.value)}
            placeholder="(11) 9 9999-9999"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome da organização *</label>
          <input
            required
            value={form.prospect_company}
            onChange={(e) => set("prospect_company", e.target.value)}
            placeholder="Grupo Ortopédico Brasil"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nº de unidades (clínicas)</label>
          <input
            type="number"
            min="1"
            value={form.clinic_count}
            onChange={(e) => set("clinic_count", e.target.value)}
            placeholder="ex: 5"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nº estimado de usuários</label>
          <input
            type="number"
            min="1"
            value={form.user_count}
            onChange={(e) => set("user_count", e.target.value)}
            placeholder="ex: 30"
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Duração do contrato</label>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3"].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => set("contract_years", y)}
              className={`py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                form.contract_years === y
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:border-brand-300"
              }`}
            >
              {y} {y === "1" ? "ano" : "anos"}
              {y === "2" && <span className="block text-xs text-success-600 font-normal">-10%</span>}
              {y === "3" && <span className="block text-xs text-success-600 font-normal">-15%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <input
          type="checkbox"
          id="poc"
          checked={form.poc_requested}
          onChange={(e) => set("poc_requested", e.target.checked)}
          className="mt-0.5 w-4 h-4 text-brand-600 rounded border-slate-300"
        />
        <div>
          <label htmlFor="poc" className="text-sm font-semibold text-slate-800 cursor-pointer">
            Solicitar POC gratuito (30 dias)
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            Proof of Concept: 30 dias de uso completo no seu ambiente real, sem custo e sem compromisso.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Comentários ou necessidades específicas</label>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Integrações específicas, requisitos de compliance, prazo de implementação..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {loading ? "Enviando..." : "Solicitar proposta Enterprise"}
        {!loading && <ArrowRight className="w-4 h-4" />}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Resposta em até 24 horas · Sem compromisso · Dados protegidos pela LGPD
      </p>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EnterprisePage() {
  const [discountsOpen, setDiscountsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden py-16 px-4 text-white text-center"
        style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
      >
        <div className="absolute top-5 left-5">
          <Link href="/planos" className="text-xs text-blue-200 hover:text-white transition-colors font-medium">
            ← Voltar aos planos
          </Link>
        </div>

        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
          <Building2 className="w-4 h-4" />
          <span className="text-sm font-semibold">Enterprise</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
          Escale com segurança e<br />conformidade total
        </h1>
        <p className="text-blue-100 text-lg max-w-2xl mx-auto leading-relaxed">
          Para grupos hospitalares, redes de clínicas e sistemas de saúde que precisam de
          controle, compliance e suporte de nível enterprise.
        </p>

        {/* KPIs */}
        <div className="mt-10 flex flex-wrap justify-center gap-8">
          {[
            { value: "99,99%", label: "SLA de uptime" },
            { value: "30 dias", label: "POC gratuito" },
            { value: "25%", label: "Desconto máximo por volume" },
            { value: "24h", label: "Resposta da proposta" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-3xl font-extrabold text-white">{value}</p>
              <p className="text-xs text-blue-200 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-16">

        {/* ── Features grid ────────────────────────────────────────── */}
        <section className="mb-16">
          <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-10">
            Tudo que sua organização precisa
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ENTERPRISE_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-brand-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-2">{title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing + Form ───────────────────────────────────────── */}
        <div className="grid lg:grid-cols-5 gap-10">

          {/* Left: pricing info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Preços Enterprise</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Preços personalizados baseados no número de unidades, usuários e requisitos de compliance.
              </p>
            </div>

            {/* Base price */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
                A partir de
              </p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-sm font-semibold text-slate-500 self-start mt-1">R$</span>
                <span className="text-4xl font-extrabold text-slate-900 leading-none">2.497</span>
                <span className="text-sm text-slate-500 mb-1">/mês</span>
              </div>
              <p className="text-xs text-slate-400">Contrato anual · 1 unidade</p>
            </div>

            {/* Volume discounts */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setDiscountsOpen(!discountsOpen)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50"
              >
                <span className="font-bold text-slate-900 text-sm">Descontos por volume</span>
                {discountsOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {discountsOpen && (
                <div className="px-5 pb-5 space-y-2">
                  {VOLUME_DISCOUNTS.map((row) => (
                    <div key={row.range} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{row.range}</span>
                      <div className="text-right">
                        <span className={`font-bold ${row.discount !== "0%" ? "text-success-600" : "text-slate-400"}`}>
                          {row.discount}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">{row.note}</span>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      Descontos de volume e multi-ano são cumulativos, limitados a 40%.
                    </p>
                  </div>
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-slate-600">Desconto multi-ano:</p>
                    {MULTI_YEAR.map((row) => (
                      <div key={row.years} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{row.years}</span>
                        <span className={`font-bold ${row.discount !== "0%" ? "text-success-600" : "text-slate-400"}`}>
                          {row.discount} {row.note && <span className="text-xs text-slate-400 font-normal">{row.note}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* POC callout */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900 text-sm mb-1">POC: 30 dias grátis</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Avalie a plataforma em produção real por 30 dias, com acesso completo,
                    sem custo e sem necessidade de assinar contrato.
                  </p>
                </div>
              </div>
            </div>

            {/* Compliance badges */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Shield, label: "LGPD", sub: "Compliance completo" },
                { icon: FileText, label: "HIPAA", sub: "Pacote disponível" },
                { icon: Lock,   label: "ISO 27001", sub: "Roadmap 2025" },
                { icon: Star,   label: "SOC 2 Type II", sub: "Roadmap 2025" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-brand-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: form */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Solicitar proposta</h2>
              <p className="text-sm text-slate-500 mb-6">
                Preencha o formulário e nosso time entrará em contato em até 24 horas.
              </p>
              <QuoteForm />
            </div>
          </div>
        </div>

        {/* ── MSA / DocuSign callout ───────────────────────────────── */}
        <section className="mt-16 bg-slate-900 rounded-2xl p-8 text-white text-center">
          <FileText className="w-8 h-8 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Contrato e DPA via DocuSign</h3>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Após aceitar a proposta, enviaremos o MSA (Master Service Agreement) e o DPA
            (Data Processing Agreement) para assinatura eletrônica via DocuSign.
            Todo o processo leva menos de 30 minutos.
          </p>
        </section>

      </div>
    </div>
  );
}
