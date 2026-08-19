import axios from "axios";

// API URL with fallbacks for different environments
// À PROVA DE BALA: em produção (rodando num host remoto), SEMPRE usa a mesma
// origem que serviu a página — assim, mesmo que o build embuta NEXT_PUBLIC_API_URL
// apontando pra localhost (ex.: .env.local de dev vazando pro build de prod via o
// out/ commitado), a produção NUNCA tenta localhost. Só usa localhost quando a
// própria página está em localhost/127.0.0.1 (dev de verdade).
export const API_URL = (() => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal) {
      return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003";
    }
    // host remoto (produção): mesma origem da página, sempre.
    return window.location.origin;
  }
  // SSR/build (sem window): não é usado no static export em runtime.
  return process.env.NEXT_PUBLIC_API_URL || "https://ortho-clinic-ldcd.onrender.com";
})();


// ── Mensagem de erro segura para a tela ──────────────────────────────────────
// 11/08: quando o servidor recusa por validação (422), o FastAPI devolve
// `detail` como uma LISTA DE OBJETOS. Jogar isso direto num toast faz o React
// tentar renderizar um objeto e DERRUBA a tela inteira ("Application error").
// Foi o que aconteceu no cadastro por foto. Aqui sempre sai string.
export function msgErro(err: any, padrao = "Não foi possível concluir"): string {
  const d = err?.response?.data?.detail ?? err?.response?.data?.message;
  if (typeof d === "string" && d.trim()) return d;
  if (Array.isArray(d)) {
    const primeiro = d[0];
    if (typeof primeiro === "string") return primeiro;
    if (primeiro?.msg) return String(primeiro.msg);
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return padrao;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  // Aggressive timeout for mobile connections — don't hang forever
  timeout: 15_000,
});

// ── Auth token injection ──────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ortho_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  // Envio de arquivo (11/08): com o Content-Type json fixo do cliente, o
  // navegador não escreve o boundary do multipart e o servidor recusa a
  // imagem com 422. Removendo o cabeçalho, o próprio navegador põe o certo.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete (config.headers as any)['Content-Type'];
    delete (config.headers as any)['content-type'];
  }
  return config;
});

// Rotas PÚBLICAS (paciente, sem login): um 401 perdido de widget global
// (chat, notificações) NÃO pode expulsar o paciente pro /login — senão ele
// nunca vê o formulário. Nessas rotas, o interceptor ignora o 401.
const PUBLIC_PATH_PREFIXES = [
  "/anamnese/", "/pre-consulta", "/confirmar", "/agendar",
  "/privacidade", "/termos", "/contrato", "/documentos/publico",
];
function isPublicPath(path: string): boolean {
  return path === "/login" || PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p));
}

