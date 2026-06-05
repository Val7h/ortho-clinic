"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  User, Phone, Mail, Shield, Stethoscope,
  FileText, FlaskConical, Dumbbell, ClipboardList,
  BookOpen, Plus, Edit, Trash2, ChevronRight,
  MessageSquare, Send, X, AlertCircle, ClipboardCheck,
  Link as LinkIcon, Clock, CheckCircle,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import Timeline from "@/components/Timeline";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, Button, Modal, useModal, CardSkeleton, ListSkeleton } from "@/components/ui";
import { patientsApi, whatsappApi, anamnesisApi } from "@/lib/api";
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
  const [anamneses, setAnamneses] = useState<any[]>([]);
  const [anamnesisLoading, setAnamnesisLoading] = useState(false);

  useEffect(() => {
    Promise.all([patientsApi.get(pid), patientsApi.timeline(pid)])
      .then(([p, t]) => { setPatient(p); setTimeline(t); })
      .catch(() => toast.error("Erro ao carregar paciente"))
      .finally(() => setLoading(false));
    whatsappApi.config().then((c) => setWaDemo(c.demo)).catch(() => {});
    anamnesisApi.list(pid).then(setAnamneses).catch(() => {});
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

  const handleCreateAnamnesis = async () => {
    setAnamnesisLoading(true);
    try {
      const a = await anamnesisApi.create(pid);
      setAnamneses((prev) => [a, ...prev]);
      const link = `${window.location.origin}/anamnese/${a.token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado! Envie ao paciente.");
    } catch {
      toast.error("Erro ao gerar link");
    } finally {
      setAnamnesisLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Desativar o cadastro de ${patient?.name}?`)) return;
    await patientsApi.delete(pid);
    toast.success("Paciente desativado");
    router.push("/pacientes");
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
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
    <div className="min-h-screen bg-slate-50">
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
        <Card padding="lg" className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg text-slate-900">{patient.name}</h2>
              {patient.allergies && (
                <Badge variant="error" size="sm">Alergia</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              {patient.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{patient.email}</span>}
              {patient.insurance && <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{patient.insurance}</span>}
            </div>
            {patient.allergies && (
              <p className="text-xs text-error-600 font-medium">{patient.allergies}</p>
            )}
          </div>
        </Card>

        {/* Ações rápidas de documentos */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { href: `/pacientes/${pid}/receita`, icon: FileText, label: "Receita" },
            { href: `/pacientes/${pid}/exames`, icon: FlaskConical, label: "Exames" },
            { href: `/pacientes/${pid}/fisio`, icon: Dumbbell, label: "Fisio" },
            { href: `/pacientes/${pid}/laudo`, icon: ClipboardList, label: "Laudo" },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={label} href={href}>
              <Card hoverable padding="md" className="flex flex-col items-center gap-2 h-full">
                <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-600" />
                </div>
                <span className="text-xs font-semibold text-slate-900 text-center">{label}</span>
              </Card>
            </Link>
          ))}
        </div>

        {/* WhatsApp quick-send */}
        <Card>
          <button
            onClick={() => { setWaOpen((v) => !v); setWaType(null); setWaPreview(null); }}
            className="w-full flex items-center gap-3 hover:bg-slate-50 transition-colors p-4"
          >
            <div className="w-10 h-10 rounded-lg bg-success-100 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-success-600" />
            </div>
            <span className="flex-1 text-left text-sm font-semibold text-slate-900">
              Enviar mensagem via WhatsApp
            </span>
            {waOpen ? <X className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>

          {waOpen && (
            <div className="border-t border-slate-200 px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {WA_TYPES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleWaSelect(key)}
                    className={`text-sm py-2 px-3 rounded-lg border transition-colors text-left font-medium ${
                      waType === key
                        ? "border-success-500 bg-success-50 text-success-800"
                        : "border-slate-200 text-slate-700 hover:border-success-300 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {waType && (
                <div className="space-y-3">
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Prévia da mensagem:</p>
                    {waPreview ? (
                      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{waPreview}</p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-slate-500">Carregando...</p>
                      </div>
                    )}
                  </div>

                  {!patient?.phone && (
                    <div className="flex items-start gap-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-warning-700">Telefone não cadastrado neste paciente</p>
                    </div>
                  )}

                  {waDemo && (
                    <div className="flex items-start gap-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-warning-700">Modo demo — não será enviado de verdade</p>
                    </div>
                  )}

                  <Button
                    onClick={handleWaSend}
                    disabled={waSending || !waPreview}
                    isLoading={waSending}
                    fullWidth
                    icon={<Send className="w-4 h-4" />}
                  >
                    {waDemo ? "Simular envio" : "Enviar agora"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Anamnese digital */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Anamnese digital</p>
                <p className="text-xs text-slate-600">Paciente preenche antes da consulta</p>
              </div>
            </div>
            <Button
              onClick={handleCreateAnamnesis}
              disabled={anamnesisLoading}
              isLoading={anamnesisLoading}
              variant="primary"
              size="sm"
              icon={<LinkIcon className="w-4 h-4" />}
            >
              Gerar link
            </Button>
          </div>

          {anamneses.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
              {anamneses.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  {a.status === "filled" ? (
                    <Badge variant="success" size="sm" className="flex-shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      Preenchida
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm" className="flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      Aguardando
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600">
                      {a.expires_at ? `Expira ${new Date(a.expires_at).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  {a.status === "pending" && (
                    <button
                      onClick={async () => {
                        const link = `${window.location.origin}/anamnese/${a.token}`;
                        await navigator.clipboard.writeText(link);
                        toast.success("Link copiado!");
                      }}
                      className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
                    >
                      Copiar link
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Tabs */}
        <div className="flex bg-white rounded-lg border border-slate-200 p-1 gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-colors ${
                tab === key
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Conteúdo da tab */}
        {tab === "timeline" && (
          <div className="space-y-4">
            {timeline.length === 0 ? (
              <Card className="p-8 text-center">
                <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 text-sm mb-6">Nenhum registro de consulta ainda.</p>
                <Link href={`/pacientes/${pid}/consulta`}>
                  <Button variant="primary">
                    <Plus className="w-4 h-4" />
                    Iniciar primeira consulta
                  </Button>
                </Link>
              </Card>
            ) : (
              <Timeline items={timeline} patientId={pid} />
            )}
          </div>
        )}

        {tab === "dados" && (
          <div className="space-y-4 pb-6">
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
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleDelete}
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
              >
                Desativar paciente
              </Button>
            </div>
          </div>
        )}

        {tab === "documentos" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { href: `/pacientes/${pid}/receita`, icon: FileText, label: "Receitas", desc: "Prescrições médicas" },
              { href: `/pacientes/${pid}/exames`, icon: FlaskConical, label: "Exames", desc: "Solicitações de exame" },
              { href: `/pacientes/${pid}/fisio`, icon: Dumbbell, label: "Fisioterapia", desc: "Encaminhamentos" },
              { href: `/pacientes/${pid}/laudo`, icon: ClipboardList, label: "Laudos", desc: "Laudos e atestados" },
            ].map(({ href, icon: Icon, label, desc }) => (
              <Link key={label} href={href}>
                <Card hoverable padding="lg" className="flex items-center gap-4 h-full">
                  <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-brand-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="text-xs text-slate-600">{desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </Card>
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
    <Card padding="lg">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {filled.map(({ label, value }) => (
          <div key={label} className="flex gap-4">
            <span className="text-xs font-medium text-slate-600 w-32 flex-shrink-0">{label}</span>
            <span className="text-sm text-slate-900">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
