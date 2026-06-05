"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, X, ChevronDown, ChevronUp, Stethoscope } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Feature {
  label: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: number;
  period: string;
  description: string;
  popular: boolean;
  features: Feature[];
  ctaLabel: string;
  waMessage: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const plans: Plan[] = [
  {
    name: "Starter",
    price: 197,
    period: "mês",
    description: "Ideal para clínicas individuais que estão começando a digitalizar.",
    popular: false,
    ctaLabel: "Começar agora",
    waMessage: "Olá! Tenho interesse no plano Starter do OrthoClinic (R$197/mês). Podem me ajudar?",
    features: [
      { label: "1 clínica", included: true },
      { label: "Até 2 usuários", included: true },
      { label: "Prontuário eletrônico", included: true },
      { label: "Agendamento online", included: true },
      { label: "Walk-in (fila de espera)", included: true },
      { label: "Geração de PDFs", included: true },
      { label: "WhatsApp automático", included: false },
      { label: "Anamnese digital", included: false },
      { label: "Teleconsulta", included: false },
      { label: "Módulo financeiro", included: false },
      { label: "Suporte prioritário", included: false },
      { label: "Onboarding dedicado", included: false },
    ],
  },
  {
    name: "Pro",
    price: 297,
    period: "mês",
    description: "Para clínicas em crescimento que precisam de automação e mais recursos.",
    popular: true,
    ctaLabel: "Quero o Pro",
    waMessage: "Olá! Tenho interesse no plano Pro do OrthoClinic (R$297/mês). Podem me ajudar?",
    features: [
      { label: "Até 3 clínicas", included: true },
      { label: "Até 5 usuários", included: true },
      { label: "Prontuário eletrônico", included: true },
      { label: "Agendamento online", included: true },
      { label: "Walk-in (fila de espera)", included: true },
      { label: "Geração de PDFs", included: true },
      { label: "WhatsApp automático", included: true },
      { label: "Anamnese digital", included: true },
      { label: "Teleconsulta", included: true },
      { label: "Módulo financeiro", included: true },
      { label: "Suporte prioritário", included: false },
      { label: "Onboarding dedicado", included: false },
    ],
  },
  {
    name: "Premium",
    price: 397,
    period: "mês",
    description: "Para grupos e redes com múltiplas unidades e equipe ampla.",
    popular: false,
    ctaLabel: "Falar com especialista",
    waMessage: "Olá! Tenho interesse no plano Premium do OrthoClinic (R$397/mês). Podem me ajudar?",
    features: [
      { label: "Clínicas ilimitadas", included: true },
      { label: "Usuários ilimitados", included: true },
      { label: "Prontuário eletrônico", included: true },
      { label: "Agendamento online", included: true },
      { label: "Walk-in (fila de espera)", included: true },
      { label: "Geração de PDFs", included: true },
      { label: "WhatsApp automático", included: true },
      { label: "Anamnese digital", included: true },
      { label: "Teleconsulta", included: true },
      { label: "Módulo financeiro", included: true },
      { label: "Suporte prioritário", included: true },
      { label: "Onboarding dedicado", included: true },
    ],
  },
];