api.interceptors.response.use(
  function(r) { return r; },
  function(err) {
    if (err && err.response && err.response.status === 401 && typeof window !== "undefined") {
      if (!isPublicPath(window.location.pathname)) {
        localStorage.removeItem("ortho_token");
        localStorage.removeItem("ortho_user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// ── Request deduplication ────────────────────────────────────────────────────
// Multiple components calling the same GET endpoint within the same tick
// share a single in-flight promise. This eliminates N+1 fetches on
// page mounts that compose many small hooks.

const inflight = new Map<string, Promise<any>>();

/**
 * Deduplicated GET — identical URL+params combos made in the same event-loop
 * tick reuse the same Axios promise. The entry is cleared once the request
 * settles (success or error).
 */
export function dedupGet<T = any>(
  url: string,
  params?: Record<string, any>,
  signal?: AbortSignal
): Promise<T> {
  const key = url + (params ? JSON.stringify(params) : '');

  if (inflight.has(key)) return inflight.get(key)!;

  const promise = api
    .get<T>(url, { params, signal })
    .then((r) => r.data)
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/**
 * Returns an AbortController that is automatically aborted on React
 * component unmount. Use the `.signal` in fetch/axios calls.
 *
 * Usage:
 *   const { signal } = useAbortOnUnmount();
 *   useEffect(() => { dedupGet('/patients', {}, signal); }, []);
 */
export function makeAbortController(): AbortController {
  return new AbortController();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/auth/change-password", { current_password, new_password }),
  // User management
  listUsers: () => api.get("/auth/users").then((r) => r.data),
  createUser: (data: any) => api.post("/auth/users", data).then((r) => r.data),
  updateUser: (id: number, data: any) => api.put(`/auth/users/${id}`, data).then((r) => r.data),
  deleteUser: (id: number) => api.delete(`/auth/users/${id}`),
  // Org management (superadmin)
  listOrgs: () => api.get("/auth/organizations").then((r) => r.data),
  createOrg: (data: any) => api.post("/auth/organizations", data).then((r) => r.data),
  updateOrg: (id: number, data: any) => api.put(`/auth/organizations/${id}`, data).then((r) => r.data),
};

// ── Pacientes ──────────────────────────────────────────────────────────────
export const patientsApi = {
  list: (search?: string) =>
    api.get("/patients", { params: search ? { search } : {} }).then((r) => r.data),
  get: (id: number) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/patients", data).then((r) => r.data),
  // Cadastro por foto (06/08): a imagem vai, e le lida e nao e guardada.
  lerFoto: (arquivo: File) => {
    const fd = new FormData();
    fd.append("file", arquivo);
    return api.post("/patients/ler-foto", fd).then((r) => r.data);
  },
  update: (id: number, data: any) => api.put(`/patients/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/patients/${id}`),
  timeline: (id: number) => api.get(`/patients/${id}/timeline`).then((r) => r.data),
  // Duplicados (19/08): o Alexandre tinha a anamnese num cadastro e o
  // agendamento do dia noutro — o médico abria a ficha vazia.
  duplicados: () => api.get("/patients/duplicados/possiveis").then((r) => r.data),
  unificar: (ficaId: number, duplicadoId: number) =>
    api.post(`/patients/${ficaId}/unificar`, { duplicado_id: duplicadoId }).then((r) => r.data),
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

// ── Templates de Prescrição ───────────────────────────────────────────────
export const prescriptionTemplatesApi = {
  list: () =>
    api.get("/prescription-templates").then((r) => r.data),
  create: (data: { name: string; prescription_type: string; medications: any[]; instructions: string }) =>
    api.post("/prescription-templates", data).then((r) => r.data),
  delete: (id: number) =>
    api.delete(`/prescription-templates/${id}`),
};

// ── Exames ────────────────────────────────────────────────────────────────
export const examsApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/exams`).then((r) => r.data),
  create: (patientId: number, data: any) =>
    api.post(`/patients/${patientId}/exams`, data).then((r) => r.data),
  delete: (patientId: number, id: number) =>
    api.delete(`/patients/${patientId}/exams/${id}`),
  // Modelos de solicitacao de exame — no BANCO desde 11/08 (antes so no
  // navegador, presos a uma maquina e sujeitos a sumir na limpeza de cache).
  templatesList: () => api.get("/exam-templates").then((r) => r.data),
  templateCreate: (name: string, content: string) =>
    api.post("/exam-templates", { name, content }).then((r) => r.data),
  templateDelete: (id: number) => api.delete(`/exam-templates/${id}`),
  // Justificativa clinica que o convenio exige para autorizar imagem (11/08).
  justificativa: (patientId: number, pedido: string) =>
    api.post(`/patients/${patientId}/justificativa-exame`, { pedido }).then((r) => r.data),
};

// ── Evoluções Clínicas (Prontuário em Folha Corrida) ─────────────────────────
export const evolutionApi = {
  list: (patientId: number) =>
    api.get(`/patients/${patientId}/evolutions`).then((r) => r.data),
  create: (patientId: number, data: { entry_date: string; content: string }) =>
    api.post(`/patients/${patientId}/evolutions`, data).then((r) => r.data),
  update: (id: number, data: { content: string }) =>
    api.patch(`/evolutions/${id}`, data).then((r) => r.data),
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

// ── Confirmação de agendamento (público, sem auth) ────────────────────────────
export const confirmApi = {
  get: (token: string) => api.get(`/confirmar/${token}`).then((r) => r.data),
  confirm: (token: string) => api.post(`/confirmar/${token}`, { action: "confirm" }).then((r) => r.data),
  cancel: (token: string) => api.post(`/confirmar/${token}`, { action: "cancel" }).then((r) => r.data),
};

// ── Folhetos ──────────────────────────────────────────────────────────────
export const leafletsApi = {
  list: () => api.get("/leaflets").then((r) => r.data),
  get: (id: number) => api.get(`/leaflets/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/leaflets", data).then((r) => r.data),
  upload: (formData: FormData) =>
    api.post("/leaflets/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────
export const dashboardApi = {
  get: () => api.get("/dashboard").then((r) => r.data),
  v2: () => api.get("/dashboard/v2").then((r) => r.data),
  recall: () => api.get("/dashboard/v2/recall").then((r) => r.data),
};

// ── Auditoria LGPD ────────────────────────────────────────────────────────
export const auditApi = {
  logs: (params: Record<string, any>) =>
    api.get("/audit/logs", { params }).then((r) => r.data),
  patientAccess: (params: Record<string, any>) =>
    api.get("/audit/patient-access-report", { params }).then((r) => r.data),
  monthlySummary: (year: number, month: number) =>
    api.get("/audit/monthly-summary", { params: { year, month } }).then((r) => r.data),
  exportCsv: (params: Record<string, any>) =>
    api.get("/audit/export/csv", { params, responseType: "blob" }).then((r) => r.data),
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
  blockPeriod: (
    clinicId: number,
    data: { start_date: string; end_date?: string; start_time?: string; end_time?: string; reason?: string },
  ) => api.post(`/clinics/${clinicId}/block-period`, data).then((r) => r.data),
  // E4 (05/08): "Chegou" — manda o agendado direto pra sala de espera
  checkinAppointment: (appointmentId: number) =>
    api.post(`/appointments/${appointmentId}/checkin`).then((r) => r.data),
  // Edit clinic
  get: (clinicId: number) => api.get(`/clinics/${clinicId}`).then((r) => r.data),
  updateClinic: (clinicId: number, data: { name: string; slug: string; city?: string; state?: string; address?: string; color?: string; phone?: string }) =>
    api.put(`/clinics/${clinicId}`, data).then((r) => r.data),
  updateSchedule: (clinicId: number, scheduleId: number, data: { slot_duration?: number; start_time?: string; end_time?: string; active?: boolean }) =>
    api.put(`/clinics/${clinicId}/schedules/${scheduleId}`, data).then((r) => r.data),
  // Public
  getPublic: (slug: string) => api.get(`/agendar/${slug}`).then((r) => r.data),
  slots: (slug: string, date: string) =>
    api.get(`/agendar/${slug}/slots`, { params: { date_req: date } }).then((r) => r.data),
  book: (slug: string, data: { date: string; start_time?: string; patient_name: string; patient_phone?: string; reason?: string }) =>
    api.post(`/agendar/${slug}/book`, data).then((r) => r.data),
};

// ── Agendamentos internos (Sprint 6) ──────────────────────────────────────
export const appointmentsApi = {
  // Patient autocomplete
  searchPatients: (q: string) =>
    api.get("/appointments/patients/search", { params: { q } }).then((r) => r.data as Array<{ id: number; name: string; phone?: string; cpf?: string }>),

  // Conflict detection
  checkConflict: (data: { clinic_id: number; date: string; start_time: string; exclude_id?: number }) =>
    api.post("/appointments/check-conflict", data).then((r) => r.data as { conflict: boolean; patient_name?: string; appointment_id?: number }),

  // Doctor availability calendar
  availability: (clinic_id: number, date_from: string, date_to: string) =>
    api.get("/appointments/availability", { params: { clinic_id, date_from, date_to } }).then((r) => r.data as Array<{
      date: string;
      available: boolean;
      slots: Array<{ time: string; end_time: string; available: boolean }>;
      booked_count: number;
      schedule_type: string;
      start_time?: string;
      end_time?: string;
    }>),

  // Create internal appointment
  create: (data: {
    clinic_id: number;
    date: string;
    start_time?: string;
    patient_name: string;
    patient_phone?: string;
    patient_id?: number;
    reason?: string;
    appointment_type?: string;
    notes?: string;
  }) => api.post("/appointments", data).then((r) => r.data),

  // Edit appointment
  update: (id: number, data: {
    date?: string;
    start_time?: string;
    patient_name?: string;
    patient_phone?: string;
    patient_id?: number;
    reason?: string;
    appointment_type?: string;
    status?: string;
    notes?: string;
  }) => api.patch(`/appointments/${id}`, data).then((r) => r.data),

  // Cancel
  cancel: (id: number, reason?: string) =>
    api.post(`/appointments/${id}/cancel`, null, { params: reason ? { reason } : {} }).then((r) => r.data),

  // Schedule reminder
  scheduleReminder: (appointment_id: number, remind_hours_before = 24) =>
    api.post("/appointments/schedule-reminder", { appointment_id, remind_hours_before }).then((r) => r.data),
};

// ── Financeiro ────────────────────────────────────────────────────────────
// Lembretes de repeticao de procedimento (11/08): visco, zoledronico etc.
export const remindersApi = {
  list: (todos = false) =>
    api.get("/procedure-reminders", { params: todos ? { todos: true } : {} }).then((r) => r.data),
  create: (data: { patient_id: number; procedure: string; interval_months: number; applied_on?: string }) =>
    api.post("/procedure-reminders", data).then((r) => r.data),
  resolve: (id: number, status: "done" | "cancelled") =>
    api.patch(`/procedure-reminders/${id}`, { status }).then((r) => r.data),
};

export const financialApi = {
  // Fechamento do dia (11/08): quem foi atendido e ainda nao tem valor.
  fechamentoDoDia: () => api.get("/financial/fechamento-do-dia").then((r) => r.data),
  semCobranca: (entryId: number) =>
    api.post("/financial/sem-cobranca", { entry_id: entryId }).then((r) => r.data),
  list: (params?: { month?: number; year?: number; patient_id?: number }) =>
    api.get("/financial", { params }).then((r) => r.data),
  summary: (params?: { month?: number; year?: number }) =>
    api.get("/financial/summary", { params }).then((r) => r.data),
  create: (data: any) => api.post("/financial", data).then((r) => r.data),
  update: (id: number, data: any) => api.put(`/financial/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/financial/${id}`),
  analytics: () => api.get("/financial/analytics").then((r) => r.data),
  painel: () => api.get("/financial/painel").then((r) => r.data),
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

// ── Documentos do Paciente (Sprint 6 / Day 7) ────────────────────────────────
export const patientDocsApi = {
  list: (patientId: number, params?: { category?: string; q?: string; limit?: number; offset?: number }) =>
    api.get(`/patients/${patientId}/documents`, { params }).then((r) => r.data),

  categories: () =>
    api.get("/patients/0/documents/categories").then((r) => r.data),

  get: (patientId: number, docId: number) =>
    api.get(`/patients/${patientId}/documents/${docId}`).then((r) => r.data),

  upload: (patientId: number, formData: FormData) =>
    api.post(`/patients/${patientId}/documents/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  uploadCamera: (patientId: number, formData: FormData) =>
    api.post(`/patients/${patientId}/documents/camera`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  linkGenerated: (patientId: number, data: {
    title: string;
    category: string;
    date: string;
    generated_doc_type: string;
    generated_doc_id: number;
    consultation_id?: number;
    description?: string;
    tags?: string[];
  }) => api.post(`/patients/${patientId}/documents/link-generated`, data).then((r) => r.data),

  update: (patientId: number, docId: number, data: {
    title?: string;
    category?: string;
    description?: string;
    tags?: string[];
  }) => api.patch(`/patients/${patientId}/documents/${docId}`, data).then((r) => r.data),

  delete: (patientId: number, docId: number) =>
    api.delete(`/patients/${patientId}/documents/${docId}`),

  sign: (patientId: number, docId: number, data: {
    signature_data_url: string;
    signed_by_name: string;
  }) => api.post(`/patients/${patientId}/documents/${docId}/sign`, data).then((r) => r.data),

  share: (patientId: number, docId: number, data: {
    channel: "whatsapp" | "email" | "link";
    recipient?: string;
    expires_hours?: number;
  }) => api.post(`/patients/${patientId}/documents/${docId}/share`, data).then((r) => r.data),

  getPdfUrl: (patientId: number, docId: number) =>
    `${api.defaults.baseURL}/patients/${patientId}/documents/${docId}/pdf`,
};

// ── Sala de Espera ────────────────────────────────────────────────────────
export const waitingRoomApi = {
  checkin: (data: { patient_id: number; clinic_id?: number; reason?: string; notes?: string; value_cents?: number; payment_method?: string; procedure_type?: string }) =>
    api.post("/api/clinic/waiting-room/checkin", data).then((r) => r.data),

  // E3 (05/08): acrescenta valor à conta do paciente no dia (procedimento
  // indicado durante a consulta) — vai direto pro Caixa do Dia.
  addValue: (entry_id: number, data: { value_cents: number; description?: string; payment_method?: string }) =>
    api.post(`/api/clinic/waiting-room/${entry_id}/valor`, data).then((r) => r.data),

  // E8: avisa o servidor que o médico está mexendo no prontuário (anti-inatividade)
  ping: (entry_id: number) =>
    api.post(`/api/clinic/waiting-room/${entry_id}/activity`).then((r) => r.data).catch(() => null),

  today: (clinic_id?: number) =>
    api.get("/api/clinic/waiting-room/today", { params: clinic_id ? { clinic_id } : {} }).then((r) => r.data),

  updateStatus: (entry_id: number, status: "waiting" | "attending" | "suspended" | "attended" | "absent") =>
    api.patch(`/api/clinic/waiting-room/${entry_id}/status`, { status }).then((r) => r.data),

  remove: (entry_id: number) =>
    api.delete(`/api/clinic/waiting-room/${entry_id}`),
};

// ── Memed ─────────────────────────────────────────────────────────────────
export const memedApi = {
  // /memed/token é a rota real do backend (o antigo /memed/config não existe)
  getToken: () => api.get("/memed/token").then((r) => r.data),
};

// ── Chat IA ───────────────────────────────────────────────────────────────
export type ChatRole = "user" | "assistant";
export interface WhatsAppDraft {
  // patient_id pode ser null: agendamento de hoje só por nome (bot/formulário)
  // não tem paciente cadastrado; nesse caso o destino é o phone do agendamento.
  patient_id: number | null;
  patient_name: string;
  phone: string | null;
  message: string;
}
export type DraftStatus = "pending" | "sending" | "sent" | "dismissed" | "failed";
export interface ChatMessage {
  role: ChatRole;
  content: string;
  draft?: WhatsAppDraft;
  draftStatus?: DraftStatus;
}

export const chatApi = {
  send: (messages: ChatMessage[]) =>
    api.post<{ reply: string; draft?: WhatsAppDraft }>("/api/chat", {
      messages: messages.map(({ role, content }) => ({ role, content })),
    }).then((r) => r.data),
  // Um dos dois identifica o destinatário: patient_id (paciente cadastrado) OU
  // phone (agendamento de hoje só por nome). O backend valida o phone contra a
  // fila/agenda de hoje, então não dá pra mandar pra número arbitrário.
  sendWhatsApp: (patient_id: number | null, message: string, phone?: string | null) =>
    api.post<{ sent: boolean; demo: boolean; error?: string }>("/api/chat/send-whatsapp", { patient_id, message, phone }).then((r) => r.data),
};

// ── Mensagens diretas (médico <-> secretária) ──────────────────────────────
export interface Contact {
  id: number;
  name: string;
  role: string;
  // A21: não-lidas por contato, já vem do /contacts pra o badge nascer certo.
  unread_count?: number;
}
export interface DirectMessageOut {
  id: number;
  sender_id: number;
  recipient_id: number;
  content: string;
  created_at: string;
  read: boolean;
}

export const messagesApi = {
  contacts: () => api.get<Contact[]>("/api/messages/contacts").then((r) => r.data),
  conversation: (otherId: number) =>
    api.get<DirectMessageOut[]>(`/api/messages/${otherId}`).then((r) => r.data),
  send: (recipient_id: number, content: string) =>
    api.post<DirectMessageOut>("/api/messages", { recipient_id, content }).then((r) => r.data),
  presence: () =>
    api.get<{ online_user_ids: number[] }>("/api/messages/presence").then((r) => r.data),
  markRead: (otherId: number) =>
    api.post(`/api/messages/${otherId}/read`, {}).then((r) => r.data),
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
