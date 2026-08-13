"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  User, Phone, Mail, Shield, Stethoscope,
  FileText, FlaskConical, Dumbbell, ClipboardList,
  Plus, Trash2, ChevronRight,
  MessageSquare, Send, X, AlertCircle, ClipboardCheck,
  Link as LinkIcon, Clock, CheckCircle, Camera, Pencil,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { buscarCep, cepCompleto, formatarCep, montarEndereco } from "@/lib/cep";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import MedicalHistoryTimeline from "@/components/MedicalHistoryTimeline";
import PatientQuickActions from "@/components/PatientQuickActions";
import PatientPhotoCapture from "@/components/PatientPhotoCapture";
import { AnamneseForm } from "@/components/AnamneseForm";
import {
  Card, CardContent, Badge, Button, Modal, useModal, CardSkeleton,
} from "@/components/ui";
import { patientsApi, whatsappApi, anamnesisApi, msgErro } from "@/lib/api";
import { calcAge, formatDate, resolveDynamicParam } from "@/lib/utils";
import { usePatientCache } from "@/hooks/usePatientCache";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

type Tab = "timeline" | "dados" | "documentos";

const WA_TYPES = [
  { key: "post_consultation", label: "Pós-consulta" },
  { key: "return_reminder", label: "Lembrete retorno" },
  { key: "semestral", label: "Acompanhamento" },
  { key: "birthday", label: "Aniversário" },
] as const;

// ── Profile avatar with photo capture trigger ──────────────────────────────

