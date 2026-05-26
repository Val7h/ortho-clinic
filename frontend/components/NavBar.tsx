"use client";
import { ChevronLeft, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";

interface NavBarProps {
  title: string;
  subtitle?: string;
  back?: string | true;
  actions?: React.ReactNode;
}

export default function NavBar({ title, subtitle, back, actions }: NavBarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof back === "string") router.push(back);
    else router.back();
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10 no-print">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
        {back && (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {!back && (
          <div className="flex items-center gap-2 mr-1">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
