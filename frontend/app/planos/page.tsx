"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, X, ChevronDown, ChevronUp, Stethoscope,
  Zap, Shield, Users, Database, Phone, Star, Building2,
  ArrowRight, Clock
} from "lucide-react";
import { Card, Badge, Button } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingCycle = "monthly" | "annual";

interface PlanFeature {
  label: string;
  included: boolean;
  highlight?: boolean;
}

interface PlanData {
  tier: "starter" | "professional" | "enterprise";
  name: string;
  tagline: string;
  price_monthly: number | null;
  price_annual: number | null;
  price_annual_monthly: number | null;
  savings_annual: number | null;
  max_users: number | null;
  max_appointments: number | null;
  max_storage_gb: number | null;
  api_calls_per_hour: number | null;
  trial_days: number;
  popular: boolean;
  enterprise: boolean;
  cta_label: string;
  cta_href: string;
  features: PlanFeature[];
}

// ── Static plan data (mirrors backend catalog) ─────────────────────────────

const PLANS: PlanData[] = [
  {
    tier: "starter",
    name: "Starter",
    tagline: "Ideal para clínicas individuais",
    price_monthly: 297,
    price_annual: 2970,
    price_annual_monthly: 247.5,
    savings_annual: 594,
    max_users: 3,
    max_appointments: 500,
    max_storage_gb: 5,
    api_calls_per_hour: 1000,
    trial_days: 14,
    popular: false,
    enterprise: false,
    cta_label: "Teste grátis por 14 dias",
    cta_href: "/billing/checkout?plan=starter",
    features: [
      { label: "Até 3 usuários", included: true },
      { label: "500 agendamentos/mês", included: true },
      { label: "5 GB de armazenamento", included: true },
      { label: "1.000 chamadas API/hora", included: true },
      { label: "Prontuário eletrônico", included: true },
      { label: "Agendamento online", included: true },
      { label: "Fila de espera (walk-in)", included: true },
      { label: "Geração de PDFs", included: true },
      { label: "WhatsApp automático básico", included: true },
      { label: "Relatórios básicos", included: true },
      { label: "Suporte por e-mail", included: true },
      { label: "Anamnese digital", included: false },
      { label: "Módulo financeiro", included: false },
      { label: "Relatórios avançados", included: false },
      { label: "Marca personalizada", included: false },
      { label: "Webhooks", included: false },
      { label: "SSO / SAML", included: false },
    ],
  },
  {
    tier: "professional",
    name: "Professional",
    tagline: "Para clínicas em crescimento",
    price_monthly: 697,
    price_annual: 6970,
    price_annual_monthly: 580.83,
    savings_annual: 1394,
    max_users: 15,
    max_appointments: null,
    max_storage_gb: 50,
    api_calls_per_hour: 10000,
    trial_days: 14,
    popular: true,
    enterprise: false,
    cta_label: "Teste grátis por 14 dias",
    cta_href: "/billing/checkout?plan=professional",
    features: [
      { label: "Até 15 usuários", included: true, highlight: true },
      { label: "Agendamentos ilimitados", included: true, highlight: true },
      { label: "50 GB de armazenamento", included: true },
      { label: "10.000 chamadas API/hora", included: true },
      { label: "Prontuário eletrônico", included: true },
      { label: "Agendamento online", included: true },
      { label: "Fila de espera (walk-in)", included: true },
      { label: "Geração de PDFs", included: true },
      { label: "WhatsApp avançado", included: true },
      { label: "Anamnese digital", included: true },
      { label: "Teleconsulta", included: true },
      { label: "Módulo financeiro", included: true },
      { label: "Relatórios avançados + analytics", included: true },
      { label: "Marca personalizada", included: true },
      { label: "Webhooks", included: true },
      { label: "Chat + e-mail suporte 24h", included: true },
      { label: "SSO / SAML", included: false },
    ],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    tagline: "Para grupos e redes hospitalares",
    price_monthly: null,
    price_annual: null,
    price_annual_monthly: null,
    savings_annual: null,
    max_users: null,
    max_appointments: null,
    max_storage_gb: null,
    api_calls_per_hour: null,
    trial_days: 30,
    popular: false,
    enterprise: true,
    cta_label: "Falar com especialista",
    cta_href: "/billing/enterprise",
    features: [
      { label: "Usuários ilimitados", included: true, highlight: true },
      { label: "Armazenamento ilimitado", included: true, highlight: true },
      { label: "API ilimitada", included: true, highlight: true },
      { label: "SSO / SAML 2.0", included: true, highlight: true },
      { label: "Pacote LGPD / HIPAA", included: true, highlight: true },
      { label: "SLA 99,99% de uptime", included: true },
      { label: "Faturamento multi-unidade", included: true },
      { label: "Descontos por volume (até 25%)", included: true },
      { label: "CSM dedicado + suporte por telefone", included: true },
      { label: "Logs de auditoria", included: true },
      { label: "Lista de IPs permitidos", included: true },
      { label: "SCIM (provisionamento)", included: true },
      { label: "Contrato personalizado + DPA", included: true },
      { label: "Prioridade em funcionalidades", included: true },
      { label: "POC de 30 dias grátis", included: true },
      { label: "Opção on-premise (roadmap)", included: true },
    ],
  },
];

