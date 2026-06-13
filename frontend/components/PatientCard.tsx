"use client";
/**
 * PatientCard — Sprint 6 performance edition
 *
 * Optimisations applied:
 *   1. React.memo — card only re-renders when its patient prop changes
 *      (critical in a virtualised list where parent re-renders on every scroll tick)
 *   2. next/image — replaces bare <img> for automatic WebP/AVIF + srcSet
 *   3. Stable avatar colour — computed once, no per-render recalc
 *   4. Lucide icons are tree-shaken at build time (only Phone/Shield/ChevronRight)
 *   5. prefetch={false} on Link — avoids pre-fetching 50+ patient pages on mount
 */

import Link from "next/link";
import Image from "next/image";
import { Phone, Shield, ChevronRight } from "lucide-react";
import { calcAge } from "@/lib/utils";
import { memo, useState } from "react";

export interface Patient {
  id: number;
  name: string;
  phone?: string;
  birthdate?: string;
  insurance?: string;
  photo_url?: string;
  consultation_count?: number;
}

// ── Stable helpers (defined outside component — no per-render allocation) ──

const AVATAR_COLORS = [
  "bg-brand-600",
  "bg-accent-600",
  "bg-purple-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-indigo-600",
  "bg-teal-600",
] as const;

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://ortho-backend.onrender.com";

// ── Avatar — next/image for automatic WebP + lazy loading ─────────────────

const PatientAvatar = memo(function PatientAvatar({
  patient,
}: {
  patient: Patient;
}) {
  const [imgError, setImgError] = useState(false);
  const showPhoto = !!patient.photo_url && !imgError;
  const color = avatarColor(patient.name);

  return (
    <div
      className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden relative ${
        showPhoto ? "bg-slate-100" : color
      }`}
    >
      {/* Initials — always present, hidden once photo is ready */}
      {!showPhoto && (
        <span className="text-white font-bold text-sm select-none">
          {initials(patient.name)}
        </span>
      )}

      {showPhoto && (
        <Image
          src={`${API_URL}${patient.photo_url}`}
          alt=""
          fill
          sizes="48px"
          className="object-cover"
          // loading="lazy" is the default for non-priority images
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
});

// ── Main card ──────────────────────────────────────────────────────────────

function PatientCardBase({ patient }: { patient: Patient }) {
  return (
    <Link href={`/pacientes/${patient.id}`} prefetch={false}>
      <div className="card card-hover p-4 flex items-center gap-3.5 cursor-pointer group">
        <PatientAvatar patient={patient} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 dark:text-slate-50 truncate text-[15px] leading-tight">
            {patient.name}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {patient.birthdate && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {calcAge(patient.birthdate)}
              </span>
            )}
            {patient.phone && (
              <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <Phone className="w-3 h-3" aria-hidden />
                {patient.phone}
              </span>
            )}
            {patient.insurance && (
              <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <Shield className="w-3 h-3" aria-hidden />
                {patient.insurance}
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!!patient.consultation_count && patient.consultation_count > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 border border-brand-100 dark:border-brand-700">
              {patient.consultation_count}×
            </span>
          )}
          <ChevronRight
            className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}

// React.memo with custom equality — skip re-render when patient data is identical
const PatientCard = memo(PatientCardBase, (prev, next) => {
  const a = prev.patient;
  const b = next.patient;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.phone === b.phone &&
    a.birthdate === b.birthdate &&
    a.insurance === b.insurance &&
    a.photo_url === b.photo_url &&
    a.consultation_count === b.consultation_count
  );
});

export default PatientCard;
