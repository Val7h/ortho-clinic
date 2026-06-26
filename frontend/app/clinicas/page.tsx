"use client";
import { useEffect, useState } from "react";
import {
  MapPin, Calendar, Clock, CheckCircle, XCircle,
  User, Phone, FileText, ChevronDown, ChevronUp,
  Link as LinkIcon, Copy, RefreshCw, Loader2, Pencil,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { Card, Badge, Button } from "@/components/ui";
import { Modal, useModal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { clinicApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";
import toast from "react-hot-toast";

const STATUS_CONFIG: Record<string, { label: string; variant: any }> = {
  pending:   { label: "Pendente",    variant: "warning" },
  confirmed: { label: "Confirmado",  variant: "success" },
  completed: { label: "Realizado",   variant: "brand" },
  cancelled: { label: "Cancelado",   variant: "error" },
  blocked:   { label: "Bloqueado",   variant: "neutral" },
};

const DOW = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return `${DOW[d.getDay() === 0 ? 6 : d.getDay()-1]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}

function getNextDates(dayOfWeek: number, count = 4): string[] {
  const today = new Date();
  const results: string[] = [];
  for (let i = 0; i <= 60 && results.length < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    if (dow === dayOfWeek) results.push(d.toISOString().slice(0, 10));
  }
  return results;
}

export default function ClinicasPage() {
  const { user, loading: authLoading } = useProtectedPage();
  const [clinics, setClinics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [apptsByClinic, setApptsByClinic] = useState<Record<number, any[]>>({});
  const [apptLoading, setApptLoading] = useState<number | null>(null);

  // Edit modal state
  const editModal = useModal();
  const [editClinic, setEditClinic] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", slug: "", city: "", state: "", address: "", color: "", slot_duration: 12,
  });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    clinicApi.list()
      .then(setClinics)
      .catch(() => toast.error("Erro ao carregar clínicas"))
      .finally(() => setLoading(false));
  }, []);

  const loadAppointments = async (clinicId: number) => {
    setApptLoading(clinicId);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const data = await clinicApi.appointments(clinicId, {
        date_from: today,
        date_to: future.toISOString().slice(0, 10),
      });
      setApptsByClinic((prev) => ({ ...prev, [clinicId]: data }));
    } catch {
      toast.error("Erro ao carregar agendamentos");
    } finally {
      setApptLoading(null);
    }
  };

  const toggleClinic = async (clinicId: number) => {
    if (expanded === clinicId) {
      setExpanded(null);
    } else {
      setExpanded(clinicId);
      if (!apptsByClinic[clinicId]) await loadAppointments(clinicId);
    }
  };

  const handleStatus = async (apptId: number, status: string, clinicId: number) => {
    try {
      await clinicApi.updateAppointment(apptId, status);
      await loadAppointments(clinicId);
      toast.success(status === "confirmed" ? "Confirmado!" : status === "cancelled" ? "Cancelado" : "Atualizado");
    } catch {
      toast.error("Erro ao atualizar");
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/agendar/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const openEdit = (clinic: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditClinic(clinic);
    const firstSlotDuration = clinic.schedules[0]?.slot_duration ?? 12;
    setEditForm({
      name: clinic.name,
      slug: clinic.slug,
      city: clinic.city || "",
      state: clinic.state || "",
      address: clinic.address || "",
      color: clinic.color || "#0F2D5E",
      slot_duration: firstSlotDuration,
    });
    editModal.openModal();
  };

  const handleEditSave = async () => {
    if (!editClinic) return;
    setEditSaving(true);
    try {
      const updated = await clinicApi.updateClinic(editClinic.id, {
        name: editForm.name,
        slug: editForm.slug,
        city: editForm.city || undefined,
        state: editForm.state || undefined,
        address: editForm.address || undefined,
        color: editForm.color || undefined,
      });
      // Update all schedules' slot_duration
      for (const sched of editClinic.schedules) {
        await clinicApi.updateSchedule(editClinic.id, sched.id, {
          slot_duration: editForm.slot_duration,
        });
      }
      setClinics((prev) =>
        prev.map((c) =>
          c.id === editClinic.id
            ? { ...updated, schedules: c.schedules.map((s: any) => ({ ...s, slot_duration: editForm.slot_duration })) }
            : c
        )
      );
      toast.success("Clínica atualizada!");
      editModal.close();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
    </div>
  );

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50">
      <NavBar title="Clínicas" subtitle="Agendamentos e horários" back="/" />

      {/* Edit Clinic Modal */}
      <Modal
        open={editModal.open}
        onOpenChange={editModal.onOpenChange}
        title="Editar clínica"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="tertiary" size="sm" onClick={editModal.close} disabled={editSaving}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Slug (URL)"
            value={editForm.slug}
            onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Cidade"
              value={editForm.city}
              onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
            />
            <Input
              label="Estado"
              value={editForm.state}
              onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
            />
          </div>
          <Input
            label="Endereço"
            value={editForm.address}
            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Cor</label>
              <input
                type="color"
                value={editForm.color}
                onChange={(e) => setEditForm((f) => ({ ...f, color: e.target.value }))}
                className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 px-1 py-1"
              />
            </div>
            <Input
              label="Minutos por consulta"
              type="number"
              min={5}
              max={120}
              value={editForm.slot_duration}
              onChange={(e) => setEditForm((f) => ({ ...f, slot_duration: Number(e.target.value) }))}
            />
          </div>
        </div>
      </Modal>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <Card padding="md" className="border-l-4 border-brand-500">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Clínicas</p>
            <p className="text-3xl font-bold text-brand-600 mt-2">{clinics.length}</p>
          </Card>
          <Card padding="md" className="border-l-4 border-accent-500">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Com agendamento</p>
            <p className="text-3xl font-bold text-accent-600 mt-2">
              {clinics.filter(c => c.schedules.some((s: any) => s.schedule_type === "appointment")).length}
            </p>
          </Card>
          <Card padding="md" className="border-l-4 border-warning-500">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ordem chegada</p>
            <p className="text-3xl font-bold text-warning-600 mt-2">
              {clinics.filter(c => c.schedules.some((s: any) => s.schedule_type === "walk_in")).length}
            </p>
          </Card>
        </div>

        {/* Clinic cards */}
        {clinics.map((clinic) => {
          const isOpen = expanded === clinic.id;
          const hasOnlineBooking = clinic.schedules.some((s: any) => s.schedule_type === "appointment");
          const appts = apptsByClinic[clinic.id] || [];
          const pending = appts.filter((a: any) => a.status === "pending").length;

          return (
            <Card key={clinic.id} hoverable>
              {/* Header */}
              <div className="flex items-center gap-2 pr-2">
                <button
                  onClick={() => toggleClinic(clinic.id)}
                  className="flex-1 flex items-center gap-4 p-6 text-left focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset rounded"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Fechar" : "Abrir"} detalhes de ${clinic.name}`}
                >
                  {/* Color dot */}
                  <div
                    className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: clinic.color }}
                  >
                    {clinic.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <p className="font-semibold text-slate-900">{clinic.name}</p>
                      <Badge variant={hasOnlineBooking ? "brand" : "warning"} size="sm">
                        {hasOnlineBooking ? "Agendamento" : "Ordem de chegada"}
                      </Badge>
                      {pending > 0 && (
                        <Badge variant="warning" size="sm">
                          {pending} pendente{pending > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{clinic.city}/{clinic.state}</span>
                      <span className="text-slate-300">·</span>
                      {clinic.schedules.map((s: any, i: number) => (
                        <span key={i} className="text-slate-600">
                          {DOW[s.day_of_week]} {s.start_time}–{s.end_time}
                          {i < clinic.schedules.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {isOpen
                    ? <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  }
                </button>
                <Button
                  onClick={(e) => openEdit(clinic, e)}
                  variant="tertiary"
                  size="sm"
                  icon={<Pencil className="w-4 h-4" />}
                  ariaLabel={`Editar ${clinic.name}`}
                />
              </div>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-slate-200 pt-6">

                  {/* Link público — todas as clínicas têm agora */}
                  <div className="px-6 pb-6 border-b border-slate-200">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
                      Link de {hasOnlineBooking ? "agendamento" : "confirmação de presença"}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={typeof window !== "undefined" ? `${window.location.origin}/agendar/${clinic.slug}` : `/agendar/${clinic.slug}`}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono truncate"
                      />
                      <Button
                        onClick={() => copyLink(clinic.slug)}
                        size="sm"
                        icon={<Copy className="w-4 h-4" />}
                        style={{ backgroundColor: clinic.color, borderColor: clinic.color }}
                        className="text-white flex-shrink-0"
                        ariaLabel={`Copiar link de agendamento de ${clinic.name}`}
                      />
                    </div>
                    {!hasOnlineBooking && (
                      <p className="text-xs text-slate-600 mt-3">
                        Ordem de chegada · Limite de 30 pacientes por turno
                      </p>
                    )}
                  </div>

                  {/* Appointments list — all clinics */}
                  <div className="px-6">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          {hasOnlineBooking ? "Próximos agendamentos" : "Presenças confirmadas"}
                        </p>
                        <Button
                          onClick={() => loadAppointments(clinic.id)}
                          variant="tertiary"
                          size="sm"
                          icon={apptLoading === clinic.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          ariaLabel={`Atualizar agendamentos de ${clinic.name}`}
                          disabled={apptLoading === clinic.id}
                        />
                      </div>

                      {appts.filter((a: any) => a.status !== "blocked").length === 0 ? (
                        <div className="text-center py-8">
                          <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm text-slate-500">Nenhum agendamento nos próximos 30 dias</p>
                        </div>
                      ) : (
                        <div className="space-y-3 pb-6">
                          {appts
                            .filter((a: any) => a.status !== "blocked")
                            .map((a: any) => {
                              const st = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
                              return (
                                <div
                                  key={a.id}
                                  className="rounded-lg border border-slate-200 p-4 bg-slate-50"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-2">
                                        {a.queue_number && (
                                          <span
                                            className="text-xs font-extrabold px-2.5 py-1 rounded text-white"
                                            style={{ backgroundColor: clinic.color }}
                                          >
                                            #{a.queue_number}
                                          </span>
                                        )}
                                        <p className="font-semibold text-slate-900 text-sm">{a.patient_name}</p>
                                        <Badge variant={st.variant} size="sm">
                                          {st.label}
                                        </Badge>
                                      </div>
                                      <div className="flex flex-wrap gap-3">
                                        <span className="flex items-center gap-1 text-xs text-slate-600">
                                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                          {fmtDate(a.date)}
                                        </span>
                                        <span className="flex items-center gap-1 text-xs text-slate-600">
                                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                          {a.queue_number ? `Turno ${a.start_time}–${a.end_time}` : `${a.start_time} – ${a.end_time}`}
                                        </span>
                                        {a.patient_phone && (
                                          <span className="flex items-center gap-1 text-xs text-slate-600">
                                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                                            {a.patient_phone}
                                          </span>
                                        )}
                                      </div>
                                      {a.reason && (
                                        <p className="text-xs text-slate-600 mt-2">
                                          📋 {a.reason}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Action buttons */}
                                  {a.status === "pending" && (
                                    <div className="flex gap-2 mt-3">
                                      <Button
                                        onClick={() => handleStatus(a.id, "confirmed", clinic.id)}
                                        variant="success"
                                        size="sm"
                                        fullWidth
                                        icon={<CheckCircle className="w-4 h-4" />}
                                        ariaLabel={`Confirmar agendamento de ${a.patient_name}`}
                                      >
                                        Confirmar
                                      </Button>
                                      <Button
                                        onClick={() => handleStatus(a.id, "cancelled", clinic.id)}
                                        variant="danger"
                                        size="sm"
                                        fullWidth
                                        icon={<XCircle className="w-4 h-4" />}
                                        ariaLabel={`Cancelar agendamento de ${a.patient_name}`}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  )}
                                  {a.status === "confirmed" && (
                                    <div className="flex gap-2 mt-3">
                                      <Button
                                        onClick={() => handleStatus(a.id, "completed", clinic.id)}
                                        variant="primary"
                                        size="sm"
                                        fullWidth
                                        icon={<CheckCircle className="w-4 h-4" />}
                                        ariaLabel={`Marcar como realizado agendamento de ${a.patient_name}`}
                                      >
                                        Marcar realizado
                                      </Button>
                                      <Button
                                        onClick={() => handleStatus(a.id, "cancelled", clinic.id)}
                                        variant="tertiary"
                                        size="sm"
                                        icon={<XCircle className="w-4 h-4" />}
                                        ariaLabel={`Cancelar agendamento de ${a.patient_name}`}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                </div>
              )}
            </Card>
          );
        })}
      </main>
    </div>
    </PageWithSidebar>
  );
}
