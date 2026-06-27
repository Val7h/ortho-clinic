"use client";
import { useEffect, useState, useRef } from "react";
import {
  Users, Plus, Pencil, Trash2, X, Check,
  Loader2, Eye, EyeOff, Shield, User, Building2,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { Card, CardHeader, Badge, Button, Input, Modal, useModal } from "@/components/ui";
import { authApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";
import toast from "react-hot-toast";

const ROLES = [
  { value: "secretary", label: "Secretária", variant: "neutral" as const, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "doctor",    label: "Médico",      variant: "brand" as const,   color: "bg-green-100 text-green-700 border-green-200" },
  { value: "admin",     label: "Admin",       variant: "accent" as const,  color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "superadmin",label: "Super Admin", variant: "error" as const,   color: "bg-purple-100 text-purple-700 border-purple-200" },
];

// Generate a consistent color for avatar based on name
function avatarColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
    "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function roleBadge(role: string) {
  const r = ROLES.find((x) => x.value === role) || ROLES[0];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${r.color}`}>
      {r.label}
    </span>
  );
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
}

const EMPTY: UserForm = { name: "", email: "", password: "", role: "secretary" };

export default function UsuariosPage() {
  const { user: me, loading: authLoading, isAdmin } = useProtectedPage();
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState<"none" | "create" | "edit" | "org">("none");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first input when modal opens
  useEffect(() => {
    if ((modal === "create" || modal === "edit") && firstInputRef.current) {
      setTimeout(() => firstInputRef.current?.focus(), 0);
    }
  }, [modal]);

  const loadUsers = async () => {
    try {
      const data = await authApi.listUsers();
      setUsers(data);
    } catch {
      toast.error("Erro ao carregar usuários");
    }
  };

  const loadOrgs = async () => {
    try {
      const data = await authApi.listOrgs();
      setOrgs(data);
    } catch { /* not superadmin */ }
  };

  useEffect(() => {
    if (me) {
      setLoading(true);
      Promise.all([loadUsers(), me.role === "superadmin" ? loadOrgs() : Promise.resolve()])
        .finally(() => setLoading(false));
    }
  }, [me]);

  const openCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setModal("create");
  };

  const openEdit = (u: any) => {
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setEditing(u);
    setModal("edit");
  };

  const closeModal = () => {
    setModal("none");
    setEditing(null);
    setShowPass(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return toast.error("Nome e email são obrigatórios");
    if (modal === "create" && !form.password) return toast.error("Senha obrigatória");
    setSaving(true);
    try {
      if (modal === "create") {
        await authApi.createUser(form);
        toast.success("Usuário criado!");
      } else if (editing) {
        await authApi.updateUser(editing.id, form);
        toast.success("Usuário atualizado!");
      }
      await loadUsers();
      closeModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (u: any) => {
    if (!confirm(`Desativar "${u.name}"?`)) return;
    try {
      await authApi.deleteUser(u.id);
      toast.success("Usuário desativado");
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Erro");
    }
  };

  if (authLoading || !me) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <PageWithSidebar>
      <div className="min-h-screen bg-slate-50">
        <NavBar title="Usuários" back="/" />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <Shield className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Acesso restrito a administradores.</p>
        </div>
      </div>
      </PageWithSidebar>
    );
  }

  const activeUsers = users.filter((u) => u.active);
  const inactiveUsers = users.filter((u) => !u.active);

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50">
      <NavBar
        title="Equipe"
        subtitle={`${activeUsers.length} membro${activeUsers.length !== 1 ? "s" : ""} ativo${activeUsers.length !== 1 ? "s" : ""}`}
        back="/"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white text-brand-700 hover:bg-brand-50 border border-white/30 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Convidar membro
          </button>
        }
      />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ROLES.filter((r) => r.value !== "superadmin" || me.role === "superadmin").map((r) => {
            const count = users.filter((u) => u.role === r.value && u.active).length;
            return (
              <div key={r.value} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4`}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{r.label}</p>
                <p className="text-3xl font-bold text-slate-800">{count}</p>
              </div>
            );
          })}
        </div>

        {/* Org management (superadmin) */}
        {me.role === "superadmin" && orgs.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200">
              <Building2 className="w-5 h-5 text-slate-400" />
              <p className="text-sm font-semibold text-slate-900">Organizações</p>
            </div>
            <div className="space-y-3">
              {orgs.map((org) => (
                <div key={org.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 text-sm">{org.name}</p>
                    <p className="text-xs text-slate-600">{org.city}/{org.state} · {org.plan}</p>
                  </div>
                  <Badge variant={org.active ? "success" : "error"} size="sm">
                    {org.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Users grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Nenhum usuário cadastrado</p>
          </div>
        ) : (
          <>
            {/* Section title */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Membros ativos</p>
              <span className="text-xs text-slate-400">{activeUsers.length} pessoa{activeUsers.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeUsers.map((u) => {
                const bgColor = avatarColor(u.name);
                const inits = initials(u.name);
                const isMe = u.id === me.id;

                return (
                  <div
                    key={u.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group"
                  >
                    {/* Top accent strip */}
                    <div className={`h-1.5 w-full ${bgColor}`} />

                    <div className="p-5">
                      {/* Avatar + actions row */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="relative">
                          <div className={`w-14 h-14 rounded-full ${bgColor} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                            {inits}
                          </div>
                          {/* Online/Active indicator */}
                          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-400 border-2 border-white" title="Ativo" />
                        </div>

                        {/* Edit / Delete */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title={`Editar ${u.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!isMe && (
                            <button
                              onClick={() => handleDeactivate(u)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={`Desativar ${u.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Name + badges */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900 text-sm leading-tight">{u.name}</p>
                          {isMe && (
                            <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-medium">Você</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      </div>

                      {/* Role badge */}
                      <div className="mt-3">
                        {roleBadge(u.role)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Inactive users (collapsed) */}
            {inactiveUsers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Inativos ({inactiveUsers.length})</p>
                <div className="space-y-2">
                  {inactiveUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 opacity-50">
                      <div className={`w-8 h-8 rounded-full ${avatarColor(u.name)} flex items-center justify-center text-white text-xs font-bold`}>
                        {initials(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">{u.name}</p>
                        <p className="text-xs text-slate-500 truncate">{u.email}</p>
                      </div>
                      {roleBadge(u.role)}
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal */}
      <Modal
        open={modal === "create" || modal === "edit"}
        onOpenChange={(open) => !open && closeModal()}
        title={modal === "create" ? "Convidar membro" : "Editar membro"}
        size="md"
        footer={
          <div className="flex gap-3">
            <Button
              onClick={closeModal}
              variant="secondary"
              fullWidth
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              isLoading={saving}
              fullWidth
              icon={<Check className="w-4 h-4" />}
            >
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            ref={firstInputRef}
            label="Nome completo"
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome do usuário"
          />
          <Input
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@clinica.com"
          />
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Senha
              {modal === "edit" && <span className="text-xs text-slate-500 font-normal ml-1">(deixe em branco para manter)</span>}
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder={modal === "create" ? "Mínimo 6 caracteres" : "Nova senha (opcional)"}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">Perfil de acesso</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.filter((r) => r.value !== "superadmin" || me.role === "superadmin").map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                  className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                    form.role === r.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-lg px-3 py-2">
              Secretária: agendamentos · Médico: clínico completo · Admin: + usuários
            </p>
          </div>
        </div>
      </Modal>
    </div>
    </PageWithSidebar>
  );
}
