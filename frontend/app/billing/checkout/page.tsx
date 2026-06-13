"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Zap, Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter — R$ 297/mês",
  professional: "Professional — R$ 697/mês",
};

const PLAN_ANNUAL_LABELS: Record<string, string> = {
  starter: "Starter — R$ 248/mês (anual)",
  professional: "Professional — R$ 581/mês (anual)",
};

function CheckoutContent() {
  const params = useSearchParams();
  const router = useRouter();
  const plan  = params?.get("plan") ?? "starter";
  const cycle = (params?.get("cycle") ?? "monthly") as "monthly" | "annual";

  const [paymentMethods, setPaymentMethods] = useState<string[]>(["card", "boleto"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planLabel = cycle === "annual" ? PLAN_ANNUAL_LABELS[plan] : PLAN_LABELS[plan];
  const trialDays = 14;

  async function startCheckout() {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token") ?? "";
    try {
      const r = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan_tier: plan,
          billing_cycle: cycle,
          payment_methods: paymentMethods,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? "Erro ao iniciar checkout.");
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setLoading(false);
    }
  }

  const togglePM = (pm: string) => {
    setPaymentMethods((prev) =>
      prev.includes(pm) ? prev.filter((p) => p !== pm) : [...prev, pm]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-6 h-6 text-brand-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Iniciar assinatura</h1>
          <p className="text-slate-500 text-sm mt-2">
            {planLabel}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">

          {/* Trial notice */}
          <div className="bg-success-50 border border-success-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-success-800">
                {trialDays} dias grátis · sem cartão obrigatório
              </p>
              <p className="text-xs text-success-600 mt-0.5">
                Você só paga após o período de trial. Cancele a qualquer momento.
              </p>
            </div>
          </div>

          {/* Payment method preference */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Métodos de pagamento aceitos</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "card",   label: "Cartão",  icon: "💳" },
                { id: "boleto", label: "Boleto",  icon: "📄" },
                { id: "pix",    label: "PIX",     icon: "⚡" },
              ].map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePM(id)}
                  className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    paymentMethods.includes(id)
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-400"
                  }`}
                >
                  <span className="block text-lg mb-0.5">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Você poderá escolher o método exato no próximo passo (Stripe)
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={startCheckout}
            disabled={loading || paymentMethods.length === 0}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Redirecionando para o Stripe...</>
            ) : (
              "Ir para o pagamento seguro"
            )}
          </button>

          {/* Trust */}
          <div className="flex items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> SSL 256-bit</span>
            <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Stripe Payments</span>
            <span className="flex items-center gap-1">NFS-e automática</span>
          </div>

          <div className="text-center">
            <Link href="/planos" className="text-xs text-slate-400 hover:text-brand-600 underline">
              ← Voltar aos planos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
