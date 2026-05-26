"use client";
import Link from "next/link";
import { User, Phone, Shield, Stethoscope } from "lucide-react";
import { calcAge, formatDate } from "@/lib/utils";

interface Patient {
  id: number;
  name: string;
  phone?: string;
  birthdate?: string;
  insurance?: string;
  photo_url?: string;
  consultation_count?: number;
}

export default function PatientCard({ patient }: { patient: Patient }) {
  return (
    <Link href={`/pacientes/${patient.id}`}>
      <div className="card p-4 flex items-center gap-4 hover:shadow-md hover:border-gray-200 active:scale-95 transition-all duration-150 cursor-pointer">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {patient.photo_url ? (
            <img
              src={`http://localhost:8002${patient.photo_url}`}
              alt={patient.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-7 h-7 text-brand-600" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{patient.name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {patient.birthdate && (
              <span className="text-xs text-gray-500">{calcAge(patient.birthdate)}</span>
            )}
            {patient.phone && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {patient.phone}
              </span>
            )}
            {patient.insurance && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {patient.insurance}
              </span>
            )}
          </div>
        </div>

        {/* Consultas */}
        {patient.consultation_count !== undefined && (
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Stethoscope className="w-3 h-3" />
              <span>{patient.consultation_count}</span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
