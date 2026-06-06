'use client';

import { useState } from 'react';
import { Save, Plus } from 'lucide-react';
import { Button, Modal, useModal } from '@/components/ui';
import toast from 'react-hot-toast';

interface AnamneseFormProps {
  patientId: number;
  patientName: string;
  onSave?: (data: any) => void;
}

export const AnamneseForm = ({ patientId, patientName, onSave }: AnamneseFormProps) => {
  const modal = useModal();
  const [loading, setLoading] = useState(false);
  const [notas, setNotas] = useState('');

  const handleAddDateEntry = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear()).slice(-2);
    const dateStr = `${day}/${month}/${year}`;

    const newEntry = notas ? `${notas}\n\n${dateStr} ` : `${dateStr} `;
    setNotas(newEntry);

    // Focus on textarea
    setTimeout(() => {
      const textarea = document.querySelector('textarea[data-anamnese]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(newEntry.length, newEntry.length);
      }
    }, 0);
  };

  const handleSave = async () => {
    if (!notas.trim()) {
      toast.error('Adicione pelo menos uma anotação');
      return;
    }

    setLoading(true);
    try {
      // await anamnesisApi.save(patientId, { notas });
      toast.success('Anamnese salva com sucesso!');
      onSave?.({ notas });
      setNotas('');
      modal.onOpenChange(false);
    } catch (error) {
      toast.error('Erro ao salvar anamnese');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => modal.onOpenChange(true)} className="w-full">
        📋 Preencher Anamnese
      </Button>

      <Modal
        open={modal.open}
        onOpenChange={modal.onOpenChange}
        title={`Anamnese - ${patientName}`}
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="tertiary" onClick={() => modal.onOpenChange(false)}>
              Fechar
            </Button>
            <Button onClick={handleSave} isLoading={loading} icon={<Save className="w-4 h-4" />}>
              Salvar Notas
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Instruções */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              💡 <strong>Como usar:</strong> Clique em "+ Adicionar Data" para inserir a data de hoje, depois escreva suas anotações.
              Cada entrada é um bloco de anotações onde você documenta a evolução do paciente.
            </p>
          </div>

          {/* Botão Adicionar Data */}
          <Button
            onClick={handleAddDateEntry}
            variant="secondary"
            fullWidth
            icon={<Plus className="w-4 h-4" />}
          >
            + Adicionar Data de Hoje
          </Button>

          {/* Textarea Grande e Branco */}
          <div>
            <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-2">
              📝 Notas de Evolução
            </label>
            <textarea
              data-anamnese="true"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={`Exemplo:\n01/02/2025 Paciente chegou com dor no ombro direito há 2 semanas. Relatou levantamento de peso como gatilho. Amplitude de movimento limitada. Prescrevi repouso e anti-inflamatório.\n\n15/02/2025 Evolução positiva. Dor reduzida de 8/10 para 5/10. Retomou atividades leves. Continuar repouso relativo.\n\n20/02/2025 Alta completa. Sem dor. Orientado exercícios de fortalecimento.`}
              className="w-full h-96 px-4 py-3 border border-slate-300 dark:border-slate-300 rounded-lg bg-white dark:bg-white text-slate-900 dark:text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
              {notas.length} caracteres | Cada entrada começa com a data (ex: 01/02/2025)
            </p>
          </div>

          {/* Preview */}
          {notas && (
            <div className="p-3 bg-slate-100 dark:bg-slate-100 rounded-lg border border-slate-300 dark:border-slate-300">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-700 mb-2">📋 Preview:</p>
              <div className="text-xs text-slate-800 dark:text-slate-800 font-mono whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                {notas}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
