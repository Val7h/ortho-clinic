'use client';

import React, { useState, useCallback } from 'react';
import { Save, TrendingDown, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal, { useModal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import type { AnamneseFollowUpData, AnamneseFollowUpProps } from '@/types/anamnese';
import { PAIN_COLORS, AnamneseUtils } from '@/types/anamnese';

/**
 * AnamneseFollowUp Component
 *
 * Componente profissional para preenchimento de anamnese de retorno/acompanhamento
 * com:
 * - Comparação visual de dor antes/depois
 * - Evolução do paciente
 * - Adesão ao tratamento
 * - Novos sintomas e próximos passos
 */

const INITIAL_FORM_STATE: AnamneseFollowUpData = {
  template_type: 'follow_up',
  status: 'draft',
  pain_intensity_last: 5,
  pain_intensity_current: 5,
  evolution_summary: '',
  new_symptoms: '',
  treatment_adherence: 'good',
  treatment_response: '',
  current_limitations: '',
  next_steps: '',
  additional_observations: '',
};

export const AnamneseFollowUp: React.FC<AnamneseFollowUpProps> = ({
  patientId,
  patientName,
  lastConsultationDate,
  lastPainIntensity = 5,
  onSave,
}) => {
  const modal = useModal();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<AnamneseFollowUpData>({
    ...INITIAL_FORM_STATE,
    last_consultation_date: lastConsultationDate,
    pain_intensity_last: lastPainIntensity,
    pain_intensity_current: lastPainIntensity,
  });

  // Calculate pain improvement
  const painImprovement = formData.pain_intensity_last - formData.pain_intensity_current;
  const improvementPercentage = AnamneseUtils.calculatePainImprovement(
    formData.pain_intensity_last,
    formData.pain_intensity_current
  );

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: keyof AnamneseFollowUpData, value: any) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  // Handle save
  const handleSave = async () => {
    if (!formData.evolution_summary.trim()) {
      toast.error('Descreva pelo menos a evolução do paciente');
      return;
    }

    setLoading(true);
    try {
      const dataToSave: AnamneseFollowUpData = {
        ...formData,
        status: 'completed',
        created_at: new Date().toISOString(),
      };

      onSave?.(dataToSave);
      toast.success('Anamnese de retorno salva com sucesso!');
      setTimeout(() => {
        modal.onOpenChange(false);
        setFormData(INITIAL_FORM_STATE);
      }, 500);
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
        📋 Preencher Anamnese - Retorno
      </Button>

      <Modal
        open={modal.open}
        onOpenChange={modal.onOpenChange}
        title={`Anamnese - Retorno | ${patientName}`}
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="tertiary" onClick={() => modal.onOpenChange(false)}>
              Fechar
            </Button>
            <Button
              onClick={handleSave}
              isLoading={loading}
              icon={<Save className="w-4 h-4" />}
            >
              Salvar Anamnese
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Info Box */}
          <InfoBox
            title="Anamnese de Retorno"
            message="Registre a evolução do paciente desde a última consulta"
          />

          {/* Pain Comparison Card */}
          <PainComparisonCard
            painBefore={formData.pain_intensity_last}
            painAfter={formData.pain_intensity_current}
            onChangePainAfter={(value) => handleFieldChange('pain_intensity_current', value)}
            lastConsultationDate={lastConsultationDate}
          />

          {/* Evolution Summary */}
          <FormField
            label="Evolução desde Última Consulta"
            required
            value={formData.evolution_summary}
            onChange={(value) => handleFieldChange('evolution_summary', value)}
            placeholder="Como o paciente evoluiu? Houve melhora nos sintomas? Em qual percentual?"
            type="textarea"
            rows={4}
          />

          {/* Treatment Adherence */}
          <TreatmentAdherenceSelector
            value={formData.treatment_adherence}
            onChange={(value) => handleFieldChange('treatment_adherence', value)}
          />

          {/* Treatment Response */}
          <FormField
            label="Resposta ao Tratamento"
            value={formData.treatment_response}
            onChange={(value) => handleFieldChange('treatment_response', value)}
            placeholder="Como o paciente respondeu ao tratamento proposto? Quais benefícios obteve?"
            type="textarea"
            rows={3}
          />

          {/* New Symptoms */}
          <FormField
            label="Novos Sintomas ou Queixas?"
            value={formData.new_symptoms}
            onChange={(value) => handleFieldChange('new_symptoms', value)}
            placeholder="Surgiram novos sintomas ou outras queixas? Descreva-os"
            type="textarea"
            rows={3}
          />

          {/* Current Limitations */}
          <FormField
            label="Limitações Atuais"
            value={formData.current_limitations}
            onChange={(value) => handleFieldChange('current_limitations', value)}
            placeholder="Quais atividades o paciente ainda não consegue fazer? Qual é o nível de funcionalidade?"
            type="textarea"
            rows={3}
          />

          {/* Next Steps */}
          <FormField
            label="Próximos Passos / Recomendações"
            value={formData.next_steps}
            onChange={(value) => handleFieldChange('next_steps', value)}
            placeholder="Qual é o próximo passo? Continuar? Aumentar intensidade? Liberar? Encaminhar?"
            type="textarea"
            rows={3}
          />

          {/* Additional Observations */}
          <FormField
            label="Observações Adicionais"
            value={formData.additional_observations}
            onChange={(value) => handleFieldChange('additional_observations', value)}
            placeholder="Notas importantes, achados clínicos, comportamento do paciente..."
            type="textarea"
            rows={3}
          />

          {/* Summary Stats */}
          <AssessmentSummary
            painImprovement={painImprovement}
            improvementPercentage={improvementPercentage}
            treatmentAdherence={formData.treatment_adherence}
            hasNewSymptoms={formData.new_symptoms.trim().length > 0}
          />
        </div>
      </Modal>
    </>
  );
};

/**
 * Componentes auxiliares
 */

interface InfoBoxProps {
  title: string;
  message: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ title, message }) => {
  return (
    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
      <p className="text-sm text-blue-700 dark:text-blue-300">
        <span className="font-semibold">{title}:</span> {message}
      </p>
    </div>
  );
};

