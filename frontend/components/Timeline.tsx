"use client";
import { formatDateTime } from "@/lib/utils";
import {
  Stethoscope, FileText, FlaskConical, Dumbbell, ClipboardList,
} from "lucide-react";

interface TimelineItem {
  id: number;
  type: string;
  subtype?: string;
  date: string;
  title: string;
  summary?: string;
  diagnosis?: string;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  consulta: { icon: Stethoscope, color: "text-brand-600", bg: "bg-brand-100" },
  receita: { icon: FileText, color: "text-teal-600", bg: "bg-teal-100" },
  exame: { icon: FlaskConical, color: "text-purple-600", bg: "bg-purple-100" },
  fisio: { icon: Dumbbell, color: "text-amber-600", bg: "bg-amber-100" },
  laudo: { icon: ClipboardList, color: "text-gray-600", bg: "bg-gray-100" },
};

interface Props {
  items: TimelineItem[];
  patientId: number;
}

export default function Timeline({ items, patientId }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Stethoscope className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Nenhum registro encontrado</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Linha vertical */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-100" />

      <div className="space-y-4">
        {items.map((item) => {
          const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.laudo;
          const Icon = cfg.icon;
          return (
            <div key={`${item.type}-${item.id}`} className="flex gap-4 items-start">
              {/* Ícone na linha */}
              <div className={`relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>

              {/* Conteúdo */}
              <div className="card flex-1 p-4 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{item.title}</p>
                    {item.summary && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{item.summary}</p>
                    )}
                    {item.diagnosis && (
                      <p className="text-xs text-brand-700 mt-1 font-medium truncate">
                        {item.diagnosis}
                      </p>
                    )}
                  </div>
                  <time className="text-xs text-gray-400 flex-shrink-0">
                    {formatDateTime(item.date)}
                  </time>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
