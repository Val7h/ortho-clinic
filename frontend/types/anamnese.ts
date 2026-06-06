/**
 * Types e Interfaces para o Sistema de Anamnese
 * Usados em AnamneseFirstConsultation e AnamneseFollowUp
 */

/**
 * Template type: Tipo de anamnese
 */
export type TemplateType = 'first_consultation' | 'follow_up';

/**
 * Status da anamnese
 */
export type AnamneseStatus = 'draft' | 'completed' | 'signed';

/**
 * Localização da dor
 */
export type PainLocation = 'Ombro' | 'Cotovelo' | 'Punho' | 'Coluna' | 'Quadril' | 'Joelho' | 'Tornozelo';

/**
 * Nível de consumo de álcool
 */
export type AlcoholConsumption = 'none' | 'occasional' | 'regular';

/**
 * Qualidade do sono
 */
export type SleepQuality = 'good' | 'fair' | 'poor';

/**
 * Nível de adesão ao tratamento
 */
export type TreatmentAdherence = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Medicação selecionada
 */
export interface Medicacao {
  id: string;
  nome: string;
  dosagem: string;
  via: 'oral' | 'injetável' | 'tópica' | 'intravenosa';
  fabricante: string;
  posologia?: string;
  duracao?: string;
  interacoes?: Array<{
    medicacao: string;
    severidade: 'leve' | 'moderada' | 'grave';
    descricao: string;
  }>;
  temContraindicacao?: boolean;
}

/**
 * Dados da Anamnese de Primeira Consulta
 */
export interface AnamneseFirstConsultationData {
  template_type: 'first_consultation';
  status: AnamneseStatus;

  // TAB 1: Queixa Principal
  chief_complaint: string;
  pain_location: string;
  symptom_duration: string;
  pain_intensity: number; // 0-10
  aggravating_factors: string;
  relieving_factors: string;

  // TAB 2: Histórico
  previous_traumas: string;
  previous_surgeries: string;
  previous_physiotherapy: string;
  previous_treatments: string;
  current_medications: Medicacao[];

  // TAB 3: Hábitos e Risco
  profession: string;
  physical_activities: string;
  sedentarism: number; // 1-10
  smoking: boolean;
  alcohol_consumption: AlcoholConsumption;
  sleep_quality: SleepQuality;

  // TAB 4: Exame Físico
  range_of_motion: string;
  specific_tests: string;
  inflammation: boolean;
  deformities: string;

  // Metadados
  created_at?: string;
}

/**
 * Dados da Anamnese de Retorno
 */
export interface AnamneseFollowUpData {
  template_type: 'follow_up';
  status: AnamneseStatus;

  last_consultation_date?: string;
  pain_intensity_last: number; // 0-10
  pain_intensity_current: number; // 0-10
  evolution_summary: string;
  new_symptoms: string;
  treatment_adherence: TreatmentAdherence;
  treatment_response: string;
  current_limitations: string;
  next_steps: string;
  additional_observations: string;

  // Metadados
  created_at?: string;
}

/**
 * Type union de dados de anamnese
 */
export type AnamneseData = AnamneseFirstConsultationData | AnamneseFollowUpData;

/**
 * Resposta da API ao criar/atualizar anamnese
 */
export interface AnamneseResponse {
  id: number;
  patient_id: number;
  template_type: TemplateType;
  status: AnamneseStatus;
  dados: AnamneseData;
  created_at: string;
  updated_at: string;
  created_by?: number;
}

/**
 * Parâmetros para criar anamnese
 */
export interface CreateAnamneseParams {
  patient_id: number;
  template_type: TemplateType;
  status: AnamneseStatus;
  dados: AnamneseData;
}

/**
 * Props do componente AnamneseTemplateSelector
 */
export interface AnamneseTemplateSelectorProps {
  patientName: string;
  onSelect: (templateType: TemplateType) => void;
}

/**
 * Props do componente AnamneseFirstConsultation
 */
export interface AnamneseFirstConsultationProps {
  patientId: number;
  patientName: string;
  onSave?: (data: AnamneseFirstConsultationData) => void;
}

