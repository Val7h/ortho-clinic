"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  User, Phone, Mail, Shield, Stethoscope,
  FileText, FlaskConical, Dumbbell, ClipboardList,
  BookOpen, Plus, Edit, Trash2, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import Timeline from "@/components/Timeline";
import { patientsApi } from "@/lib/api";
import { calcAge, formatDate, formatDate as fd } from "@/lib/utils";

type Tab = "timeline" | "dados" | "documentos";

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const router = useRouter();

  const [patient, setPatient] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("timeline");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([patientsApi.get(pid), patientsApi.timeline(pid)])
      .then(([p, t]) => { setPatient(p); setTimeline(t); })
      .catch(() => toast.error("Erro ao carregar paciente"))
      .finally(() => setLoading(false));
  }, [pid]);

  const handleDelete = async () => {
    if (!confirm(`Desativar o cadastro de ${patient?.name}?`)) return;
    await patientsApi.delete(pid);
    toast.success("Paciente desativado");
    router.push("/pacientes");
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!patient) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "timeline", label: "Timeline" },
    { key: "dados", label: "Dados" },
    { key: "documentos", label: "Documentos" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar
        title={patient.name}
        subtitle={patient.birthdate ? `${calcAge(patient.birthdate)} • ${patient.insurance || "Particular"}` : patient.insurance || "Particular"}
        back="/pacientes"
        actions={
          <div className="flex gap-2">
            <Link href={`/pacientes/${pid}/consulta`}>
              <button className="btn-primary text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Consulta
              </button>
            </Link>
          </div>
        }
      />

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Card do paciente */}
        <div className="card p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="font-bold text-lg text-gray-900">{patient.name}</p>
            <div className="flex flex-wrap gap-3 text-sm text-gray-500">
              {patient.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{patient.email}</span>}
              {patient.insurance && <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{patient.insurance}</span>}
            </div>
            {patient.allergies && (
              <p className="text-xs text-red-600 font-medium">⚠ Alergia: {patient.allergies}</p>
            )}
          </div>
        </div>

        {/* Ações rápidas de documentos */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: `/pacientes/${pid}/receita`, icon: FileText, label: "Receita", color: "bg-teal-50 text-teal-700" },
            { href: `/pacientes/${pid}/exames`, icon: FlaskConical, label: "Exames", color: "bg-purple-50 text-purple-700" },
            { href: `/pacientes/${pid}/fisio`, icon: Dumbbell, label: "Fisio", color: "bg-amber-50 text-amber-700" },
            { href: `/pacientes/${pid}/laudo`, icon: ClipboardList, label: "Laudo", color: "bg-gray-50 text-gray-700" },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link key={label} href={href}>
              <div className={`card p-3 flex flex-col items-center gap-2 cursor-pointer hover:shadow-md active:scale-95 transition-all ${color}`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === key ? "bg-brand-600 text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo da tab */}
        {tab === "timeline" && (
          <div className="space-y-2">
            {timeline.length === 0 ? (
              <div className="card p-8 text-center">
                <Stethoscope className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Nenhum registro ainda.</p>
                <Link href={`/pacientes/${pid}/consulta`}>
                  <button className="btn-primary mt-4 text-sm">Iniciar primeira consulta</button>
                </Link>
              </div>
            ) : (
              <Timeline items={timeline} patientId={pid} />
            )}
          </div>
        )}

        {tab === "dados" && (
          <div className="space-y-4">
            <DataSection title="Dados Pessoais" items={[
              { label: "Nome", value: patient.name },
              { label: "Nascimento", value: patient.birthdate ? `${formatDate(patient.birthdate)} (${calcAge(patient.birthdate)})` : null },
              { label: "CPF", value: patient.cpf },
              { label: "Gênero", value: patient.gender === "M" ? "Masculino" : patient.gender === "F" ? "Feminino" : patient.gender },
              { label: "Estado civil", value: patient.civil_status },
              { label: "Profissão", value: patient.occupation },
            ]} />
            <DataSection title="Contato" items={[
              { label: "Telefone", value: patient.phone },
              { label: "Telefone 2", value: patient.phone2 },
              { label: "E-mail", value: patient.email },
              { label: "Endereço", value: patient.address_street },
              { label: "Cidade", value: patient.address_city },
            ]} />
            <DataSection title="Dados Médicos" items={[
              { label: "Tipo sanguíneo", value: patient.blood_type },
              { label: "Alergias", value: patient.allergies },
              { label: "Doenças crônicas", value: patient.chronic_conditions },
              { label: "Medicamentos", value: patient.current_medications },
              { label: "Cirurgias", value: patient.surgeries_history },
            ]} />
            <DataSection title="Convênio" items={[
              { label: "Convênio", value: patient.insurance },
              { label: "Número", value: patient.insurance_number },
              { label: "Plano", value: patient.insurance_plan },
            ]} />
            <DataSection title="Emergência" items={[
              { label: "Contato", value: patient.emergency_contact },
              { label: "Telefone", value: patient.emergency_phone },
              { label: "Parentesco", value: patient.emergency_relation },
            ]} />
            <div className="flex gap-2 pb-6">
              <button onClick={handleDelete} className="btn-danger text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Desativar
              </button>
            </div>
          </div>
        )}

        {tab === "documentos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { href: `/pacientes/${pid}/receita`, icon: FileText, label: "Receitas", desc: "Prescrições médicas", color: "bg-teal-600" },
              { href: `/pacientes/${pid}/exames`, icon: FlaskConical, label: "Exames", desc: "Solicitações de exame", color: "bg-purple-600" },
              { href: `/pacientes/${pid}/fisio`, icon: Dumbbell, label: "Fisioterapia", desc: "Encaminhamentos", color: "bg-amber-600" },
              { href: `/pacientes/${pid}/laudo`, icon: ClipboardList, label: "Laudos", desc: "Laudos e atestados", color: "bg-gray-600" },
            ].map(({ href, icon: Icon, label, desc, color }) => (
              <Link key={label} href={href}>
                <div className="card p-5 flex items-center gap-4 hover:shadow-md active:scale-95 transition-all cursor-pointer">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DataSection({ title, items }: { title: string; items: { label: string; value: any }[] }) {
  const filled = items.filter((i) => i.value);
  if (filled.length === 0) return null;
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2">
        {filled.map(({ label, value }) => (
          <div key={label} className="flex gap-2">
            <span className="text-xs text-gray-400 w-32 flex-shrink-0">{label}</span>
            <span className="text-sm text-gray-900">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
