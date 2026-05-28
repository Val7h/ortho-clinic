import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Pacientes ──────────────────────────────────────────────────────────────
export const patientsApi = {
  list: (search?: string) =>
    api.get("/patients", { params: search ? { search } : {} }).then((r) => r.data),
  get: (id: number) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/patients", data).then((r) => r.data),
  update: (id: number, data: any) => api.put(`/patients/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/patients/${id}`),
  timeline: (id: number) => api.get(`/patients/${id}/timeline`).then((r) => r.data),
  uploadPhoto: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/patients/${id}/photo`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
};

// ── Consultas ─────────────────────────────────────────────────────────────
export const consultationsApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/consultations`).then((r) => r.data),
  get: (patientId: number, id: number) =>
    api.get(`/patients/${patientId}/consultations/${id}`).then((r) => r.data),
  create: (patientId: number, data: any) =>
    api.post(`/patients/${patientId}/consultations`, data).then((r) => r.data),
  update: (patientId: number, id: number, data: any) =>
    api.put(`/patients/${patientId}/consultations/${id}`, data).then((r) => r.data),
  delete: (patientId: number, id: number) =>
    api.delete(`/patients/${patientId}/consultations/${id}`),
};

// ── Receitas ──────────────────────────────────────────────────────────────
export const prescriptionsApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/prescriptions`).then((r) => r.data),
  create: (patientId: number, data: any) =>
    api.post(`/patients/${patientId}/prescriptions`, data).then((r) => r.data),
  delete: (patientId: number, id: number) =>
    api.delete(`/patients/${patientId}/prescriptions/${id}`),
};

// ── Exames ────────────────────────────────────────────────────────────────
export const examsApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/exams`).then((r) => r.data),
  create: (patientId: number, data: any) =>
    api.post(`/patients/${patientId}/exams`, data).then((r) => r.data),
  delete: (patientId: number, id: number) =>
    api.delete(`/patients/${patientId}/exams/${id}`),
};

// ── Fisioterapia ──────────────────────────────────────────────────────────
export const physioApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/physio`).then((r) => r.data),
  create: (patientId: number, data: any) =>
    api.post(`/patients/${patientId}/physio`, data).then((r) => r.data),
  delete: (patientId: number, id: number) =>
    api.delete(`/patients/${patientId}/physio/${id}`),
};

// ── Laudos ────────────────────────────────────────────────────────────────
export const reportsApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/reports`).then((r) => r.data),
  create: (patientId: number, data: any) =>
    api.post(`/patients/${patientId}/reports`, data).then((r) => r.data),
  delete: (patientId: number, id: number) =>
    api.delete(`/patients/${patientId}/reports/${id}`),
};

// ── Folhetos ──────────────────────────────────────────────────────────────
export const leafletsApi = {
  list: () => api.get("/leaflets").then((r) => r.data),
  get: (id: number) => api.get(`/leaflets/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/leaflets", data).then((r) => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────
export const dashboardApi = {
  get: () => api.get("/dashboard").then((r) => r.data),
};

// ── Agenda ────────────────────────────────────────────────────────────────
export const agendaApi = {
  get: (start?: string, end?: string) =>
    api.get("/agenda", { params: { start, end } }).then((r) => r.data),
};

// ── Clínicas ──────────────────────────────────────────────────────────────
export const clinicApi = {
  list: () => api.get("/clinics").then((r) => r.data),
  appointments: (clinicId: number, params?: { date_from?: string; date_to?: string; status?: string }) =>
    api.get(`/clinics/${clinicId}/appointments`, { params }).then((r) => r.data),
  week: (start?: string, end?: string) =>
    api.get("/appointments/week", { params: { start, end } }).then((r) => r.data),
  updateAppointment: (id: number, status: string, notes?: string) =>
    api.put(`/appointments/${id}`, { status, notes }).then((r) => r.data),
  deleteAppointment: (id: number) => api.delete(`/appointments/${id}`),
  blockSlot: (clinicId: number, data: { date: string; start_time: string; reason?: string }) =>
    api.post(`/clinics/${clinicId}/block`, { ...data, patient_name: "[BLOQUEADO]" }).then((r) => r.data),
  // Public
  getPublic: (slug: string) => api.get(`/agendar/${slug}`).then((r) => r.data),
  slots: (slug: string, date: string) =>
    api.get(`/agendar/${slug}/slots`, { params: { date_req: date } }).then((r) => r.data),
  book: (slug: string, data: { date: string; start_time: string; patient_name: string; patient_phone?: string; reason?: string }) =>
    api.post(`/agendar/${slug}/book`, data).then((r) => r.data),
};

// ── Financeiro ────────────────────────────────────────────────────────────
export const financialApi = {
  list: (params?: { month?: number; year?: number; patient_id?: number }) =>
    api.get("/financial", { params }).then((r) => r.data),
  summary: (params?: { month?: number; year?: number }) =>
    api.get("/financial/summary", { params }).then((r) => r.data),
  create: (data: any) => api.post("/financial", data).then((r) => r.data),
  delete: (id: number) => api.delete(`/financial/${id}`),
};

// ── Mídia de Consulta ─────────────────────────────────────────────────────
export const mediaApi = {
  list: (consultationId: number) =>
    api.get(`/consultations/${consultationId}/media`).then((r) => r.data),
  upload: (consultationId: number, patientId: number, file: File, mediaType: string, description: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("patient_id", String(patientId));
    fd.append("media_type", mediaType);
    fd.append("description", description);
    return api.post(`/consultations/${consultationId}/media`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  delete: (consultationId: number, mediaId: number) =>
    api.delete(`/consultations/${consultationId}/media/${mediaId}`),
};

// ── Anamnese ──────────────────────────────────────────────────────────────
export const anamnesisApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/anamnese`).then((r) => r.data),
  create: (patientId: number, expiresHours?: number) =>
    api.post(`/patients/${patientId}/anamnese`, { patient_id: patientId, expires_hours: expiresHours ?? 48 }).then((r) => r.data),
  getPublic: (token: string) =>
    api.get(`/anamnese/${token}`).then((r) => r.data),
  fillPublic: (token: string, data: any) =>
    api.post(`/anamnese/${token}`, data).then((r) => r.data),
};

// ── WhatsApp ──────────────────────────────────────────────────────────────
export const whatsappApi = {
  config: () => api.get("/whatsapp/config").then((r) => r.data),
  dashboard: () => api.get("/whatsapp/dashboard").then((r) => r.data),
  send: (data: {
    patient_id: number;
    message_type: string;
    custom_text?: string;
    appointment_date?: string;
    consultation_date?: string;
  }) => api.post("/whatsapp/send", data).then((r) => r.data),
  messages: () => api.get("/whatsapp/messages").then((r) => r.data),
  patientMessages: (patientId: number) =>
    api.get(`/whatsapp/patients/${patientId}/messages`).then((r) => r.data),
  preview: (params: {
    patient_id: number;
    message_type: string;
    appointment_date?: string;
    consultation_date?: string;
  }) => api.get("/whatsapp/preview", { params }).then((r) => r.data),
};
