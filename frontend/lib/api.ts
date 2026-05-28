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
