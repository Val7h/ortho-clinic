"use client";
import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  href: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  color: string;
  badge?: string | number;
}

export default function ModuleCard({
  href,
  icon: Icon,
  label,
  description,
  color,
  badge,
}: ModuleCardProps) {
  return (
    <Link href={href}>
      <div className="group card p-6 flex flex-col gap-4 cursor-pointer hover:shadow-md hover:border-gray-200 active:scale-95 transition-all duration-150 min-h-[140px]">
        <div className="flex items-start justify-between">
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          {badge !== undefined && (
            <span className="bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-base">{label}</p>
          {description && <p className="text-sm text-gray-500 mt-0.5 leading-tight">{description}</p>}
        </div>
      </div>
    </Link>
  );
}
