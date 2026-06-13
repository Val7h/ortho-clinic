"use client";

/**
 * DeepLinkHandler
 *
 * Intercepta query params especiais e abre os modais correspondentes.
 * Deve ser montado dentro do NavigationProvider (uma única vez no layout).
 *
 * ARQUITETURA: dividido em duas partes para evitar que useSearchParams()
 * cause Suspense no layout inteiro:
 *
 *   DeepLinkHandler (outer) — monta SW message listener, renderiza modais
 *   SearchParamsWatcher (inner) — usa useSearchParams() dentro de <Suspense>
 *
 * URL patterns suportadas:
 *   /agenda?nova=true              → abre NewAppointmentModal
 *   /agenda?nova=true&paciente=123 → abre NewAppointmentModal com paciente pré-selecionado
 *   /pacientes?novo=true           → abre NewPatientModal
 *
 * Push notification payloads (via service worker postMessage):
 *   { type: "OPEN_CONSULTATION", id: 123 }  → router.push('/agenda?consulta=123')
 *   { type: "OPEN_PATIENT", id: 456 }        → router.push('/pacientes/456')
 */

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { NewAppointmentModal } from "@/components/navigation/NewAppointmentModal";
import { NewPatientModal } from "@/components/navigation/NewPatientModal";

// ── Inner component: isolated inside Suspense so it never blocks the layout ──

interface SearchParamsWatcherProps {
  onOpenAppointment: (patientId?: number) => void;
  onOpenPatient: () => void;
}

function SearchParamsWatcher({ onOpenAppointment, onOpenPatient }: SearchParamsWatcherProps) {
  const router = useRouter();
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw ?? "/";
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams) return;

    const nova = searchParams.get("nova");
    const novo = searchParams.get("novo");
    const pacienteId = searchParams.get("paciente");

    if (pathname.startsWith("/agenda") && nova === "true") {
      onOpenAppointment(pacienteId ? parseInt(pacienteId) : undefined);
      router.replace(pathname, { scroll: false });
    }

    if (pathname.startsWith("/pacientes") && novo === "true") {
      onOpenPatient();
      router.replace(pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}

// ── Outer component: no Suspense-triggering hooks, safe in root layout ──

export function DeepLinkHandler() {
  const router = useRouter();
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [preselectedPatient, setPreselectedPatient] = useState<number | undefined>();

  const handleOpenAppointment = (patientId?: number) => {
    setPreselectedPatient(patientId);
    setAppointmentOpen(true);
  };

  const handleOpenPatient = () => setPatientOpen(true);

  // Push notification navigation via service worker postMessage
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleMessage(event: MessageEvent) {
      const { type, id } = event.data ?? {};
      if (type === "OPEN_CONSULTATION" && id) {
        router.push(`/agenda?consulta=${id}`);
      } else if (type === "OPEN_PATIENT" && id) {
        router.push(`/pacientes/${id}`);
      } else if (type === "OPEN_NEW_APPOINTMENT") {
        router.push("/agenda?nova=true");
      }
    }

    navigator.serviceWorker?.addEventListener("message", handleMessage);
    const bc =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("orthoclinic-nav")
        : null;
    bc?.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
      bc?.removeEventListener("message", handleMessage);
      bc?.close();
    };
  }, [router]);

  return (
    <>
      {/* SearchParamsWatcher is isolated in Suspense — never blocks the layout tree */}
      <Suspense fallback={null}>
        <SearchParamsWatcher
          onOpenAppointment={handleOpenAppointment}
          onOpenPatient={handleOpenPatient}
        />
      </Suspense>

      <NewAppointmentModal
        open={appointmentOpen}
        onClose={() => setAppointmentOpen(false)}
        preselectedPatientId={preselectedPatient}
      />
      <NewPatientModal
        open={patientOpen}
        onClose={() => setPatientOpen(false)}
      />
    </>
  );
}
