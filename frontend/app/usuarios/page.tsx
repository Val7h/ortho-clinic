"use client";
import { useEffect, useState } from "react";
import {
  Users, Plus, Pencil, Trash2, X, Check,
  Loader2, Eye, EyeOff, Shield, User, Building2,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { authApi } from "@/lib/api";
import { useProtectedPage } from "@/components/AuthProvider";
import toast from "react-hot-toast";

const ROLES = [
  { value: "secretary", label: "Secretária", color: "bg-slate-100 text-slate-600" },
  { value: "doctor",    label: "Médico",      color: "bg-blue-100 text-blue-700" },
  { value: "admin",     label: "Admin",       color: "bg-purple-100 text-purple-700" },
  { value: "superadmin",label: "Super Admin", color: "bg-red-100 text-red-700" },
];

function roleBadge(role: string) {
  const r = ROLES.find((x) => x.value === role) || ROLES[0];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${r.color}`}>
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-100">
        <NavBar title="Usuários" back="/" />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <Shield className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500">Acesso restrito a administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar
        title="Usuários"
        subtitle="Gerenciar equipe"
        back="/"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-sm font-semibold text-white transition-colors border border-white/20"
          >
            <Plus className="w-4 h-4" /> Novo
          </button>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {ROLES.filter((r) => r.value !== "superadmin" || me.role === "superadmin").map((r) => {
            const count = users.filter((u) => u.role === r.value && u.active).length;
            return (
              <div key={r.value} className="card p-4 border-l-4 border-brand-400">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{r.label}</p>
                <p className="text-2xl font-extrabold text-brand-600 mt-0.5">{count}</p>
              </div>
            );
          })}
        </div>

        {/* Org management (superadmin) */}
        {me.role === "superadmin" && orgs.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Organizações</p>
            </div>
            <div className="divide-y divide-slate-100">
              {orgs.map((org) => (
                <div key={org.id} className="flex items-center px-5 py-3 gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">{org.name}</p>
                    <p className="text-xs text-slate-400">{org.city}/{org.state} · {org.plan}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${org.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {org.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Equipe</p>
            <span className="ml-auto text-xs text-slate-400">{users.length} usuário{users.length !== 1 ? "s" : ""}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map((u) => (
                <div key={u.id} className={`flex items-center gap-3 px-5 py-3.5 ${!u.active ? "opacity-50" : ""}`}>
                  <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-brand-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-800 text-sm">{u.name}</p>
                      {roleBadge(u.role)}
                      {!u.active && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold uppercase">Inativo</span>
                      )}
                      {u.id === me.id && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-bold">Você</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-600 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {u.id !== me.id && u.active && (
                      <button
                        onClick={() => handleDeactivate(u)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-center py-10">
                  <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Nenhum usuário cadastrado</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {(modal === "create" || modal === "edit") && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">
                {modal === "create" ? "Novo usuário" : "Editar usuário"}
              </h3>
              <button onClick={closeModal} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Nome completo</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Nome do usuário"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="email@clinica.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                  Senha {modal === "edit" && <span className="normal-case font-normal">(deixe em branco para manter)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder={modal === "create" ? "Mínimo 6 caracteres" : "Nova senha (opcional)"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Perfil</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.filter((r) => r.value !== "superadmin" || me.role === "superadmin").map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        form.role === r.value
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  Secretária: agendamentos • Médico: clínico completo • Admin: + usuários
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button
                onClick={closeModal}
                className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                  : <><Check className="w-4 h-4" /> Salvar</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