interface PainComparisonCardProps {
  painBefore: number;
  painAfter: number;
  onChangePainAfter: (value: number) => void;
  lastConsultationDate?: string;
}

const PainComparisonCard: React.FC<PainComparisonCardProps> = ({
  painBefore,
  painAfter,
  onChangePainAfter,
  lastConsultationDate,
}) => {
  const painImprovement = painBefore - painAfter;
  const improvementPercentage =
    painBefore === 0 ? 0 : Math.round(((painBefore - painAfter) / painBefore) * 100);

  return (
    <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-xl">
      <h3 className="font-bold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
        <span className="text-xl">📊</span> Comparação de Dor
      </h3>

      {lastConsultationDate && (
        <p className="text-xs text-purple-700 dark:text-purple-300 mb-4">
          Última consulta: {lastConsultationDate}
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Before */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-purple-900 dark:text-purple-100">
            Intensidade (Última Consulta)
          </label>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {painBefore}/10
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                className={`flex-1 h-8 rounded-lg transition-all ${
                  i === painBefore
                    ? `${PAIN_COLORS[i]} ring-2 ring-offset-2 ring-purple-900 dark:ring-offset-purple-900`
                    : i < painBefore
                      ? `${PAIN_COLORS[i]} opacity-50`
                      : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Arrow & Improvement */}
        <div className="flex items-center justify-center">
          {painImprovement > 0 ? (
            <div className="flex flex-col items-center gap-2">
              <TrendingDown className="w-8 h-8 text-emerald-500" />
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {improvementPercentage}%
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Melhora</span>
            </div>
          ) : painImprovement < 0 ? (
            <div className="flex flex-col items-center gap-2">
              <TrendingUp className="w-8 h-8 text-red-500" />
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                {Math.abs(improvementPercentage)}%
              </span>
              <span className="text-xs text-red-600 dark:text-red-400">Piora</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-slate-500" />
              <span className="text-xs text-slate-600 dark:text-slate-400 text-center">
                Sem mudança
              </span>
            </div>
          )}
        </div>

        {/* After - Interactive */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-purple-900 dark:text-purple-100">
            Intensidade (Hoje)
          </label>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {painAfter}/10
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => onChangePainAfter(i)}
                className={`flex-1 h-8 rounded-lg transition-all ${
                  i === painAfter
                    ? `${PAIN_COLORS[i]} ring-2 ring-offset-2 ring-purple-900 dark:ring-offset-purple-900 scale-110`
                    : `${PAIN_COLORS[i]} opacity-60 hover:opacity-100`
                }`}
                title={`${i}/10`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Improvement Message */}
      {painImprovement !== 0 && (
        <div
          className={`mt-4 p-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${
            painImprovement > 0
              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
          }`}
        >
          {painImprovement > 0 ? (
            <>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Melhora de {painImprovement} ponto(s) na escala de dor
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Piora de {Math.abs(painImprovement)} ponto(s) na escala de dor
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'textarea';
  rows?: number;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  rows = 3,
}) => {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
        />
      )}
    </div>
  );
};

interface TreatmentAdherenceSelectorProps {
  value: string;
  onChange: (value: any) => void;
}

const TreatmentAdherenceSelector: React.FC<TreatmentAdherenceSelectorProps> = ({
  value,
  onChange,
}) => {
  const options = [
    { key: 'excellent', label: 'Excelente (100%)', icon: '✅' },
    { key: 'good', label: 'Boa (75%)', icon: '👍' },
    { key: 'fair', label: 'Regular (50%)', icon: '⚠️' },
    { key: 'poor', label: 'Fraca (<50%)', icon: '❌' },
  ];

  return (
    <div>
      <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
        Adesão ao Tratamento
      </label>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`px-4 py-3 rounded-lg font-medium text-sm transition-all border-2 flex items-center justify-center gap-2 ${
              value === opt.key
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300'
                : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-400'
            }`}
          >
            <span>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface AssessmentSummaryProps {
  painImprovement: number;
  improvementPercentage: number;
  treatmentAdherence: string;
  hasNewSymptoms: boolean;
}

const AssessmentSummary: React.FC<AssessmentSummaryProps> = ({
  painImprovement,
  improvementPercentage,
  treatmentAdherence,
  hasNewSymptoms,
}) => {
  const adherenceIcons: Record<string, string> = {
    excellent: '✅',
    good: '👍',
    fair: '⚠️',
    poor: '❌',
  };

  const adherenceLabels: Record<string, string> = {
    excellent: 'Excelente',
    good: 'Boa',
    fair: 'Regular',
    poor: 'Fraca',
  };

  return (
    <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-3">
      <h4 className="font-bold text-slate-900 dark:text-slate-50">
        📋 Resumo da Avaliação
      </h4>
      <div className="grid md:grid-cols-2 gap-4 text-sm">
        {/* Pain Evolution */}
        <div className="flex items-start gap-3">
          <div className="text-xl mt-1">
            {painImprovement > 0 ? '📈' : painImprovement < 0 ? '📉' : '➡️'}
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-50">Evolução de Dor</p>
            <p className="text-slate-600 dark:text-slate-400">
              {painImprovement > 0
                ? `Melhora de ${painImprovement} ponto(s) (${improvementPercentage}%)`
                : painImprovement < 0
                  ? `Piora de ${Math.abs(painImprovement)} ponto(s)`
                  : 'Sem mudança'}
            </p>
          </div>
        </div>

        {/* Treatment Adherence */}
        <div className="flex items-start gap-3">
          <div className="text-xl mt-1">{adherenceIcons[treatmentAdherence]}</div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-50">Adesão</p>
            <p className="text-slate-600 dark:text-slate-400">
              {adherenceLabels[treatmentAdherence]}
            </p>
          </div>
        </div>

        {/* New Symptoms */}
        <div className="flex items-start gap-3">
          <div className="text-xl mt-1">{hasNewSymptoms ? '⚠️' : '✅'}</div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-50">Novos Sintomas</p>
            <p className="text-slate-600 dark:text-slate-400">
              {hasNewSymptoms ? 'Relatados' : 'Nenhum'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
