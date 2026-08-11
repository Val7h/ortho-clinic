"use client";

// Cadastro de paciente por foto (06/08). As secretárias cadastravam o mesmo
// paciente duas vezes — no sistema antigo e aqui. Elas colam o print da ficha
// (Ctrl+V, direto do WhatsApp Web) e a IA lê os campos.
//
// A imagem não é guardada em lugar nenhum: vai, é lida, e some.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import NavBar from "@/components/NavBar";
import { PageWithSidebar } from "@/components/PageWithSidebar";
import { patientsApi } from "@/lib/api";
import { buscarCep, cepCompleto, formatarCep } from "@/lib/cep";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type Campos = Record<string, string>;

const ROTULOS: Array<{ k: string; l: string; full?: boolean }> = [
  { k: "name", l: "Nome completo", full: true },
  { k: "birthdate", l: "Data de nascimento" },
  { k: "cpf", l: "CPF" },
  { k: "phone", l: "Telefone / WhatsApp" },
  { k: "address_zip", l: "CEP" },
  { k: "address_street", l: "Endereço", full: true },
  { k: "address_neighborhood", l: "Bairro" },
  { k: "address_city", l: "Cidade" },
  { k: "address_state", l: "UF" },
  { k: "insurance", l: "Convênio (ou Particular)" },
  { k: "insurance_number", l: "Nº da carteirinha" },
];

export default function CadastroPorFotoPage() {
  const router = useRouter();
  const [imagem, setImagem] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [lidos, setLidos] = useState<string[]>([]);
  const [cpfValido, setCpfValido] = useState<boolean | null>(null);
  const [duplicado, setDuplicado] = useState<{ id: number; nome: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const receber = (f: File | null | undefined) => {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      toast.error("Envie uma imagem PNG, JPG ou WEBP.");
      return;
    }
    setImagem(f);
    setPreview(URL.createObjectURL(f));
    setCampos(null);
    setDuplicado(null);
  };

  // Colar em qualquer lugar da página — é assim que ela traz do WhatsApp Web.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const arquivo = Array.from(e.clipboardData?.files || [])[0];
      if (arquivo) { e.preventDefault(); receber(arquivo); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const lerFicha = async () => {
    if (!imagem) return;
    setLendo(true);
    try {
      const r = await patientsApi.lerFoto(imagem);
      if (r.aviso) toast.error(r.aviso);
      const limpos: Campos = {};
      Object.entries(r.campos || {}).forEach(([k, v]) => { limpos[k] = (v as string) || ""; });
      setCampos(limpos);
      setLidos(r.lidos || []);
      setCpfValido(r.cpf_valido);
      if ((r.lidos || []).length) toast.success(`${r.lidos.length} campo(s) lido(s) da imagem`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Não consegui ler essa imagem.");
    } finally {
      setLendo(false);
    }
  };

  const mudar = (k: string, v: string) => setCampos((c) => ({ ...(c || {}), [k]: v }));

  const onCep = async (v: string) => {
    const cep = formatarCep(v);
    mudar("address_zip", cep);
    if (!cepCompleto(cep)) return;
    const achado = await buscarCep(cep);
    if (!achado) return;
    setCampos((c) => ({
      ...(c || {}),
      ...(achado.logradouro ? { address_street: achado.logradouro } : {}),
      ...(achado.bairro ? { address_neighborhood: achado.bairro } : {}),
      address_city: achado.cidade,
      address_state: achado.uf,
    }));
  };

  const salvar = async () => {
    if (!campos?.name?.trim()) { toast.error("O nome é obrigatório."); return; }
    setSalvando(true);
    setDuplicado(null);
    try {
      const payload: any = {};
      Object.entries(campos).forEach(([k, v]) => { if (v?.trim()) payload[k] = v.trim(); });
      payload.name = payload.name.toUpperCase();
      const p = await patientsApi.create(payload);
      if (p.warning) toast(p.warning, { icon: "⚠️", duration: 8000 });
      toast.success("Paciente cadastrado");
      router.push(`/pacientes/${p.id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Erro ao salvar";
      if (String(msg).includes("CPF já cadastrado")) {
        // Trava de duplicata: sem isso a tela vira fábrica de paciente repetido.
        const cpf = (campos.cpf || "").replace(/\D/g, "");
        const achados = await patientsApi.list(cpf).catch(() => []);
        const existente = (achados || [])[0];
        setDuplicado(existente ? { id: existente.id, nome: existente.name } : { id: 0, nome: "" });
      }
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PageWithSidebar>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <NavBar title="Cadastrar por foto" back="/pacientes" />

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <section className="card p-6">
            <h2 className="section-title">1 · Traga a ficha</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
              No WhatsApp Web, copie a imagem da ficha e cole aqui com Ctrl+V. Também dá para
              arrastar o arquivo ou escolher do computador.
            </p>

            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); receber(e.dataTransfer.files?.[0]); }}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Ficha colada" className="max-h-72 mx-auto rounded-lg" />
              ) : (
                <>
                  <p className="text-slate-600 dark:text-slate-300 font-medium">Cole aqui o print da ficha</p>
                  <p className="text-xs text-slate-400 mt-1">Ctrl+V · arrastar · ou clique para escolher</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => receber(e.target.files?.[0])}
            />

            {imagem && (
              <div className="mt-4 flex items-center gap-3">
                <button onClick={lerFicha} disabled={lendo} className="btn-primary">
                  {lendo ? "Lendo a ficha…" : "Ler ficha"}
                </button>
                <button
                  onClick={() => { setImagem(null); setPreview(null); setCampos(null); }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Trocar imagem
                </button>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-4">
              A imagem é usada só para a leitura e não fica guardada no sistema.
            </p>
          </section>

          {campos && (
            <section className="card p-6 space-y-4">
              <div>
                <h2 className="section-title">2 · Confira e salve</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Os campos em azul vieram da imagem. O que ficou vazio não estava na ficha —
                  pode salvar assim mesmo e completar depois.
                </p>
              </div>

              {cpfValido === false && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                  O CPF lido não confere. Provavelmente um dígito saiu errado na imagem — confira
                  antes de salvar.
                </div>
              )}

              {duplicado && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-300">
                  Este paciente já está cadastrado{duplicado.nome ? `: ${duplicado.nome}` : ""}.{" "}
                  {duplicado.id > 0 && (
                    <button onClick={() => router.push(`/pacientes/${duplicado.id}`)} className="underline font-semibold">
                      Abrir a ficha existente
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ROTULOS.map(({ k, l, full }) => (
                  <div key={k} className={full ? "sm:col-span-2" : ""}>
                    <label className="label">
                      {l}
                      {lidos.includes(k) && <span className="ml-2 text-[10px] font-semibold text-blue-600">da imagem</span>}
                    </label>
                    {k === "address_state" ? (
                      <select className="input" value={campos[k] || ""} onChange={(e) => mudar(k, e.target.value)}>
                        <option value="">Selecionar</option>
                        {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    ) : (
                      <input
                        type={k === "birthdate" ? "date" : "text"}
                        className={`input ${lidos.includes(k) ? "border-blue-400" : ""} ${k === "cpf" && cpfValido === false ? "border-red-500" : ""}`}
                        value={campos[k] || ""}
                        onChange={(e) => (k === "address_zip" ? onCep(e.target.value) : mudar(k, e.target.value))}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => router.push("/pacientes")} className="text-sm text-slate-500 hover:text-slate-700">
                  Cancelar
                </button>
                <button onClick={salvar} disabled={salvando} className="btn-primary">
                  {salvando ? "Salvando…" : "Salvar paciente"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </PageWithSidebar>
  );
}
