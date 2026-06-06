'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
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

  const [formData, setFormData] = useState({
    // Queixa Principal
    queixa_principal: '',
    duracao: '',
    localizacao: '',
    intensidade: '5',
    caracteristicas: '',

    // Histórico
    primeira_vez: 'nao',
    episodios_anteriores: '',
    trauma_recente: '',
    evento_desencadeante: '',

    // Atividades
    atividade_profissional: '',
    esportes: '',
    atividades_prejudicadas: '',

    // Saúde Geral
    alergias: '',
    medicacoes: '',
    doencas_cronicas: '',
    cirurgias_previas: '',

    // Exame Físico (anotações do médico)
    amplitude_movimento: '',
    forca_muscular: '',
    sensibilidade: '',
    inflamacao: '',
    outros_achados: '',

    // Diagnóstico Preliminar
    diagnostico_preliminar: '',
    exames_solicitados: '',
    conduta: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Aqui você faria a chamada à API para salvar a anamnese
      // await anamnesisApi.save(patientId, formData);

      toast.success('Anamnese salva com sucesso!');
      onSave?.(formData);
      modal.onOpenChange(false);

      // Limpar formulário
      setFormData({
        queixa_principal: '',
        duracao: '',
        localizacao: '',
        intensidade: '5',
        caracteristicas: '',
        primeira_vez: 'nao',
        episodios_anteriores: '',
        trauma_recente: '',
        evento_desencadeante: '',
        atividade_profissional: '',
        esportes: '',
        atividades_prejudicadas: '',
        alergias: '',
        medicacoes: '',
        doencas_cronicas: '',
        cirurgias_previas: '',
        amplitude_movimento: '',
        forca_muscular: '',
        sensibilidade: '',
        inflamacao: '',
        outros_achados: '',
        diagnostico_preliminar: '',
        exames_solicitados: '',
        conduta: '',
      });
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
              Cancelar
            </Button>
            <Button onClick={handleSave} isLoading={loading} icon={<Save className="w-4 h-4" />}>
              Salvar Anamnese
            </Button>
          </div>
        }
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-4">
          {/* ── Queixa Principal ──────────────────────────────────── */}
          <fieldset className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <legend className="font-bold text-blue-900 dark:text-blue-200">🔵 Queixa Principal</legend>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Qual é a reclamação/sintoma?
              </label>
              <textarea
                name="queixa_principal"
                value={formData.queixa_principal}
                onChange={handleChange}
                placeholder="Ex: Dor no ombro direito, limitação de movimentos..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-brand-500"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                  Há quanto tempo?
                </label>
                <input
                  type="text"
                  name="duracao"
                  value={formData.duracao}
                  onChange={handleChange}
                  placeholder="Ex: 2 semanas, 3 meses..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                  Localização
                </label>
                <input
                  type="text"
                  name="localizacao"
                  value={formData.localizacao}
                  onChange={handleChange}
                  placeholder="Ex: Ombro direito, joelho esquerdo..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Intensidade da dor (0-10)
              </label>
              <input
                type="range"
                name="intensidade"
                min="0"
                max="10"
                value={formData.intensidade}
                onChange={handleChange}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>Sem dor (0)</span>
                <span className="font-bold text-brand-600">{formData.intensidade}/10</span>
                <span>Máxima (10)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Características da dor
              </label>
              <textarea
                name="caracteristicas"
                value={formData.caracteristicas}
                onChange={handleChange}
                placeholder="Ex: Dor latejante, aguda, queimação, formigamento..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>
          </fieldset>

          {/* ── Histórico ─────────────────────────────────────────── */}
          <fieldset className="space-y-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <legend className="font-bold text-amber-900 dark:text-amber-200">📅 Histórico</legend>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
                É a primeira vez?
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="primeira_vez"
                    value="sim"
                    checked={formData.primeira_vez === 'sim'}
                    onChange={handleChange}
                  />
                  Sim
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="primeira_vez"
                    value="nao"
                    checked={formData.primeira_vez === 'nao'}
                    onChange={handleChange}
                  />
                  Não
                </label>
              </div>
            </div>

            {formData.primeira_vez === 'nao' && (
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                  Quantos episódios anteriores?
                </label>
                <textarea
                  name="episodios_anteriores"
                  value={formData.episodios_anteriores}
                  onChange={handleChange}
                  placeholder="Descreva os episódios anteriores..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                  rows={2}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Houve trauma/queda recente?
              </label>
              <textarea
                name="trauma_recente"
                value={formData.trauma_recente}
                onChange={handleChange}
                placeholder="Descreva o trauma, quando ocorreu..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Qual foi o evento desencadeante?
              </label>
              <textarea
                name="evento_desencadeante"
                value={formData.evento_desencadeante}
                onChange={handleChange}
                placeholder="Ex: Levantou peso, fez exercício, movimento repetitivo..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>
          </fieldset>

          {/* ── Atividades ────────────────────────────────────────── */}
          <fieldset className="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <legend className="font-bold text-green-900 dark:text-green-200">⚽ Atividades</legend>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Atividade profissional
              </label>
              <input
                type="text"
                name="atividade_profissional"
                value={formData.atividade_profissional}
                onChange={handleChange}
                placeholder="Ex: Dentista, pedreiro, programador..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Esportes/Atividades físicas
              </label>
              <input
                type="text"
                name="esportes"
                value={formData.esportes}
                onChange={handleChange}
                placeholder="Ex: Futebol, natação, musculação..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Atividades prejudicadas pelo sintoma
              </label>
              <textarea
                name="atividades_prejudicadas"
                value={formData.atividades_prejudicadas}
                onChange={handleChange}
                placeholder="Ex: Não consegue levantar o braço, não consegue dormir do lado direito..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>
          </fieldset>

          {/* ── Saúde Geral ───────────────────────────────────────── */}
          <fieldset className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <legend className="font-bold text-purple-900 dark:text-purple-200">🏥 Saúde Geral</legend>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Alergias conhecidas
              </label>
              <input
                type="text"
                name="alergias"
                value={formData.alergias}
                onChange={handleChange}
                placeholder="Ex: Penicilina, ibuprofeno..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Medicações em uso
              </label>
              <textarea
                name="medicacoes"
                value={formData.medicacoes}
                onChange={handleChange}
                placeholder="Lista de medicações que o paciente toma regularmente..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Doenças crônicas
              </label>
              <textarea
                name="doencas_cronicas"
                value={formData.doencas_cronicas}
                onChange={handleChange}
                placeholder="Ex: Diabetes, hipertensão, artrite..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Cirurgias prévias
              </label>
              <textarea
                name="cirurgias_previas"
                value={formData.cirurgias_previas}
                onChange={handleChange}
                placeholder="Cirurgias ortopédicas ou de outro tipo..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>
          </fieldset>

          {/* ── Exame Físico ──────────────────────────────────────── */}
          <fieldset className="space-y-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <legend className="font-bold text-red-900 dark:text-red-200">🔍 Exame Físico</legend>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Amplitude de movimento
              </label>
              <textarea
                name="amplitude_movimento"
                value={formData.amplitude_movimento}
                onChange={handleChange}
                placeholder="Descreva a amplitude e limitações encontradas..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Força muscular
              </label>
              <textarea
                name="forca_muscular"
                value={formData.forca_muscular}
                onChange={handleChange}
                placeholder="Avaliação de força (5/5, 4/5, etc)..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Sensibilidade
              </label>
              <textarea
                name="sensibilidade"
                value={formData.sensibilidade}
                onChange={handleChange}
                placeholder="Hipoestesia, parestesia, normalidade..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Inflamação, inchaço, avermelhamento
              </label>
              <textarea
                name="inflamacao"
                value={formData.inflamacao}
                onChange={handleChange}
                placeholder="Presença ou ausência de inflamação..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Outros achados
              </label>
              <textarea
                name="outros_achados"
                value={formData.outros_achados}
                onChange={handleChange}
                placeholder="Qualquer outro achado relevante..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>
          </fieldset>

          {/* ── Diagnóstico e Conduta ──────────────────────────────── */}
          <fieldset className="space-y-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
            <legend className="font-bold text-indigo-900 dark:text-indigo-200">💊 Diagnóstico e Conduta</legend>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Diagnóstico preliminar
              </label>
              <textarea
                name="diagnostico_preliminar"
                value={formData.diagnostico_preliminar}
                onChange={handleChange}
                placeholder="Diagnóstico inicial baseado na anamnese e exame..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Exames a solicitar
              </label>
              <textarea
                name="exames_solicitados"
                value={formData.exames_solicitados}
                onChange={handleChange}
                placeholder="RX, ultrassom, ressonância, etc..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-1">
                Conduta/Tratamento recomendado
              </label>
              <textarea
                name="conduta"
                value={formData.conduta}
                onChange={handleChange}
                placeholder="Prescrição, fisioterapia, repouso, injeção, cirurgia, etc..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"
                rows={3}
              />
            </div>
          </fieldset>
        </div>
      </Modal>
    </>
  );
};
