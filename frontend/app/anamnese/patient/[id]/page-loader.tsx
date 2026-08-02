"use client";

/**
 * Rota LEGADO (auditoria 02/08): a tela de anamnese v2 chamava /api/anamneses,
 * um backend paralelo que nunca foi registrado — dava 404 sempre. A anamnese
 * do paciente vive na FICHA dele (aba Anamnese do prontuário), então esta
 * rota agora só redireciona pra lá. O page-client.tsx antigo ficou órfão de
 * propósito (não é mais importado).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PageLoader() {
  const router = useRouter();

  useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).pop();
    router.replace(id && id !== "_" ? `/pacientes/${id}` : "/pacientes");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">
      Abrindo a ficha do paciente…
    </div>
  );
}
