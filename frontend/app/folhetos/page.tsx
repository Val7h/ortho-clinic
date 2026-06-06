"use client";
import { useEffect, useState } from "react";
import { BookOpen, Search, ChevronRight, X, Printer, Plus, Upload, File } from "lucide-react";
import NavBar from "@/components/NavBar";
import { Card, Badge, Button, Input, Modal, useModal } from "@/components/ui";
import { leafletsApi } from "@/lib/api";
import toast from "react-hot-toast";

export default function LeafletsPage() {
  const [leaflets, setLeaflets] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const modal = useModal(false);
  const uploadModal = useModal(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Geral");

  const loadLeaflets = () => {
    leafletsApi.list().then(setLeaflets).catch(() => toast.error("Erro ao carregar folhetos"));
  };

  useEffect(() => {
    loadLeaflets();
  }, []);

  const categories = Array.from(new Set(leaflets.map((l) => l.category)));
  const filtered = leaflets.filter(
    (l) =>
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.category.toLowerCase().includes(search.toLowerCase()) ||
      l.tags?.some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const openLeaflet = (leaflet: any) => {
    setSelected(leaflet);
    modal.openModal();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      const valid = f.type === "application/pdf" ||
                    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                    f.name.endsWith(".docx") ||
                    f.name.endsWith(".pdf");

      if (!valid) {
        toast.error("Apenas PDF e DOCX são aceitos");
        return;
      }
      setFile(f);
    }
  };

  const handleUpload = async () => {
    if (!file || !title) {
      toast.error("Preencha título e selecione arquivo");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("category", category);
      formData.append("file", file);

      // Upload the file (using the API)
      await leafletsApi.upload(formData);
      toast.success("Folheto enviado com sucesso!");

      // Reset form
      setFile(null);
      setTitle("");
      setCategory("Geral");
      uploadModal.onOpenChange(false);

      // Reload leaflets
      loadLeaflets();
    } catch (error) {
      toast.error("Erro ao enviar folheto. Tente novamente.");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar
        title="Folhetos Informativos"
        back="/"
        actions={
          <Button
            size="md"
            icon={<Plus className="h-5 w-5" />}
            onClick={() => uploadModal.onOpenChange(true)}
          >
            Novo Folheto
          </Button>
        }
      />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Input
          label=""
          icon={<Search className="w-4 h-4" />}
          iconPosition="left"
          placeholder="Buscar por condição, categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {categories.map((cat) => {
          const items = filtered.filter((l) => l.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-widest">{cat}</h3>
              <div className="space-y-2">
                {items.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => openLeaflet(l)}
                    className="w-full text-left"
                  >
                    <Card hoverable padding="md" className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-brand-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{l.title}</p>
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {l.tags?.slice(0, 2).map((t: string) => (
                            <Badge key={t} variant="neutral" size="sm">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Nenhum folheto encontrado</p>
          </div>
        )}
      </main>

      {/* Modal de visualização */}
      <Modal
        open={modal.open}
        onOpenChange={modal.onOpenChange}
        title={selected?.title}
        size="lg"
        footer={
          <div className="flex gap-3">
            <Button
              onClick={() => window.print()}
              variant="secondary"
              icon={<Printer className="w-4 h-4" />}
            >
              Imprimir
            </Button>
            <Button
              onClick={() => modal.onOpenChange(false)}
              variant="tertiary"
              fullWidth
            >
              Fechar
            </Button>
          </div>
        }
      >
        <div
          className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300"
          dangerouslySetInnerHTML={{ __html: selected?.content_html || "" }}
        />
      </Modal>

      {/* Modal de upload */}
      <Modal
        open={uploadModal.open}
        onOpenChange={uploadModal.onOpenChange}
        title="Enviar Folheto Informativo"
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              onClick={() => uploadModal.onOpenChange(false)}
              variant="tertiary"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              isLoading={uploading}
              disabled={!file || !title}
            >
              Enviar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Título do Folheto
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Tendinite do Ombro"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Categoria
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
            >
              <option>Geral</option>
              <option>Lesões</option>
              <option>Reabilitação</option>
              <option>Exercícios</option>
              <option>Prevenção</option>
              <option>Pós-operatório</option>
            </select>
          </div>

          {/* Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Arquivo (PDF ou DOCX)
            </label>
            <label className="relative block border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-brand-500 transition-colors">
              <input
                type="file"
                accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                  {file ? `Selecionado: ${file.name}` : "Clique para selecionar"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  PDF ou DOCX (máx 10MB)
                </p>
              </div>
            </label>
          </div>

          {/* Info */}
          <div className="bg-brand-50 dark:bg-brand-900/20 p-3 rounded-lg">
            <p className="text-xs text-brand-700 dark:text-brand-200">
              💡 Após upload, o folheto pode ser visualizado e impresso por todos os usuários.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
