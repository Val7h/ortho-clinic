"use client";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface NavBarProps {
  title: string;
  subtitle?: string;
  back?: string | true;
  actions?: React.ReactNode;
}

// OrthoClinic bone/joint icon (inline SVG for crisp rendering)
function OrthoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6a3 3 0 0 0-3-3 3 3 0 0 0-2.1 5.1L6.1 14.9A3 3 0 0 0 3 17a3 3 0 0 0 3 3 3 3 0 0 0 2.1-5.1l6.8-6.8A3 3 0 0 0 18 6z"/>
    </svg>
  );
}

export default function NavBar({ title, subtitle, back, actions }: NavBarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof back === "string") router.push(back);
    else router.back();
  };

  return (
    <header
      className="sticky top-0 z-20 no-print"
      style={{ background: "linear-gradient(135deg, #0F2D5E 0%, #1A4A9A 100%)" }}
    >
      {/* Subtle bottom glow line */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />

      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">

        {/* Back button or brand logo */}
        {back ? (
          <button
            onClick={handleBack}
            className="p-2 -ml-1.5 rounded-xl hover:bg-white/15 active:bg-white/25 transition-colors"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 mr-0.5">
            <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/20">
              <span className="text-white"><OrthoIcon /></span>
            </div>
            <div className="hidden sm:block">
              <span className="font-extrabold text-white text-sm tracking-tight">OrthoClinic</span>
            </div>
          </div>
        )}

        {/* Title area */}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-[15px] truncate leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-blue-200/80 truncate leading-tight mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 text-white">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
