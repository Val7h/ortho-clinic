"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle, ArrowRight, FileText, Zap } from "lucide-react";

function SucessoContent() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-success-600" />
        </div>

        <h1 className="text-3xl font-extrabold text-slate-900 mb-3">
          Assinatura ativa!
        </h1>
        <p className="text-slate-500 text-base mb-8 leading-relaxed">
          Bem-vindo ao OrthoClinic. Seu período de trial já começou.
          Em breve você receberá o e-mail de confirmação com os detalhes da assinatura.
        </p>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: CheckCircle, label: "Trial de 14 dias", sub: "Sem cobrança agora" },
            { icon: FileText, label: "NFS-e automática", sub: "Após cada pagamento" },
            { icon: Zap, label: "API ativa", sub: "Comece a integrar" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
              <Icon className="w-5 h-5 text-brand-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-900">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <button className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white font-bold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              Ir para o painel <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <Link href="/billing">
            <button className="w-full sm:w-auto border-2 border-slate-200 hover:border-brand-400 text-slate-700 font-semibold px-6 py-3 rounded-xl transition-colors">
              Ver faturamento
            </button>
          </Link>
        </div>

        {sessionId && (
          <p className="text-xs text-slate-300 mt-6">
            Sessão: {sessionId}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SucessoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" />}>
      <SucessoContent />
    </Suspense>
  );
}