/**
 * Props do componente AnamneseFollowUp
 */
export interface AnamneseFollowUpProps {
  patientId: number;
  patientName: string;
  lastConsultationDate?: string;
  lastPainIntensity?: number;
  onSave?: (data: AnamneseFollowUpData) => void;
}

/**
 * Histórico de anamnese de um paciente
 */
export interface PatientAnamneseHistory {
  id: number;
  patient_id: number;
  template_type: TemplateType;
  status: AnamneseStatus;
  created_at: string;
  created_by?: number;
  dados: AnamneseData;
}

/**
 * Metadados de anamnese para listagem
 */
export interface AnamneseListItem {
  id: number;
  patient_id: number;
  template_type: TemplateType;
  status: AnamneseStatus;
  created_at: string;
  chief_complaint?: string; // Para first_consultation
  pain_intensity_last?: number; // Para follow_up
  pain_intensity_current?: number; // Para follow_up
}

/**
 * Estatísticas de anamnese
 */
export interface AnamneseStats {
  total: number;
  first_consultations: number;
  follow_ups: number;
  completed: number;
  drafts: number;
  signed: number;
  last_anamnese_date?: string;
}

/**
 * Pain colors mapping
 */
export const PAIN_COLORS = [
  'bg-green-500',
  'bg-green-400',
  'bg-lime-400',
  'bg-yellow-300',
  'bg-yellow-400',
  'bg-orange-300',
  'bg-orange-400',
  'bg-orange-500',
  'bg-red-400',
  'bg-red-500',
  'bg-red-600',
] as const;

/**
 * Pain locations constants
 */
export const PAIN_LOCATIONS = [
  'Ombro',
  'Cotovelo',
  'Punho',
  'Coluna',
  'Quadril',
  'Joelho',
  'Tornozelo',
] as const;

/**
 * Utilidades para conversão de tipos
 */
export namespace AnamneseUtils {
  /**
   * Calcula melhora/piora da dor em porcentagem
   */
  export function calculatePainImprovement(
    painBefore: number,
    painAfter: number
  ): number {
    if (painBefore === 0) return 0;
    return Math.round(((painBefore - painAfter) / painBefore) * 100);
  }

  /**
   * Converte sleep_quality para label
   */
  export function getSleepQualityLabel(quality: SleepQuality): string {
    const labels: Record<SleepQuality, string> = {
      good: 'Boa',
      fair: 'Regular',
      poor: 'Ruim',
    };
    return labels[quality];
  }

  /**
   * Converte alcohol_consumption para label
   */
  export function getAlcoholConsumptionLabel(consumption: AlcoholConsumption): string {
    const labels: Record<AlcoholConsumption, string> = {
      none: 'Não',
      occasional: 'Ocasional',
      regular: 'Regular',
    };
    return labels[consumption];
  }

  /**
   * Converte treatment_adherence para label
   */
  export function getTreatmentAdherenceLabel(adherence: TreatmentAdherence): string {
    const labels: Record<TreatmentAdherence, string> = {
      excellent: 'Excelente (100%)',
      good: 'Boa (75%)',
      fair: 'Regular (50%)',
      poor: 'Fraca (<50%)',
    };
    return labels[adherence];
  }

  /**
   * Calcula percentual de preenchimento
   */
  export function calculateCompletionPercentage(data: AnamneseData): number {
    const keys = Object.keys(data).filter(
      (k) => !['template_type', 'status', 'created_at'].includes(k)
    );

    const filled = keys.filter((k) => {
      const value = (data as any)[k];
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return true;
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.length > 0;
      return false;
    });

    return Math.round((filled.length / keys.length) * 100);
  }

  /**
   * Valida se anamnese está completa
   */
  export function isComplete(data: AnamneseData): boolean {
    if (data.template_type === 'first_consultation') {
      return (data as AnamneseFirstConsultationData).chief_complaint.trim().length > 0;
    } else {
      return (data as AnamneseFollowUpData).evolution_summary.trim().length > 0;
    }
  }
}