const FAQS = [
  {
    q: "O período de teste exige cartão de crédito?",
    a: "Não. Os planos Starter e Professional oferecem 14 dias de trial sem necessidade de cartão. Você só insere os dados de pagamento ao final do período se decidir continuar.",
  },
  {
    q: "Quais formas de pagamento são aceitas?",
    a: "Cartão de crédito (Visa, Mastercard, Elo, American Express), PIX e Boleto Bancário. Nota Fiscal Eletrônica (NFS-e) é emitida automaticamente para todos os planos pagos.",
  },
  {
    q: "Como funciona a cobrança anual?",
    a: "No plano anual você paga 10 meses e ganha 2 de brinde — equivalente a 17% de desconto. O valor é cobrado antecipadamente e não há reembolso parcial em caso de cancelamento.",
  },
  {
    q: "Posso mudar de plano depois?",
    a: "Sim. Upgrades são aplicados imediatamente com rateio proporcional. Downgrades entram em vigor no próximo ciclo de faturamento.",
  },
  {
    q: "O que acontece se eu exceder o limite de API?",
    a: "Para os planos Starter e Professional, chamadas excedentes custam R$ 0,15 por 1.000 chamadas. Você recebe alertas ao atingir 80% do limite. Enterprise não tem limite.",
  },
  {
    q: "Como funciona o billing multi-unidade?",
    a: "Organizações com múltiplas clínicas recebem uma única fatura consolidada. Grupos com 10+ unidades têm 15% de desconto automático; 25+ unidades, 25% de desconto.",
  },
  {
    q: "O que é o POC (Proof of Concept) Enterprise?",
    a: "Organizações Enterprise têm direito a 30 dias de uso completo gratuito antes de assinar qualquer contrato. Ideal para validar a plataforma no seu ambiente real.",
  },
  {
    q: "Como é gerada a Nota Fiscal?",
    a: "A NFS-e é emitida automaticamente via NFE.io no momento do pagamento confirmado. O PDF e o XML ficam disponíveis na área de Faturamento.",
  },
];

// ── Feature row component ─────────────────────────────────────────────────────

