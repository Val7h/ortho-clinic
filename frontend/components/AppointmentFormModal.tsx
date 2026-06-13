'use client';
/**
 * AppointmentFormModal
 *
 * Create or edit an appointment.
 * Features:
 * - Patient autocomplete with prontuário link
 * - Appointment type selector
 * - Live conflict detection (fires on clinic/date/time change)
 * - Doctor availability slots
 * - Offline-queue integration: if network fails the form still "succeeds"
 *   and the appointment is queued for later sync
 * - Reminder scheduling after successful creation
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calendar, Check, Clock, Loader2, Phone, Stethoscope, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PatientAutocomplete } from '@/components/PatientAutocomplete';
import { appointmentsApi, clinicApi } from '@/lib/api';
import { useOfflineAppointmentQueue } from '@/hooks/useOfflineAppointmentQueue';
import { useAppointmentReminders } from '@/hooks/useAppointmentReminders';

const APPOINTMENT_TYPES = [
  { value: 'consulta',      label: '1ª Consulta',  color: '#0F2D5E' },
  { value: 'retorno',       label: 'Retorno',       color: '#06B6D4' },
  { value: 'teleconsulta',  label: 'Teleconsulta',  color: '#7C3AED' },
  { value: 'procedimento',  label: 'Procedimento',  color: '#F59E0B' },
  { value: 'urgencia',      label: 'Urgência',      color: '#EF4444' },
];

interface Clinic {
  id: number;
  name: string;
  color: string;
  slug: string;
  schedules: Array<{ day_of_week: number; start_time: string; end_time: string; schedule_type: string; slot_duration: number }>;
}

interface AppointmentFormModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinics: Clinic[];
  initialDate?: string;          // YYYY-MM-DD pre-fill
  editingAppointment?: any;      // if set, we're editing
  onSaved: (appt: any, isOptimistic?: boolean) => void;
  onCancelled?: (id: number) => void;
}

export function AppointmentFormModal({
  open,
  onOpenChange,
  clinics,
  initialDate,
  editingAppointment,
  onSaved,
  onCancelled,
}: AppointmentFormModalProps) {
  const isEditing = !!editingAppointment;

  const [clinicId, setClinicId] = useState<number | ''>(editingAppointment?.clinic_id ?? (clinics[0]?.id ?? ''));
  const [date, setDate] = useState(editingAppointment?.date ?? initialDate ?? '');
  const [startTime, setStartTime] = useState(editingAppointment?.start_time ?? '');
  const [patientName, setPatientName] = useState(editingAppointment?.patient_name ?? '');
  const [patientId, setPatientId] = useState<number | null>(editingAppointment?.patient_id ?? null);
  const [patientPhone, setPatientPhone] = useState(editingAppointment?.patient_phone ?? '');
  const [apptType, setApptType] = useState(editingAppointment?.appointment_type ?? 'consulta');
  const [reason, setReason] = useState(editingAppointment?.reason ?? '');
  const [notes, setNotes] = useState(editingAppointment?.notes ?? '');

  const [availableSlots, setAvailableSlots] = useState<Array<{ time: string; end_time: string; available: boolean }>>([]);
  const [scheduleType, setScheduleType] = useState<string>('appointment');
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [conflict, setConflict] = useState<{ patient_name: string } | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { enqueue, isOnline } = useOfflineAppointmentQueue();
  const { scheduleReminder } = useAppointmentReminders();
  const conflictTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load slots when clinic+date changes
  useEffect(() => {
    if (!clinicId || !date) { setAvailableSlots([]); return; }
    const clinic = clinics.find(c => c.id === Number(clinicId));
    if (!clinic) return;

    const dateObj = new Date(date + 'T12:00:00');
    const dow = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
    const sched = clinic.schedules.find(s => s.day_of_week === dow);
    if (!sched) { setAvailableSlots([]); setScheduleType('none'); return; }

    setScheduleType(sched.schedule_type);
    if (sched.schedule_type !== 'appointment') { setAvailableSlots([]); return; }

    setSlotsLoading(true);
    clinicApi.slots(clinic.slug, date)
      .then(data => {
        if (data.slots) setAvailableSlots(data.slots);
      })
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [clinicId, date, clinics]);

  // Live conflict detection
  useEffect(() => {
    if (!clinicId || !date || !startTime || scheduleType !== 'appointment') {
      setConflict(null);
      return;
    }
    if (conflictTimer.current) clearTimeout(conflictTimer.current);
    conflictTimer.current = setTimeout(async () => {
      setConflictLoading(true);
      try {
        const result = await appointmentsApi.checkConflict({
          clinic_id: Number(clinicId),
          date,
          start_time: startTime,
          exclude_id: editingAppointment?.id,
        });
        setConflict(result.conflict ? { patient_name: result.patient_name || 'outro paciente' } : null);
      } catch {
        setConflict(null);
      } finally {
        setConflictLoading(false);
      }
    }, 400);
  }, [clinicId, date, startTime, scheduleType, editingAppointment?.id]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!clinicId) errs.clinic = 'Selecione uma clínica';
    if (!date) errs.date = 'Informe a data';
    if (!patientName.trim()) errs.patient = 'Informe o paciente';
    if (scheduleType === 'appointment' && !startTime) errs.time = 'Selecione um horário';
    if (conflict) errs.time = `Horário ocupado por ${conflict.patient_name}`;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const payload = {
      clinic_id: Number(clinicId),
      date,
      start_time: startTime || undefined,
      patient_name: patientName,
      patient_phone: patientPhone || undefined,
      patient_id: patientId ?? undefined,
      reason: reason || undefined,
      appointment_type: apptType,
      notes: notes || undefined,
    };

    try {
      let saved: any;
      if (isEditing) {
        saved = await appointmentsApi.update(editingAppointment.id, payload);
      } else {
        if (!isOnline) {
          // Offline path — optimistic
          const queued = enqueue(payload);
          const optimistic = {
            ...payload,
            id: queued.optimisticId,
            status: 'pending_offline',
            clinic_name: clinics.find(c => c.id === payload.clinic_id)?.name ?? '',
            clinic_color: clinics.find(c => c.id === payload.clinic_id)?.color ?? '#0F2D5E',
            end_time: startTime ? addMinutes(startTime, 30) : '',
            created_at: new Date().toISOString(),
            _queueId: queued.queueId,
          };
          onSaved(optimistic, true);
          onOpenChange(false);
          return;
        }
        saved = await appointmentsApi.create(payload);

        // Schedule browser+WA reminders (non-blocking)
        const clinic = clinics.find(c => c.id === payload.clinic_id);
        scheduleReminder(
          {
            id: saved.id,
            patient_name: saved.patient_name,
            date: saved.date,
            start_time: saved.start_time,
            clinic_name: clinic?.name,
          },
          [24, 1],
        );
      }
      onSaved(saved);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Erro ao salvar agendamento';
      setErrors(prev => ({ ...prev, _global: msg }));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!editingAppointment || !onCancelled) return;
    if (!confirm(`Cancelar agendamento de ${editingAppointment.patient_name}?`)) return;
    try {
      await appointmentsApi.cancel(editingAppointment.id);
      onCancelled(editingAppointment.id);
      onOpenChange(false);
    } catch (err: any) {
      setErrors({ _global: err?.response?.data?.detail || 'Erro ao cancelar' });
    }
  }

  function addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  const selectedClinic = clinics.find(c => c.id === Number(clinicId));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Agendamento' : 'Novo Agendamento'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Offline banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Sem conexão. O agendamento será salvo localmente e sincronizado quando a internet voltar.
            </p>
          </div>
        )}

        {/* Global error */}
        {errors._global && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-2.5">
            <X className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{errors._global}</p>
          </div>
        )}

        {/* Clinic select */}
        <div>
          <label className="label">
            Clínica <span className="text-red-500">*</span>
          </label>
          <select
            value={clinicId}
            onChange={e => setClinicId(Number(e.target.value))}
            className="input"
            required
          >
            <option value="">Selecione a clínica</option>
            {clinics.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.clinic && <p className="mt-1 text-xs text-red-600">{errors.clinic}</p>}
        </div>

        {/* Date */}
        <div>
          <label className="label">
            Data <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => { setDate(e.target.value); setStartTime(''); }}
              className="input"
              required
            />
          </div>
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
        </div>

        {/* Time slot selector */}
        {date && clinicId && scheduleType === 'appointment' && (
          <div>
            <label className="label">
              Horário <span className="text-red-500">*</span>
            </label>
            {slotsLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando horários disponíveis...
              </div>
            ) : availableSlots.length > 0 ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => setStartTime(slot.time)}
                    className={`rounded-lg px-2 py-2 text-xs font-semibold transition-all border ${
                      startTime === slot.time
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : slot.available
                          ? 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-brand-400 hover:text-brand-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed line-through opacity-60'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="input"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Sem grade de horários — informe manualmente.
                </p>
              </div>
            )}

            {/* Conflict indicator */}
            {conflictLoading && (
              <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Verificando disponibilidade...
              </p>
            )}
            {conflict && !conflictLoading && (
              <div className="mt-2 flex items-center gap-2 text-red-600 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                Horário já reservado por <strong>{conflict.patient_name}</strong>
              </div>
            )}
            {!conflict && startTime && !conflictLoading && (
              <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Horário disponível
              </p>
            )}

            {errors.time && <p className="mt-1 text-xs text-red-600">{errors.time}</p>}
          </div>
        )}

        {/* Walk-in info */}
        {date && clinicId && scheduleType === 'walk_in' && (
          <div className="flex items-center gap-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 px-4 py-2.5 text-sm text-cyan-700 dark:text-cyan-300">
            <Stethoscope className="w-4 h-4 flex-shrink-0" />
            Clínica por ordem de chegada — não requer horário fixo.
          </div>
        )}

        {/* Patient autocomplete */}
        <PatientAutocomplete
          value={patientName}
          patientId={patientId}
          onChange={(name, patient) => {
            setPatientName(name);
            setPatientId(patient?.id ?? null);
            if (patient?.phone && !patientPhone) setPatientPhone(patient.phone);
          }}
          required
          error={errors.patient}
        />

        {/* Phone */}
        <div>
          <label className="label">Telefone do Paciente</label>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="tel"
              value={patientPhone}
              onChange={e => setPatientPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="input"
            />
          </div>
        </div>

        {/* Appointment type */}
        <div>
          <label className="label">Tipo de Consulta</label>
          <div className="flex flex-wrap gap-2">
            {APPOINTMENT_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setApptType(t.value)}
                style={apptType === t.value ? { backgroundColor: t.color, borderColor: t.color } : {}}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  apptType === t.value
                    ? 'text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="label">Motivo / Queixa principal</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="ex: Dor no joelho, revisão pós-cirúrgica..."
            className="input"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="label">Observações internas</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas para a equipe..."
            className="input resize-none"
          />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2">
          {isEditing && onCancelled ? (
            <Button type="button" variant="danger" size="sm" onClick={handleCancel}>
              Cancelar consulta
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !!conflict}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : isOnline ? 'Agendar' : 'Salvar offline'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
