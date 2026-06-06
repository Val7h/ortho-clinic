"use client";
import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  href: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  color: string;        // Tailwind bg-* gradient class or inline style color
  badge?: string | number;
  alert?: boolean;      // show red dot for urgent items
}

export default function ModuleCard({
  href,
  icon: Icon,
  label,
  description,
  color,
  badge,
  alert,
}: ModuleCardProps) {
  return (
    <Link href={href}>
      <div className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] active:scale-95 shadow-card hover:shadow-card-hover border border-white/50 dark:border-slate-800">

        {/* Color top — app-icon style */}
        <div className={cn(
          "h-[88px] flex items-center justify-center relative",
          color,
        )}>
          {/* Subtle inner glow */}
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />

          <Icon className="w-9 h-9 text-white drop-shadow-sm relative z-10" />

          {/* Badge count */}
          {badge !== undefined && Number(badge) > 0 && (
            <span className="absolute top-2 right-2.5 bg-white/25 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-full border border-white/30 z-10">
              {badge}
            </span>
          )}

          {/* Alert dot */}
          {alert && (
            <span className="absolute top-2 left-2.5 w-2.5 h-2.5 bg-red-400 rounded-full border-2 border-white/80 z-10" />
          )}
        </div>

        {/* White label area */}
        <div className="bg-white dark:bg-slate-950 px-3 py-2.5">
          <p className="font-bold text-slate-900 dark:text-slate-50 text-[13px] leading-tight">{label}</p>
          {description && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 truncate">{description}</p>
          )}
        </div>

      </div>
    </Link>
  );
}
