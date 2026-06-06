'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal, { useModal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { MedicationSelector } from '@/components/MedicationSelector';
import type {
  AnamneseFirstConsultationData,
  AnamneseFirstConsultationProps,
} from '@/types/anamnese';
import { PAIN_COLORS, PAIN_LOCATIONS } from '@/types/anamnese';

/**
 * AnamneseFirstConsultation Component
 *
 * Componente profissional e completo para preenchimento de anamnese de primeira consulta
 * com interface de abas navegáveis:
 * - TAB 1: Queixa Principal
 * - TAB 2: Histórico
 * - TAB 3: Hábitos e Risco
 * - TAB 4: Exame Físico
 * - TAB 5: Resumo
 */

type TabType = 'complaint' | 'history' | 'habits' | 'physical' | 'summary';

interface TabConfig {
  id: TabType;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const TABS: TabConfig[] = [
  {
    id: 'complaint',
    label: 'Queixa Principal',
    icon: '🔴',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-red-200 dark:border-red-800',
  },
  {
    id: 'history',
    label: 'Histórico',
    icon: '📜',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
  {
    id: 'habits',
    label: 'Hábitos e Risco',
    icon: '⚠️',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  {
    id: 'physical',
    label: 'Exame Físico',
    icon: '🔍',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  {
    id: 'summary',
    label: 'Resumo',
    icon: '✅',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
];

const INITIAL_FORM_STATE: AnamneseFirstConsultationData = {
  template_type: 'first_consultation',
  status: 'draft',
  chief_complaint: '',
  pain_location: '',
  symptom_duration: '',
  pain_intensity: 5,
  aggravating_factors: '',
  relieving_factors: '',
  previous_traumas: '',
  previous_surgeries: '',
  previous_physiotherapy: '',
  previous_treatments: '',
  current_medications: [],
  profession: '',
  physical_activities: '',
  sedentarism: 5,
  smoking: false,
  alcohol_consumption: 'none',
  sleep_quality: 'good',
  range_of_motion: '',
  specific_tests: '',
  inflammation: false,
  deformities: '',
};

export const AnamneseFirstConsultation: React.FC<AnamneseFirstConsultationProps> = ({
  patientId,
  patientName,
  onSave,
}) => {
  const modal = useModal();
  const [currentTab, setCurrentTab] = useState<TabType>('complaint');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<AnamneseFirstConsultationData>(INITIAL_FORM_STATE);

  // Calculate completion percentage
  const completionPercentage = useMemo(() => {
    const fields = Object.keys(formData).filter(
      (k) => !['template_type', 'status', 'created_at'].includes(k)
    );
    const filled = fields.filter((k) => {
      const value = (formData as any)[k];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return true;
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return false;
    });
    return Math.round((filled.length / fields.length) * 100);
  }, [formData]);

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: keyof AnamneseFirstConsultationData, value: any) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  // Handle save
  const handleSave = async () => {
    if (!formData.chief_complaint.trim()) {
      toast.error('Preencha ao menos a queixa principal');
      return;
    }

    setLoading(true);
    try {
      const dataToSave: AnamneseFirstConsultationData = {
        ...formData,
        status: 'completed',
        created_at: new Date().toISOString(),
      };

      onSave?.(dataToSave);
      toast.success('Anamnese salva com sucesso!');
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
        📋 Preencher Anamnese - Primeira Consulta
      </Button>

      <Modal
        open={modal.open}
        onOpenChange={modal.onOpenChange}
        title={`Anamnese - Primeira Consulta | ${patientName}`}
        size="xl"
        footer={
          <div className="flex gap-3 justify-between items-center">
            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="w-40 h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 min-w-fit">
                {completionPercentage}%
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
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
          </div>
        }
      >
        <div className="space-y-4">
          {/* Tab Navigation */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`px-4 py-2.5 rounded-md whitespace-nowrap font-medium text-sm transition-all ${
                  currentTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-4 min-h-[500px]">
            {/* TAB 1: Queixa Principal */}
            {currentTab === 'complaint' && (
              <div className="space-y-5">
                {/* Info Box */}
                <InfoBox
                  color="blue"
                  title="Informações básicas"
                  message="Descreva com detalhes o motivo principal da consulta"
                />

                {/* Chief Complaint */}
                <FormField
                  label="Motivo da Consulta"
                  required
                  value={formData.chief_complaint}
                  onChange={(value) => handleFieldChange('chief_complaint', value)}
                  placeholder="Descreva o principal motivo da consulta..."
                  type="textarea"
                  rows={4}
                />

                {/* Pain Location */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
                    Localização da Dor/Desconforto
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAIN_LOCATIONS.map((location) => (
                      <LocationButton
                        key={location}
                        location={location}
                        isSelected={formData.pain_location === location}
                        onClick={() =>
                          handleFieldChange(
                            'pain_location',
                            formData.pain_location === location ? '' : location
                          )
                        }
                      />
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <FormField
                  label="Há quanto tempo?"
                  value={formData.symptom_duration}
                  onChange={(value) => handleFieldChange('symptom_duration', value)}
                  placeholder="Ex: 2 semanas, 3 meses..."
                />

                {/* Pain Intensity Slider */}
                <PainIntensitySelector
                  value={formData.pain_intensity}
                  onChange={(value) => handleFieldChange('pain_intensity', value)}
                />

                {/* Aggravating and Relieving Factors */}
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    label="O que piora?"
                    value={formData.aggravating_factors}
                    onChange={(value) => handleFieldChange('aggravating_factors', value)}
                    placeholder="Movimento, esforço, posição..."
                    type="textarea"
                    rows={3}
                  />
                  <FormField
                    label="O que melhora?"
                    value={formData.relieving_factors}
                    onChange={(value) => handleFieldChange('relieving_factors', value)}
                    placeholder="Repouso, gelo, calor..."
                    type="textarea"
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Histórico */}
            {currentTab === 'history' && (
              <div className="space-y-5">
                {/* Info Box */}
                <InfoBox
                  color="purple"
                  title="Histórico"
                  message="Informações sobre traumas, cirurgias e tratamentos anteriores"
                />

                {/* Previous Traumas */}
                <FormField
                  label="Traumas Anteriores?"
                  value={formData.previous_traumas}
                  onChange={(value) => handleFieldChange('previous_traumas', value)}
                  placeholder="Quedas, acidentes, contusões... descreva quando e o que aconteceu"
                  type="textarea"
                  rows={3}
                />

                {/* Previous Surgeries */}
                <FormField
                  label="Cirurgias Anteriores?"
                  value={formData.previous_surgeries}
                  onChange={(value) => handleFieldChange('previous_surgeries', value)}
                  placeholder="Tipo de cirurgia, data aproximada, complicações..."
                  type="textarea"
                  rows={3}
                />

                {/* Previous Physiotherapy */}
                <FormField
                  label="Fisioterapia Anterior?"
                  value={formData.previous_physiotherapy}
                  onChange={(value) => handleFieldChange('previous_physiotherapy', value)}
                  placeholder="Quando? Quanto tempo? Qual foi o resultado?"
                  type="textarea"
                  rows={3}
                />

                {/* Previous Treatments */}
                <FormField
                  label="Outros Tratamentos?"
                  value={formData.previous_treatments}
                  onChange={(value) => handleFieldChange('previous_treatments', value)}
                  placeholder="Medicamentos, acupuntura, outros..."
                  type="textarea"
                  rows={2}
                />

                {/* Current Medications */}
                <div>
                  <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
                    Medicações Atuais
                  </label>
                  <MedicationSelector
                    pacienteId={String(patientId)}
                    medicacoesAtuais={formData.current_medications.map((m) => m.id)}
                    onMedicationAdd={(med) => {
                      handleFieldChange('current_medications', [
                        ...formData.current_medications,
                        med,
                      ]);
                    }}
                    onMedicationRemove={(medId) => {
                      handleFieldChange(
                        'current_medications',
                        formData.current_medications.filter((m) => m.id !== medId)
                      );
                    }}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: Hábitos e Risco */}
            {currentTab === 'habits' && (
              <div className="space-y-5">
                {/* Info Box */}
                <InfoBox
                  color="amber"
                  title="Fatores de Risco"
                  message="Informações sobre estilo de vida e hábitos"
                />

                {/* Profession */}
                <FormField
                  label="Profissão"
                  value={formData.profession}
                  onChange={(value) => handleFieldChange('profession', value)}
                  placeholder="Ex: Enfermeiro, Dentista, Programador..."
                />

                {/* Physical Activities */}
                <FormField
                  label="Atividades Físicas/Esportes"
                  value={formData.physical_activities}
                  onChange={(value) => handleFieldChange('physical_activities', value)}
                  placeholder="Ex: Musculação, corrida, yoga..."
                />

                {/* Sedentarism Slider */}
                <SedentarismSelector
                  value={formData.sedentarism}
                  onChange={(value) => handleFieldChange('sedentarism', value)}
                />

                {/* Smoking */}
                <BinarySelector
                  label="Tabagismo"
                  value={formData.smoking}
                  onChange={(value) => handleFieldChange('smoking', value)}
                  options={['Não', 'Sim']}
                />

                {/* Alcohol Consumption */}
                <TripleSelector
                  label="Consumo de Álcool"
                  value={formData.alcohol_consumption}
                  onChange={(value) => handleFieldChange('alcohol_consumption', value)}
                  options={[
                    { key: 'none', label: 'Não' },
                    { key: 'occasional', label: 'Ocasional' },
                    { key: 'regular', label: 'Regular' },
                  ]}
                />

                {/* Sleep Quality */}
                <TripleSelector
                  label="Qualidade do Sono"
                  value={formData.sleep_quality}
                  onChange={(value) => handleFieldChange('sleep_quality', value)}
                  options={[
                    { key: 'good', label: 'Boa' },
                    { key: 'fair', label: 'Regular' },
                    { key: 'poor', label: 'Ruim' },
                  ]}
                />
              </div>
            )}

            {/* TAB 4: Exame Físico */}
            {currentTab === 'physical' && (
              <div className="space-y-5">
                {/* Info Box */}
                <InfoBox
                  color="green"
                  title="Avaliação Física"
                  message="Achados do exame físico realizado"
                />

                {/* Range of Motion */}
                <FormField
                  label="Amplitude de Movimento"
                  value={formData.range_of_motion}
                  onChange={(value) => handleFieldChange('range_of_motion', value)}
                  placeholder="Flexão, extensão, abução... descreva limitações"
                  type="textarea"
                  rows={3}
                />

                {/* Specific Tests */}
                <FormField
                  label="Testes Específicos (Neer, Speed, etc)"
                  value={formData.specific_tests}
                  onChange={(value) => handleFieldChange('specific_tests', value)}
                  placeholder="Resultado de testes ortopédicos específicos..."
                  type="textarea"
                  rows={3}
                />

                {/* Inflammation */}
                <BinarySelector
                  label="Presença de Inflamação"
                  value={formData.inflammation}
                  onChange={(value) => handleFieldChange('inflammation', value)}
                  options={['Não', 'Sim']}
                />

                {/* Deformities */}
                <FormField
                  label="Deformidades/Assimetrias"
                  value={formData.deformities}
                  onChange={(value) => handleFieldChange('deformities', value)}
                  placeholder="Descreva qualquer deformidade ou assimetria observada..."
                  type="textarea"
                  rows={3}
                />
              </div>
            )}

            {/* TAB 5: Resumo */}
            {currentTab === 'summary' && (
              <div className="space-y-4">
                {/* Info Box */}
                <InfoBox
                  color="indigo"
                  title="Resumo da Anamnese"
                  message="Revise os dados preenchidos antes de salvar"
                />

                {/* Summary Cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  {formData.chief_complaint && (
                    <SummaryCard
                      icon="🔴"
                      title="Queixa Principal"
                      color="blue"
                      content={formData.chief_complaint}
                      tags={[
                        formData.pain_location && `Localização: ${formData.pain_location}`,
                        formData.pain_intensity !== 5 && `Intensidade: ${formData.pain_intensity}/10`,
                      ].filter(Boolean)}
                    />
                  )}

                  {(formData.previous_traumas ||
                    formData.previous_surgeries ||
                    formData.previous_physiotherapy) && (
                    <SummaryCard
                      icon="📜"
                      title="Histórico"
                      color="purple"
                      items={[
                        formData.previous_traumas && 'Traumas anteriores registrados',
                        formData.previous_surgeries && 'Cirurgias anteriores registradas',
                        formData.previous_physiotherapy && 'Fisioterapia anterior registrada',
                      ].filter(Boolean)}
                    />
                  )}

                  {(formData.profession ||
                    formData.smoking ||
                    formData.alcohol_consumption !== 'none') && (
                    <SummaryCard
                      icon="⚠️"
                      title="Hábitos"
                      color="amber"
                      items={[
                        formData.profession && `Profissão: ${formData.profession}`,
                        formData.smoking && 'Fumante',
                        formData.alcohol_consumption !== 'none' &&
                          `Consumo de álcool: ${
                            formData.alcohol_consumption === 'occasional' ? 'Ocasional' : 'Regular'
                          }`,
                      ].filter(Boolean)}
                    />
                  )}

                  {(formData.range_of_motion ||
                    formData.specific_tests ||
                    formData.inflammation) && (
                    <SummaryCard
                      icon="🔍"
                      title="Exame Físico"
                      color="green"
                      items={[
                        formData.range_of_motion && 'Amplitude de movimento avaliada',
                        formData.specific_tests && 'Testes específicos realizados',
                        formData.inflammation && 'Inflamação presente',
                      ].filter(Boolean)}
                    />
                  )}

                  {formData.current_medications.length > 0 && (
                    <SummaryCard
                      icon="💊"
                      title="Medicações"
                      color="red"
                      items={formData.current_medications.map((med) => med.nome)}
                    />
                  )}
                </div>

                {/* Completion Stats */}
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-50">
                        Preenchimento: {completionPercentage}%
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {completionPercentage === 100
                          ? 'Todos os campos foram preenchidos'
                          : `${100 - completionPercentage}% do formulário ainda pode ser completado`}
                      </p>
                    </div>
                    <div className="text-3xl">
                      {completionPercentage === 100 ? '✅' : completionPercentage >= 75 ? '⚠️' : '❌'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

/**
 * Componentes auxiliares
 */

interface InfoBoxProps {
  color: 'blue' | 'purple' | 'amber' | 'green' | 'indigo';
  title: string;
  message: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ color, title, message }) => {
  const colorMap = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    purple:
      'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
    amber:
      'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    green:
      'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    indigo:
      'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300',
  };

  return (
    <div className={`p-4 border rounded-lg ${colorMap[color]}`}>
      <p className="text-sm">
        <span className="font-semibold">{title}:</span> {message}
      </p>
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
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
      )}
    </div>
  );
};

interface LocationButtonProps {
  location: string;
  isSelected: boolean;
  onClick: () => void;
}

const LocationButton: React.FC<LocationButtonProps> = ({ location, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg font-medium text-sm transition-all border-2 ${
        isSelected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-400'
      }`}
    >
      {location}
    </button>
  );
};

interface PainIntensitySelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const PainIntensitySelector: React.FC<PainIntensitySelectorProps> = ({ value, onChange }) => {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
        Intensidade da Dor — <span className="text-blue-600 dark:text-blue-400">{value}/10</span>
      </label>
      <div className="flex gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={`flex-1 h-10 rounded-lg text-xs font-bold text-white transition-all ${PAIN_COLORS[i]} ${
              value === i
                ? 'ring-2 ring-slate-900 dark:ring-slate-50 scale-110'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
};

interface SedentarismSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const SedentarismSelector: React.FC<SedentarismSelectorProps> = ({ value, onChange }) => {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
        Nível de Sedentarismo — <span className="text-blue-600 dark:text-blue-400">{value}/10</span>
      </label>
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
      />
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
        <span>Muito Ativo</span>
        <span>Muito Sedentário</span>
      </div>
    </div>
  );
};

interface BinarySelectorProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  options: [string, string];
}

const BinarySelector: React.FC<BinarySelectorProps> = ({ label, value, onChange, options }) => {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
        {label}
      </label>
      <div className="flex gap-3">
        {options.map((opt, idx) => (
          <button
            key={opt}
            onClick={() => onChange(idx === 1)}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all border-2 ${
              (idx === 1) === value
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};

interface TripleSelectorOption {
  key: string;
  label: string;
}

interface TripleSelectorProps {
  label: string;
  value: string;
  onChange: (value: any) => void;
  options: TripleSelectorOption[];
}

const TripleSelector: React.FC<TripleSelectorProps> = ({ label, value, onChange, options }) => {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-900 dark:text-slate-50 mb-3">
        {label}
      </label>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all border-2 ${
              value === opt.key
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface SummaryCardProps {
  icon: string;
  title: string;
  color: 'blue' | 'purple' | 'amber' | 'green' | 'red';
  content?: string;
  items?: string[];
  tags?: (string | false)[];
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  icon,
  title,
  color,
  content,
  items,
  tags,
}) => {
  const colorMap = {
    blue: 'from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
    purple:
      'from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100',
    amber:
      'from-amber-50 to-amber-100 dark:from-amber-950/50 dark:to-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100',
    green:
      'from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
    red: 'from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
  };

  return (
    <div className={`p-4 bg-gradient-to-br ${colorMap[color]} border rounded-lg`}>
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <span className="text-lg">{icon}</span> {title}
      </h3>
      {content && <p className="text-sm mb-3">{content}</p>}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag, idx) => (
            <span key={idx} className="inline-block px-2 py-1 bg-opacity-50 bg-slate-600 rounded text-xs font-semibold">
              {tag}
            </span>
          ))}
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="text-sm space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>✓ {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