function FeatureRow({ label, included, highlight }: PlanFeature) {
  return (
    <li className="flex items-start gap-3 py-1.5">
      {included ? (
        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${highlight ? "bg-brand-100" : "bg-success-100"}`}>
          <Check className={`w-3 h-3 ${highlight ? "text-brand-600" : "text-success-600"}`} strokeWidth={2.5} />
        </span>
      ) : (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mt-0.5">
          <X className="w-3 h-3 text-slate-400" strokeWidth={2.5} />
        </span>
      )}
      <span className={`text-sm leading-relaxed ${included ? (highlight ? "text-brand-700 font-semibold" : "text-slate-800 font-medium") : "text-slate-400"}`}>
        {label}
      </span>
    </li>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, cycle }: { plan: PlanData; cycle: BillingCycle }) {
  const router = useRouter();
  const isAnnual = cycle === "annual";

  const displayPrice = isAnnual ? plan.price_annual_monthly : plan.price_monthly;
  const savings = isAnnual ? plan.savings_annual : null;

  function handleCta() {
    if (plan.enterprise) {
      router.push("/billing/enterprise");
    } else {
      const url = `${plan.cta_href}&cycle=${cycle}`;
      router.push(url);
    }
  }

  return (
    <Card
      className={`relative flex flex-col transition-all duration-200 overflow-hidden ${
        plan.popular
          ? "ring-2 ring-brand-600 shadow-xl scale-[1.02]"
          : plan.enterprise
          ? "ring-2 ring-slate-800 shadow-lg"
          : "ring-1 ring-slate-200 hover:shadow-md"
      }`}
    >
      {/* Popular / Enterprise badge */}
      {plan.popular && (
        <div className="absolute top-0 inset-x-0 bg-brand-600 py-2 text-center z-10">
          <span className="text-xs font-bold text-white tracking-widest uppercase flex items-center justify-center gap-1">
            <Star className="w-3 h-3" /> Mais popular
          </span>
        </div>
      )}
      {plan.enterprise && (
        <div className="absolute top-0 inset-x-0 bg-slate-800 py-2 text-center z-10">
          <span className="text-xs font-bold text-white tracking-widest uppercase flex items-center justify-center gap-1">
            <Building2 className="w-3 h-3" /> Enterprise
          </span>
        </div>
      )}

      <div className={`p-6 ${plan.popular || plan.enterprise ? "pt-12" : ""}`}>
        {/* Tier label */}
        <Badge
          variant={plan.popular ? "brand" : plan.enterprise ? "neutral" : "neutral"}
          size="sm"
          className="mb-3"
        >
          {plan.name}
        </Badge>

        <p className="text-xs text-slate-500 mb-4">{plan.tagline}</p>

        {/* Price */}
        {plan.enterprise ? (
          <div className="mb-4">
            <p className="text-2xl font-extrabold text-slate-900">Preço personalizado</p>
            <p className="text-xs text-slate-500 mt-1">Mín. R$ 2.497/mês · contrato anual</p>
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex items-end gap-1">
              <span className="text-sm font-semibold text-slate-500 self-start mt-1">R$</span>
              <span className="text-5xl font-extrabold text-slate-900 leading-none tabular-nums">
                {displayPrice?.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-sm text-slate-500 mb-1">/mês</span>
            </div>
            {isAnnual && plan.price_annual && (
              <p className="text-xs text-slate-400 mt-1">
                R$ {plan.price_annual.toLocaleString("pt-BR")}/ano
              </p>
            )}
            {savings && isAnnual && (
              <p className="text-xs text-success-600 font-semibold mt-1">
                Economia de R$ {savings.toLocaleString("pt-BR")}/ano
              </p>
            )}
            {!isAnnual && (
              <p className="text-xs text-slate-400 mt-1">ou anual com 2 meses grátis</p>
            )}
          </div>
        )}

        {/* Trial badge */}
        <div className="flex items-center gap-1.5 mb-5">
          <Clock className="w-3.5 h-3.5 text-success-600 flex-shrink-0" />
          <span className="text-xs text-success-700 font-semibold">
            {plan.trial_days} dias grátis
            {!plan.enterprise && " · sem cartão"}
          </span>
        </div>

        {/* CTA */}
        <button
          onClick={handleCta}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-150 flex items-center justify-center gap-2 ${
            plan.popular
              ? "bg-brand-600 hover:bg-brand-700 text-white shadow-md"
              : plan.enterprise
              ? "bg-slate-800 hover:bg-slate-900 text-white"
              : "border-2 border-slate-200 hover:border-brand-600 hover:text-brand-600 text-slate-700"
          }`}
        >
          {plan.cta_label}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 mx-6" />

      {/* Features */}
      <ul className="px-6 py-5 flex flex-col flex-1">
        {plan.features.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </ul>
    </Card>
  );
}

// ── FAQ accordion ─────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-900 text-sm">{q}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 bg-white">
          <p className="text-sm text-slate-600 leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

// ── Compare table (desktop) ───────────────────────────────────────────────────

const COMPARE_ROWS = [
  { label: "Usuários", starter: "Até 3", pro: "Até 15", enterprise: "Ilimitado" },
  { label: "Agendamentos/mês", starter: "500", pro: "Ilimitado", enterprise: "Ilimitado" },
  { label: "Armazenamento", starter: "5 GB", pro: "50 GB", enterprise: "Ilimitado" },
  { label: "API calls/hora", starter: "1.000", pro: "10.000", enterprise: "Ilimitado" },
  { label: "Overage API (por mil)", starter: "R$ 0,15", pro: "R$ 0,15", enterprise: "—" },
  { label: "Período de trial", starter: "14 dias", pro: "14 dias", enterprise: "30 dias (POC)" },
  { label: "Suporte", starter: "E-mail", pro: "Chat + E-mail 24h", enterprise: "CSM + Telefone" },
  { label: "Relatórios avançados", starter: "—", pro: "✓", enterprise: "✓" },
  { label: "Marca personalizada", starter: "—", pro: "✓", enterprise: "✓" },
  { label: "Webhooks", starter: "—", pro: "✓", enterprise: "✓" },
  { label: "SSO / SAML", starter: "—", pro: "—", enterprise: "✓" },
  { label: "LGPD / HIPAA", starter: "—", pro: "—", enterprise: "✓" },
  { label: "SLA", starter: "99,5%", pro: "99,9%", enterprise: "99,99%" },
  { label: "Nota Fiscal (NFS-e)", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "PIX + Boleto", starter: "✓", pro: "✓", enterprise: "✓" },
  { label: "Faturamento multi-unidade", starter: "—", pro: "—", enterprise: "✓" },
  { label: "Descontos por volume", starter: "—", pro: "—", enterprise: "Até 25%" },
];

function CompareTable({ cycle }: { cycle: BillingCycle }) {
  const isAnnual = cycle === "annual";
  const starterPrice = isAnnual ? "R$ 248/mês" : "R$ 297/mês";
  const proPrice     = isAnnual ? "R$ 581/mês" : "R$ 697/mês";

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left p-4 font-semibold text-slate-600 bg-slate-50 w-48">Recurso</th>
            <th className="text-center p-4 font-bold text-slate-900 bg-white">
              Starter<br />
              <span className="text-brand-600 font-extrabold">{starterPrice}</span>
            </th>
            <th className="text-center p-4 font-bold text-slate-900 bg-brand-50">
              <span className="text-brand-700">Professional</span><br />
              <span className="text-brand-600 font-extrabold">{proPrice}</span>
            </th>
            <th className="text-center p-4 font-bold text-slate-900 bg-slate-900 text-white rounded-tr-2xl">
              Enterprise<br />
              <span className="text-slate-300 font-normal text-xs">Personalizado</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row, i) => (
            <tr
              key={row.label}
              className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
            >
              <td className="p-4 font-medium text-slate-700">{row.label}</td>
              <td className="p-4 text-center text-slate-600">{row.starter}</td>
              <td className="p-4 text-center text-slate-700 bg-brand-50/50 font-medium">{row.pro}</td>
              <td className="p-4 text-center text-slate-100 bg-slate-800">{row.enterprise}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Social proof strip ────────────────────────────────────────────────────────

const LOGOS = [
  "Hospital São Lucas", "Clínica OrthoVida", "Instituto Motion",
  "Centro Ortopédico Nordeste", "Grupo Saúde Total",
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanosPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [showCompare, setShowCompare] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden py-20 px-4 text-white text-center"
        style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 50%, #0F2D5E 100%)" }}
      >
        <div className="absolute top-5 left-5">
          <Link href="/" className="text-xs text-blue-200 hover:text-white transition-colors font-medium">
            ← Voltar ao sistema
          </Link>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">OrthoClinic</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
          Planos e Preços
        </h1>
        <p className="text-blue-100 text-lg max-w-xl mx-auto leading-relaxed mb-8">
          Criado por ortopedista, para ortopedistas.
          <br />
          Trial gratuito, sem cartão de crédito.
        </p>

        {/* Billing cycle toggle */}
        <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full p-1 gap-1">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
              cycle === "monthly"
                ? "bg-white text-slate-900 shadow"
                : "text-white/80 hover:text-white"
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setCycle("annual")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              cycle === "annual"
                ? "bg-white text-slate-900 shadow"
                : "text-white/80 hover:text-white"
            }`}
          >
            Anual
            <span className="bg-success-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              -17%
            </span>
          </button>
        </div>

        {/* Decorative */}
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
      </header>

      {/* ── Plans grid ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 -mt-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <PlanCard key={plan.tier} plan={plan} cycle={cycle} />
          ))}
        </div>

        {/* Trust strip */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-center">
          {[
            { icon: Shield, label: "Dados no Brasil (LGPD)" },
            { icon: Zap, label: "99,9% de uptime" },
            { icon: Phone, label: "Suporte em PT-BR" },
            { icon: Database, label: "Backup diário" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <Icon className="w-3.5 h-3.5 text-brand-500" />
              {label}
            </div>
          ))}
        </div>

        {/* Toggle compare */}
        <div className="mt-10 text-center">
          <button
            onClick={() => setShowCompare(!showCompare)}
            className="inline-flex items-center gap-2 text-sm text-brand-600 font-semibold hover:underline"
          >
            {showCompare ? "Ocultar comparativo" : "Ver comparativo completo"}
            {showCompare ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showCompare && (
          <div className="mt-6">
            <CompareTable cycle={cycle} />
          </div>
        )}
      </section>

      {/* ── Social proof ────────────────────────────────────────────── */}
      <section className="border-t border-b border-slate-200 py-10 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-6">
            Confiado por clínicas em todo o Brasil
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {LOGOS.map((name) => (
              <span key={name} className="text-slate-300 font-bold text-sm tracking-wide">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enterprise callout ───────────────────────────────────────── */}
      <section
        className="py-20 px-4"
        style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="text-white">
              <Badge variant="brand" size="sm" className="mb-4 bg-white/20 text-white border-0">
                Enterprise
              </Badge>
              <h2 className="text-3xl font-extrabold mb-4 leading-tight">
                Múltiplas unidades?<br />
                Temos um plano para você.
              </h2>
              <ul className="space-y-2 text-blue-100 text-sm">
                {[
                  "Fatura única para todas as unidades",
                  "Desconto de até 25% por volume",
                  "CSM dedicado + suporte telefônico",
                  "POC gratuito de 30 dias",
                  "SSO, SCIM, auditoria e LGPD",
                  "Contrato personalizado com DPA",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-xl">
              <p className="font-bold text-slate-900 text-lg mb-1">Fale com um especialista</p>
              <p className="text-sm text-slate-500 mb-5">
                Resposta em até 24 horas. Sem compromisso.
              </p>
              <Link href="/billing/enterprise">
                <button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                  Solicitar proposta Enterprise
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <p className="text-xs text-slate-400 text-center mt-4">
                Mínimo R$ 2.497/mês · Contratos anuais ou multi-anuais
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-8">
          Perguntas frequentes
        </h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 py-8 text-center bg-white">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} OrthoClinic · Todos os direitos reservados
        </p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link href="/termos" className="text-xs text-slate-400 hover:text-brand-600 hover:underline">Termos de Uso</Link>
          <span className="text-slate-200">·</span>
          <Link href="/privacidade" className="text-xs text-slate-400 hover:text-brand-600 hover:underline">Privacidade</Link>
          <span className="text-slate-200">·</span>
          <Link href="/contrato" className="text-xs text-slate-400 hover:text-brand-600 hover:underline">Contrato</Link>
          <span className="text-slate-200">·</span>
          <Link href="/billing" className="text-xs text-slate-400 hover:text-brand-600 hover:underline">Meu Faturamento</Link>
        </div>
      </footer>

    </div>
  );
}
