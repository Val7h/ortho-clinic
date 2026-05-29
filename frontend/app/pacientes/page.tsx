"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Search, UserX } from "lucide-react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import PatientCard from "@/components/PatientCard";
import { patientsApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";

export default function PatientsPage() {
  const { user, loading: authLoading } = useProtectedPage();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await patientsApi.list(q);
      setPatients(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar
        title="Pacientes"
        back="/"
        actions={
          <Link href="/pacientes/novo">
            <button className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              Novo
            </button>
          </Link>
        }
      />

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por nome, CPF ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* Lista */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-[74px] animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <UserX className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">
              {search ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
            </p>
            {!search && (
              <Link href="/pacientes/novo">
                <button className="btn-primary mt-4 text-sm">Cadastrar primeiro paciente</button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">{patients.length} paciente{patients.length !== 1 ? "s" : ""}</p>
            {patients.map((p) => (
              <PatientCard key={p.id} patient={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
