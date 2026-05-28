"use client";
import Link from "next/link";
import { Phone, Shield, ChevronRight } from "lucide-react";
import { calcAge } from "@/lib/utils";

interface Patient {
  id: number;
  name: string;
  phone?: string;
  birthdate?: string;
  insurance?: string;
  photo_url?: string;
  consultation_count?: number;
}

// Generate a consistent color for a patient based on their name
function avatarColor(name: string): string {
  const colors = [
    "bg-brand-600",
    "bg-accent-600",
    "bg-purple-600",
    "bg-emerald-600",
    "bg-rose-600",
    "bg-amber-600",
    "bg-indigo-600",
    "bg-teal-600",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

export default function PatientCard({ patient }: { patient: Patient }) {
  return (
    <Link href={`/pacientes/${patient.id}`}>
      <div className="card card-hover p-4 flex items-center gap-3.5 cursor-pointer group">

        {/* Avatar */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden ${
          patient.photo_url ? "" : avatarColor(patient.name)
        }`}>
          {patient.photo_url ? (
            <img
              src={`${API_URL}${patient.photo_url}`}
              alt={patient.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white font-bold text-sm">{initials(patient.name)}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate text-[15px] leading-tight">
            {patient.name}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {patient.birthdate && (
              <span className="text-xs text-slate-500 font-medium">
                {calcAge(patient.birthdate)}
              </span>
            )}
            {patient.phone && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {patient.phone}
              </span>
            )}
            {patient.insurance && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {patient.insurance}
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {patient.consultation_count !== undefined && patient.consultation_count > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100">
              {patient.consultation_count}×
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
        </div>

      </div>
    </Link>
  );
}
