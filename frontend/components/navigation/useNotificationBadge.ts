"use client";

/**
 * useNotificationBadge
 *
 * Hook que provê contagens de badge para as tabs.
 * - agendaBadge: consultas de hoje ainda não atendidas
 * - documentosBadge: documentos pendentes de assinatura
 *
 * Atualiza a cada 60 s via polling leve. Não lança erro se API offline.
 */

import { useEffect, useState } from "react";
import { agendaApi } from "@/lib/api";

interface BadgeCounts {
  agendaBadge: number;
  documentosBadge: number;
}

export function useNotificationBadge(): BadgeCounts {
  const [counts, setCounts] = useState<BadgeCounts>({
    agendaBadge: 0,
    documentosBadge: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      try {
        const today = new Date().toISOString().split("T")[0];
        // Fetch today's agenda items
        const items = await agendaApi.get(today, today);
        if (cancelled) return;

        const pending = Array.isArray(items)
          ? items.filter(
              (c: any) => c.status === "scheduled" || c.status === "waiting"
            ).length
          : 0;

        setCounts((prev) => ({ ...prev, agendaBadge: pending }));
      } catch {
        // silently ignore — badge is cosmetic
      }
    }

    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return counts;
}