function ProfileAvatar({
  patient,
  onCameraClick,
}: {
  patient: any;
  onCameraClick: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const showPhoto = !!patient.photo_url && !imgError;

  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-20 h-20 rounded-2xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center overflow-hidden"
      >
        {showPhoto ? (
          <img
            src={`${API_URL}${patient.photo_url}`}
            alt={patient.name}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <User className="w-10 h-10 text-brand-600 dark:text-brand-300" />
        )}
        {showPhoto && !imgLoaded && (
          <User className="w-10 h-10 text-brand-600 dark:text-brand-300 absolute" />
        )}
      </div>
      {/* Camera button overlay */}
      <button
        onClick={onCameraClick}
        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center shadow-md transition-colors"
        aria-label="Atualizar foto"
      >
        <Camera className="w-3.5 h-3.5 text-white" />
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PatientPage() {
  const params = useParams();
  const id = resolveDynamicParam(params?.id as string);
  if (!id) return <div>Paciente não encontrado</div>;
  const pid = Number(id);
  const router = useRouter();
  const { put, get: getCached, remove: removeFromCache } = usePatientCache();

  const [patient, setPatient] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("timeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WhatsApp state
  const [waOpen, setWaOpen] = useState(false);
  const [waType, setWaType] = useState<string | null>(null);
  const [waPreview, setWaPreview] = useState<string | null>(null);
  const [waSending, setWaSending] = useState(false);
  const [waDemo, setWaDemo] = useState(true);

  // Anamnese state
  const [anamneses, setAnamneses] = useState<any[]>([]);
  const [anamnesisLoading, setAnamnesisLoading] = useState(false);

  // Photo capture modal
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  // E6 (05/08): edição da ficha (telefone/endereço errados não tinham conserto)
  const editModal = useModal(false);
  const [editForm, setEditForm] = useState<any>({});
  const [buscandoCepEdit, setBuscandoCepEdit] = useState(false);
  const [cepEditNaoAchado, setCepEditNaoAchado] = useState(false);

  // Preenche endereço/cidade/UF pelo CEP. O número fica com o médico ou a
  // secretária: mantém o que já estava escrito no campo Endereço se houver.
  const onCepEdit = async (valor: string) => {
    const cep = formatarCep(valor);
    setEditForm((f: any) => ({ ...f, address_zip: cep }));
    setCepEditNaoAchado(false);
    if (!cepCompleto(cep)) return;
    setBuscandoCepEdit(true);
    const achado = await buscarCep(cep);
    setBuscandoCepEdit(false);
    if (!achado) { setCepEditNaoAchado(true); return; }
    // CEP único de cidade pequena (ex.: Palmares/PE) vem sem rua e sem bairro.
    // Nesse caso NÃO mexe no endereço já cadastrado — apagá-lo seria pior que
    // não preencher nada. Cidade e UF entram de qualquer jeito.
    const rua = montarEndereco(achado.logradouro, "", "", achado.bairro);
    setEditForm((f: any) => ({
      ...f,
      ...(rua ? { address_street: rua } : {}),
      ...(achado.bairro ? { address_neighborhood: achado.bairro } : {}),
      address_city: achado.cidade,
      address_state: achado.uf,
    }));
  };
  const [savingEdit, setSavingEdit] = useState(false);

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const payload: any = {};
      [
        "name", "birthdate", "cpf", "rg", "gender", "civil_status", "occupation",
        "phone", "phone2", "email", "address_street", "address_city", "address_state",
        "address_zip", "address_number", "address_complement", "address_neighborhood",
        "blood_type", "allergies", "chronic_conditions",
        "current_medications", "insurance", "insurance_number", "insurance_plan",
        "emergency_contact", "emergency_phone", "emergency_relation",
      ].forEach((k) => {
        if (editForm[k] !== undefined) payload[k] = editForm[k] === "" ? null : editForm[k];
      });
      if (payload.name) payload.name = String(payload.name).toUpperCase();
      const atualizado = await patientsApi.update(pid, payload);
      setPatient((p: any) => ({ ...p, ...atualizado }));
      put({ ...patient, ...atualizado });
      editModal.onOpenChange(false);
      toast.success("Dados atualizados");
    } catch (err: any) {
      toast.error(msgErro(err, "Erro ao salvar"));
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Load patient + timeline ──────────────────────────────────────────

  useEffect(() => {
    if (!pid) { setLoading(false); toast.error("ID inválido"); return; }

    // Optimistic render from cache
    const cached = getCached(pid);
    if (cached) {
      setPatient(cached);
      setLoading(false);
    }

    const loadPatient = async () => {
      try {
        setError(null);
        const [p, t] = await Promise.all([
          patientsApi.get(pid),
          patientsApi.timeline(pid),
        ]);
        setPatient(p);
        setTimeline(t);
        // Update cache
        put(p);
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.message || "Erro ao carregar paciente";
        console.error("Patient load error:", err);
        if (!cached) {
          setError(msg);
          toast.error(msg);
        }
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
    whatsappApi.config().then((c) => setWaDemo(c.demo)).catch(() => {});
    anamnesisApi.list(pid).then(setAnamneses).catch(() => {});
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── WhatsApp ─────────────────────────────────────────────────────────

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
      setWaOpen(false); setWaType(null); setWaPreview(null);
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setWaSending(false);
    }
  };

  // ── Anamnese ─────────────────────────────────────────────────────────

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

  // ── Delete ────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirm(`Desativar o cadastro de ${patient?.name}?`)) return;
    await patientsApi.delete(pid);
    removeFromCache(pid);
    toast.success("Paciente desativado");
    router.push("/pacientes");
  };

  // ── Photo uploaded ────────────────────────────────────────────────────

  const handlePhotoUploaded = useCallback((newPhotoUrl: string) => {
    const updated = { ...patient, photo_url: newPhotoUrl };
    setPatient(updated);
    put(updated);
    setPhotoModalOpen(false);
  }, [patient, put]);

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading && !patient) {
    return (
      <PageWithSidebar>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar title="Carregando..." back="/pacientes" />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <CardSkeleton />
        </main>
      </div>
      </PageWithSidebar>
    );
  }

  if (error && !patient) {
    return (
      <PageWithSidebar>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar title="Paciente não encontrado" back="/pacientes" />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <Card shadow="md" className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-error-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">
              Erro ao carregar paciente
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{error}</p>
            <Link href="/pacientes"><Button>Voltar para Lista</Button></Link>
          </Card>
        </main>
      </div>
      </PageWithSidebar>
    );
  }

  // Guarda final: nenhuma das condições acima cobre o caso em que o
  // carregamento terminou sem erro mas `patient` ainda não foi setado
  // (ex.: 401 na primeira tentativa seguido de retry bem-sucedido).
  // Sem isso, o acesso a patient.name abaixo derruba a página inteira.
  if (!patient) {
    return (
      <PageWithSidebar>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar title="Carregando..." back="/pacientes" />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <CardSkeleton />
        </main>
      </div>
      </PageWithSidebar>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "timeline", label: "Histórico" },
    { key: "dados", label: "Dados" },
    { key: "documentos", label: "Documentos" },
  ];

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar
        title={patient.name}
        subtitle={
          patient.birthdate
            ? `${calcAge(patient.birthdate)} • ${patient.insurance || "Particular"}`
            : patient.insurance || "Particular"
        }
        back="/pacientes"
        actions={
          <Link href={`/pacientes/${pid}/consulta`}>
            <button className="btn-primary text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Consulta
            </button>
          </Link>
        }
      />

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-8">

        {/* Profile header card */}
        <Card padding="lg" className="flex items-center gap-4">
          <ProfileAvatar patient={patient} onCameraClick={() => setPhotoModalOpen(true)} />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-lg text-slate-900 dark:text-slate-50">{patient.name}</h2>
              {patient.allergies && (
                <Badge variant="error" size="sm">Alergia</Badge>
              )}
              {patient.blood_type && (
                <Badge variant="neutral" size="sm">{patient.blood_type}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-400">
              {patient.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{patient.email}</span>}
              {patient.insurance && <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{patient.insurance}</span>}
            </div>
            {patient.allergies && (
              <p className="text-xs text-error-600 dark:text-error-400 font-medium">{patient.allergies}</p>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <PatientQuickActions
          patientId={pid}
          patientName={patient.name}
          phone={patient.phone}
          onCameraClick={() => setPhotoModalOpen(true)}
        />

        {/* Document quick-links */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { href: `/pacientes/${pid}/exames`,   icon: FlaskConical, label: "Exames"   },
            { href: `/pacientes/${pid}/fisio`,    icon: Dumbbell,     label: "Fisio"    },
            { href: `/pacientes/${pid}/laudo`,    icon: ClipboardList,label: "Laudo"    },
          ].map(({ href, icon: Icon, label }) => (
            <Link key={label} href={href}>
              <Card hoverable padding="md" className="flex flex-col items-center gap-2 h-full">
                <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand-600 dark:text-brand-300" />
                </div>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-50 text-center">{label}</span>
              </Card>
            </Link>
          ))}
        </div>

        {/* WhatsApp quick-send */}
        <Card>
          <button
            onClick={() => { setWaOpen(v => !v); setWaType(null); setWaPreview(null); }}
            className="w-full flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors p-4"
          >
            <div className="w-10 h-10 rounded-lg bg-success-100 dark:bg-success-900/40 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-success-600 dark:text-success-400" />
            </div>
            <span className="flex-1 text-left text-sm font-semibold text-slate-900 dark:text-slate-50">
              Enviar mensagem via WhatsApp
            </span>
            {waOpen ? <X className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>

          {waOpen && (
            <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {WA_TYPES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleWaSelect(key)}
                    className={`text-sm py-2 px-3 rounded-lg border transition-colors text-left font-medium ${
                      waType === key
                        ? "border-success-500 bg-success-50 text-success-800"
                        : "border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-success-300 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {waType && (
                <div className="space-y-3">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Prévia:</p>
                    {waPreview ? (
                      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{waPreview}</p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-slate-500">Carregando...</p>
                      </div>
                    )}
                  </div>
                  {!patient?.phone && (
                    <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
                      Telefone não cadastrado
                    </p>
                  )}
                  {waDemo && (
                    <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
                      Modo demo — não será enviado de verdade
                    </p>
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
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck className="w-5 h-5 text-brand-600 dark:text-brand-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Anamnese digital</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Paciente preenche antes da consulta</p>
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
            <div className="mt-0 pt-4 border-t border-slate-200 dark:border-slate-700 px-4 pb-4 space-y-2">
              {anamneses.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  {a.status === "filled" ? (
                    <Badge variant="success" size="sm">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Preenchida
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">
                      <Clock className="w-3 h-3 mr-1" />
                      Aguardando
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
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
        <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-1 gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-colors ${
                tab === key
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Histórico */}
        {tab === "timeline" && (
          <div className="space-y-4">
            {timeline.length === 0 ? (
              <Card className="p-8 text-center">
                <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">Nenhum registro de consulta ainda.</p>
                <Link href={`/pacientes/${pid}/consulta`}>
                  <Button variant="primary">
                    <Plus className="w-4 h-4 mr-1" />
                    Iniciar primeira consulta
                  </Button>
                </Link>
              </Card>
            ) : (
              <MedicalHistoryTimeline items={timeline} patientId={pid} />
            )}
          </div>
        )}

        {/* Tab: Dados */}
        {tab === "dados" && (
          <div className="space-y-4 pb-6">
            <Card shadow="md" className="border-l-4 border-blue-500">
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-2">Anamnese</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  Formulário detalhado de histórico médico
                </p>
                <AnamneseForm patientId={pid} patientName={patient.name} />
              </CardContent>
            </Card>

            {/* E6 (05/08): a ficha era só leitura — não dava pra corrigir telefone
                nem endereço errado. Agora edita direto aqui. */}
            <div className="flex justify-end">
              <Button
                onClick={() => { setEditForm({ ...patient }); editModal.onOpenChange(true); }}
                size="sm"
                icon={<Pencil className="w-4 h-4" />}
              >
                Editar dados do paciente
              </Button>
            </div>

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
              { label: "Bairro", value: patient.address_neighborhood },
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

        {/* Tab: Documentos */}
        {tab === "documentos" && (
          <div className="space-y-4">
            {/* New: unified document manager */}
            <Link href={`/pacientes/${pid}/documentos`}>
              <Card hoverable padding="lg" className="flex items-center gap-4 border-2 border-brand-200 dark:border-brand-800">
                <div className="w-12 h-12 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-50">
                    Todos os Documentos
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-600 text-white align-middle">Novo</span>
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Upload, câmera, assinatura, compartilhamento
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </Card>
            </Link>

            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1">
              Documentos Gerados
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { href: `/pacientes/${pid}/exames`,  icon: FlaskConical, label: "Exames",        desc: "Solicitações de exame" },
                { href: `/pacientes/${pid}/fisio`,   icon: Dumbbell,     label: "Fisioterapia",  desc: "Encaminhamentos"       },
                { href: `/pacientes/${pid}/laudo`,   icon: ClipboardList,label: "Laudos",        desc: "Laudos e atestados"    },
              ].map(({ href, icon: Icon, label, desc }) => (
                <Link key={label} href={href}>
                  <Card hoverable padding="lg" className="flex items-center gap-4 h-full">
                    <div className="w-12 h-12 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-brand-600 dark:text-brand-300" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 dark:text-slate-50">{label}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* E6 (05/08): Editar dados do paciente */}
      <Modal
        open={editModal.open}
        onOpenChange={editModal.onOpenChange}
        title="Editar dados do paciente"
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="tertiary" onClick={() => editModal.onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} isLoading={savingEdit}>Salvar alterações</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { k: "name", l: "Nome completo", full: true },
            { k: "birthdate", l: "Nascimento", type: "date" },
            { k: "cpf", l: "CPF" },
            { k: "phone", l: "Telefone (WhatsApp)" },
            { k: "phone2", l: "Telefone 2" },
            { k: "email", l: "E-mail" },
            { k: "occupation", l: "Profissão" },
            { k: "civil_status", l: "Estado civil" },
            { k: "__cep", l: "CEP" },
            { k: "address_street", l: "Endereço (linha que sai nos documentos)", full: true },
            { k: "address_number", l: "Número" },
            { k: "address_complement", l: "Complemento" },
            { k: "address_neighborhood", l: "Bairro" },
            { k: "address_city", l: "Cidade" },
            { k: "address_state", l: "UF" },
            { k: "insurance", l: "Convênio (ou Particular)" },
            { k: "insurance_number", l: "Nº da carteirinha" },
            { k: "allergies", l: "Alergias", full: true },
            { k: "chronic_conditions", l: "Doenças crônicas", full: true },
            { k: "current_medications", l: "Medicamentos em uso", full: true },
          ].map(({ k, l, type, full }) => (
            <div key={k} className={full ? "sm:col-span-2" : ""}>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{l}</label>
              {/* 11/08: o CEP estava solto no alto do formulário, longe do
                  endereço. Agora fica na sequência natural: CEP → Endereço →
                  Número → Complemento → Bairro → Cidade → UF. */}
              <input
                type={k === "__cep" ? "text" : (type || "text")}
                inputMode={k === "__cep" ? "numeric" : undefined}
                placeholder={k === "__cep" ? "00000-000" : undefined}
                value={k === "__cep" ? (editForm.address_zip ?? "") : (editForm[k] ?? "")}
                onChange={(e) => (k === "__cep"
                  ? onCepEdit(e.target.value)
                  : setEditForm((f: any) => ({ ...f, [k]: e.target.value })))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </Modal>

      {/* Photo Capture Modal */}
      {photoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-5">
            <PatientPhotoCapture
              patientId={pid}
              currentPhotoUrl={patient.photo_url ? `${API_URL}${patient.photo_url}` : undefined}
              onUploadSuccess={handlePhotoUploaded}
              onClose={() => setPhotoModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
    </PageWithSidebar>
  );
}

// ── DataSection helper ─────────────────────────────────────────────────────

function DataSection({ title, items }: { title: string; items: { label: string; value: any }[] }) {
  const filled = items.filter((i) => i.value);
  if (filled.length === 0) return null;
  return (
    <Card padding="lg">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-4">{title}</h3>
      <div className="space-y-3">
        {filled.map(({ label, value }) => (
          <div key={label} className="flex gap-4">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-32 flex-shrink-0">{label}</span>
            <span className="text-sm text-slate-900 dark:text-slate-50">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
