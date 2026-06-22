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
  { value: "secretary", label: "Secretária", variant: "neutral" as const },
  { value: "doctor",    label: "Médico",      variant: "brand" as const },
  { value: "admin",     label: "Admin",       variant: "accent" as const },
  { value: "superadmin",label: "Super Admin", variant: "error" as const },
];

function roleBadge(role: string) {
  const r = ROLES.find((x) => x.value === role) || ROLES[0];
  return (
    <Badge variant={r.variant} size="sm">
      {r.label}
    </Badge>
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

  return (
    <PageWithSidebar>
    <div className="min-h-screen bg-slate-50">
      <NavBar
        title="Usuários"
        subtitle="Gerenciar equipe"
        back="/"
        actions={
          <Button
            onClick={openCreate}
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            className="text-white bg-white/15 hover:bg-white/25 border border-white/20"
          >
            Novo
          </Button>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {ROLES.filter((r) => r.value !== "superadmin" || me.role === "superadmin").map((r) => {
            const count = users.filter((u) => u.role === r.value && u.active).length;
            return (
              <Card key={r.value} padding="md" className="border-l-4 border-brand-500">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{r.label}</p>
                <p className="text-3xl font-bold text-brand-600 mt-2">{count}</p>
              </Card>
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

        {/* Users list */}
        <Card>
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200">
            <Users className="w-5 h-5 text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Equipe</p>
            <span className="ml-auto text-xs text-slate-600 font-medium">{users.length} usuário{users.length !== 1 ? "s" : ""}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Nenhum usuário cadastrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className={`flex items-center gap-3 p-4 bg-slate-50 rounded-lg transition-opacity ${!u.active ? "opacity-50" : ""}`}>
                  <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-slate-900 text-sm">{u.name}</p>
                      {roleBadge(u.role)}
                      {!u.active && (
                        <Badge variant="error" size="sm">Inativo</Badge>
                      )}
                      {u.id === me.id && (
                        <Badge variant="brand" size="sm">Você</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      onClick={() => openEdit(u)}
                      variant="tertiary"
                      size="sm"
                      icon={<Pencil className="w-4 h-4" />}
                      className="text-slate-600"
                      ariaLabel={`Editar usuário ${u.name}`}
                    />
                    {u.id !== me.id && u.active && (
                      <Button
                        onClick={() => handleDeactivate(u)}
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-4 h-4" />}
                        className="text-error-600"
                        ariaLabel={`Remover usuário ${u.name}`}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>

      {/* Modal */}
      <Modal
        open={modal === "create" || modal === "edit"}
        onOpenChange={(open) => !open && closeModal()}
        title={modal === "create" ? "Novo usuário" : "Editar usuário"}
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
            <label className="block text-sm font-medium text-slate-900 mb-2">Perfil</label>
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
            <p className="text-xs text-slate-600 mt-3">
              Secretária: agendamentos • Médico: clínico completo • Admin: + usuários
            </p>
          </div>
        </div>
      </Modal>
    </div>
    </PageWithSidebar>
  );
}
