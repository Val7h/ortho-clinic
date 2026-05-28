"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  User, Phone, Mail, Shield, Stethoscope,
  FileText, FlaskConical, Dumbbell, ClipboardList,
  BookOpen, Plus, Edit, Trash2, ChevronRight,
  MessageSquare, Send, X, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import Timeline from "@/components/Timeline";
import { patientsApi, whatsappApi } from "@/lib/api";
import { calcAge, formatDate, formatDate as fd } from "@/lib/utils";

type Tab = "timeline" | "dados" | "documentos";

const WA_TYPES = [
  { key: "post_consultation", label: "Pós-consulta" },
  { key: "return_reminder", label: "Lembrete retorno" },
  { key: "semestral", label: "Acompanhamento" },
  { key: "birthday", label: "Aniversário" },
] as const;

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const router = useRouter();

  const [patient, setPatient] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("timeline");
  const [loading, setLoading] = useState(true);
  const [waOpen, setWaOpen] = useState(false);
  const [waType, setWaType] = useState<string | null>(null);
  const [waPreview, setWaPreview] = useState<string | null>(null);
  const [waSending, setWaSending] = useState(false);
  const [waDemo, setWaDemo] = useState(true);

  useEffect(() => {
    Promise.all([patientsApi.get(pid), patientsApi.timeline(pid)])
      .then(([p, t]) => { setPatient(p); setTimeline(t); })
      .catch(() => toast.error("Erro ao carregar paciente"))
      .finally(() => setLoading(false));
    whatsappApi.config().then((c) => setWaDemo(c.demo)).catch(() => {});
  }, [pid]);

  const handleWaSelect = async (type: string) => {
    setWaType(type);
    setWaPreview(null);
    try {
      const r = await whatsappApi.preview({ patient_id: pid, message_type: type });
      setWaPreview(r.text);
    } catch {
      setWaPreview("Erro ao carregar prévia");
    }
  };

  const handleWaSend = async () => {
    if (!waType) return;
    setWaSending(true);
    try {
      await whatsappApi.send({ patient_id: pid, message_type: waType });
      toast.success(waDemo ? "Mensagem simulada (demo)" : "Mensagem enviada!");
      setWaOpen(false);
      setWaType(null);
      setWaPreview(null);
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setWaSending(false);
    }
  };

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

        {/* WhatsApp quick-send */}
        <div className="card overflow-hidden">
          <button
            onClick={() => { setWaOpen((v) => !v); setWaType(null); setWaPreview(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="flex-1 text-left text-sm font-medium text-gray-700">
              Enviar mensagem via WhatsApp
            </span>
            {waOpen ? <X className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>

          {waOpen && (
            <div className="border-t border-gray-100 px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {WA_TYPES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleWaSelect(key)}
                    className={`text-sm py-2 px-3 rounded-lg border transition-colors text-left ${
                      waType === key
                        ? "border-green-500 bg-green-50 text-green-800 font-medium"
                        : "border-gray-200 text-gray-700 hover:border-green-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {waType && (
                <div className="space-y-2">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Prévia:</p>
                    {waPreview ? (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{waPreview}</p>
                    ) : (
                      <p className="text-xs text-gray-400">Carregando...</p>
                    )}
                  </div>

                  {!patient?.phone && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Telefone não cadastrado neste paciente
                    </p>
                  )}

                  {waDemo && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Modo demo — não será enviado de verdade
                    </p>
                  )}

                  <button
                    onClick={handleWaSend}
                    disabled={waSending || !waPreview}
                    className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2"
                  >
                    {waSending ? (
                      <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" /> {waDemo ? "Simular envio" : "Enviar agora"}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
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