const faqs = [
  {
    question: "Posso mudar de plano depois?",
    answer:
      "Sim! Você pode fazer upgrade ou downgrade a qualquer momento. O valor é ajustado proporcionalmente ao período restante do mês.",
  },
  {
    question: "Há fidelidade ou contrato mínimo?",
    answer:
      "Não. Todos os planos são mensais, sem fidelidade. Você pode cancelar quando quiser, sem multa.",
  },
  {
    question: "O sistema funciona em celular?",
    answer:
      "Sim. O OrthoClinic é totalmente responsivo e funciona em qualquer dispositivo — celular, tablet ou computador.",
  },
  {
    question: "Como funciona o suporte?",
    answer:
      "Starter e Pro têm suporte via WhatsApp em horário comercial (seg–sex, 8h–18h). O plano Premium inclui suporte prioritário com resposta em até 2 horas e canal dedicado.",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureRow({ label, included }: Feature) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      {included ? (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="w-3 h-3 text-emerald-600" strokeWidth={2.5} />
        </span>
      ) : (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
          <X className="w-3 h-3 text-slate-400" strokeWidth={2.5} />
        </span>
      )}
      <span className={`text-sm ${included ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
    </li>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const waUrl = `https://wa.me/5583999999999?text=${encodeURIComponent(plan.waMessage)}`;

  return (
    <div
      className={`relative flex flex-col rounded-2xl bg-white shadow-lg overflow-hidden transition-transform hover:-translate-y-1 ${
        plan.popular
          ? "ring-2 ring-blue-600 shadow-blue-100"
          : "ring-1 ring-slate-200"
      }`}
    >
      {/* Popular badge */}
      {plan.popular && (
        <div className="absolute top-0 left-0 right-0 text-center bg-blue-600 py-1.5">
          <span className="text-xs font-bold text-white tracking-widest uppercase">
            Mais popular
          </span>
        </div>
      )}

      <div className={`p-7 ${plan.popular ? "pt-10" : ""}`}>
        {/* Plan name */}
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
          {plan.name}
        </p>

        {/* Price */}
        <div className="flex items-end gap-1 mb-3">
          <span className="text-sm font-semibold text-slate-500 self-start mt-2">R$</span>
          <span className="text-5xl font-extrabold text-slate-900 leading-none">
            {plan.price}
          </span>
          <span className="text-sm text-slate-400 mb-1">/{plan.period}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">{plan.description}</p>

        {/* CTA */}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`block w-full text-center py-3 rounded-xl font-bold text-sm transition-all ${
            plan.popular
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200"
              : "bg-slate-900 text-white hover:bg-slate-700"
          }`}
        >
          {plan.ctaLabel}
        </a>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 mx-6" />

      {/* Features list */}
      <ul className="px-7 py-5 flex flex-col gap-0.5 flex-1">
        {plan.features.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-800 text-sm">{question}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
          <p className="text-sm text-slate-600 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanosPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="relative overflow-hidden py-20 px-4 text-white text-center"
        style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
      >
        {/* Back to dashboard */}
        <div className="absolute top-5 left-5">
          <Link
            href="/"
            className="text-xs text-blue-200 hover:text-white transition-colors font-medium"
          >
            ← Voltar ao sistema
          </Link>
        </div>

        {/* Logo mark */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">OrthoClinic</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
          Planos e Preços
        </h1>
        <p className="text-blue-100 text-lg max-w-xl mx-auto leading-relaxed">
          Criado por ortopedista para ortopedistas.
          <br />
          Escolha o plano ideal para a sua clínica.
        </p>

        {/* Decorative circles */}
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
      </header>

      {/* ── Plans ───────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 -mt-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        {/* Trust strip */}
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-400">
            Sem fidelidade · Cancele quando quiser · Dados criptografados · Servidor no Brasil
          </p>
        </div>
      </section>

      {/* ── Feature comparison callout ───────────────────────────────────── */}
      <section
        className="py-14 px-4"
        style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
      >
        <div className="max-w-2xl mx-auto text-center text-white">
          <h2 className="text-2xl font-extrabold mb-3">Tem dúvidas sobre qual plano escolher?</h2>
          <p className="text-blue-100 text-sm mb-8">
            Nossa equipe entende a rotina de uma clínica de ortopedia.
            Fale com a gente pelo WhatsApp e te ajudamos a decidir.
          </p>
          <a
            href={`https://wa.me/5583999999999?text=${encodeURIComponent("Olá! Quero saber qual plano do OrthoClinic é ideal para minha clínica.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-emerald-900/30 text-sm"
          >
            Falar com consultor pelo WhatsApp
          </a>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-8">
          Perguntas frequentes
        </h2>
        <div className="flex flex-col gap-3">
          {faqs.map((faq) => (
            <FaqItem key={faq.question} {...faq} />
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 py-8 text-center">
        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} OrthoClinic · Todos os direitos reservados
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Desenvolvido por ortopedistas, para ortopedistas.
        </p>
      </footer>

    </div>
  );
}
