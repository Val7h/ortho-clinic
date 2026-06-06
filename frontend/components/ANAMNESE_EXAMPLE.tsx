'use client';

/**
 * Exemplo de Integração dos Componentes de Anamnese
 *
 * Este arquivo demonstra como utilizar os componentes AnamneseTemplateSelector,
 * AnamneseFirstConsultation e AnamneseFollowUp em um fluxo completo.
 */

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { AnamneseTemplateSelector } from '@/components/AnamneseTemplateSelector';
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';
import type {
  AnamneseFirstConsultationData,
  AnamneseFollowUpData,
  TemplateType,
} from '@/types/anamnese';

interface AnamneseExampleProps {
  patientId: number;
  patientName: string;
  // Dados da última consulta (para retorno)
  lastAnamneseData?: {
    date: string;
    painIntensity: number;
  };
}

/**
 * Componente Exemplo: Fluxo Completo de Anamnese
 *
 * 1. Mostra seletor de template
 * 2. Abre formulário apropriado baseado na seleção
 * 3. Salva dados na API
 * 4. Fornece feedback ao usuário
 */
export const AnamneseExample: React.FC<AnamneseExampleProps> = ({
  patientId,
  patientName,
  lastAnamneseData,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handler para salvar anamnese de primeira consulta
   */
  const handleSaveFirstConsultation = async (data: AnamneseFirstConsultationData) => {
    setIsLoading(true);
    try {
      // Exemplo: Enviar para API
      const response = await fetch('/api/anamneses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patient_id: patientId,
          template_type: 'first_consultation',
          status: 'completed',
          dados: data,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar anamnese');
      }

      const result = await response.json();
      console.log('Anamnese salva:', result);

      toast.success('Anamnese de primeira consulta salva com sucesso!');
      // Reset template selection
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar anamnese');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handler para salvar anamnese de retorno
   */
  const handleSaveFollowUp = async (data: AnamneseFollowUpData) => {
    setIsLoading(true);
    try {
      // Exemplo: Enviar para API
      const response = await fetch('/api/anamneses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patient_id: patientId,
          template_type: 'follow_up',
          status: 'completed',
          dados: data,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar anamnese');
      }

      const result = await response.json();
      console.log('Anamnese de retorno salva:', result);

      toast.success('Anamnese de retorno salva com sucesso!');
      // Reset template selection
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar anamnese de retorno');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handler para seleção de template
   */
  const handleSelectTemplate = (templateType: TemplateType) => {
    setSelectedTemplate(templateType);
  };

  // Se nenhum template foi selecionado, mostra o seletor
  if (!selectedTemplate) {
    return (
      <AnamneseTemplateSelector patientName={patientName} onSelect={handleSelectTemplate} />
    );
  }

  // Se foi selecionado "primeira_consulta", mostra o formulário
  if (selectedTemplate === 'first_consultation') {
    return (
      <AnamneseFirstConsultation
        patientId={patientId}
        patientName={patientName}
        onSave={handleSaveFirstConsultation}
      />
    );
  }

  // Se foi selecionado "retorno", mostra o formulário de retorno
  if (selectedTemplate === 'follow_up') {
    return (
      <AnamneseFollowUp
        patientId={patientId}
        patientName={patientName}
        lastConsultationDate={lastAnamneseData?.date}
        lastPainIntensity={lastAnamneseData?.painIntensity}
        onSave={handleSaveFollowUp}
      />
    );
  }

  return null;
};

/**
 * Exemplo 2: Uso Direto dos Componentes (sem seletor)
 *
 * Use este padrão se você já sabe qual tipo de anamnese quer exibir
 */
export const AnamneseFirstConsultationDirectExample: React.FC<{
  patientId: number;
  patientName: string;
}> = ({ patientId, patientName }) => {
  const handleSave = async (data: AnamneseFirstConsultationData) => {
    try {
      console.log('Salvando dados:', data);
      // Sua lógica de salvamento aqui
    } catch (error) {
      console.error('Erro:', error);
    }
  };

  return (
    <AnamneseFirstConsultation patientId={patientId} patientName={patientName} onSave={handleSave} />
  );
};

/**
 * Exemplo 3: Uso com Controle Externo de Estado
 *
 * Use este padrão se precisa sincronizar o estado de anamnese
 * com outros componentes da sua aplicação
 */
export const AnamneseControlledExample: React.FC<{
  patientId: number;
  patientName: string;
  onAnamneseSaved?: (data: AnamneseFirstConsultationData | AnamneseFollowUpData) => void;
}> = ({ patientId, patientName, onAnamneseSaved }) => {
  const [currentAnamnese, setCurrentAnamnese] = useState<
    AnamneseFirstConsultationData | AnamneseFollowUpData | null
  >(null);

  const handleSaveFirstConsultation = (data: AnamneseFirstConsultationData) => {
    setCurrentAnamnese(data);
    onAnamneseSaved?.(data);
  };

  const handleSaveFollowUp = (data: AnamneseFollowUpData) => {
    setCurrentAnamnese(data);
    onAnamneseSaved?.(data);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Estado atual: {currentAnamnese ? 'Anamnese preenchida' : 'Aguardando preenchimento'}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <AnamneseFirstConsultation
          patientId={patientId}
          patientName={patientName}
          onSave={handleSaveFirstConsultation}
        />
        <AnamneseFollowUp
          patientId={patientId}
          patientName={patientName}
          onSave={handleSaveFollowUp}
        />
      </div>

      {currentAnamnese && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <h3 className="font-bold text-emerald-900 dark:text-emerald-100 mb-2">
            Dados da Anamnese:
          </h3>
          <pre className="text-xs text-emerald-800 dark:text-emerald-200 overflow-auto max-h-64">
            {JSON.stringify(currentAnamnese, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/**
 * Exemplo 4: Integração em Página de Paciente
 *
 * Uso típico em um dashboard de paciente
 */
export const PatientAnamneseSection: React.FC<{
  patientId: number;
  patientName: string;
  patientAge?: number;
}> = ({ patientId, patientName, patientAge }) => {
  const [anamneseList, setAnamneseList] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Buscar histórico de anamnezes do paciente
  React.useEffect(() => {
    const fetchAnamneses = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/pacientes/${patientId}/anamneses`);
        if (response.ok) {
          const data = await response.json();
          setAnamneseList(data);
        }
      } catch (error) {
        console.error('Erro ao buscar anamnezes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnamneses();
  }, [patientId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-1">
          Anamnezes de {patientName}
        </h2>
        {patientAge && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Paciente - {patientAge} anos
          </p>
        )}
      </div>

      {/* Histórico de Anamnezes */}
      {anamneseList.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-slate-50 mb-3">
            Anamnezes Anteriores
          </h3>
          <div className="space-y-2">
            {anamneseList.map((anamnese, idx) => (
              <div
                key={idx}
                className="p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-sm"
              >
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {anamnese.template_type === 'first_consultation'
                    ? 'Primeira Consulta'
                    : 'Retorno'}{' '}
                  - {new Date(anamnese.created_at).toLocaleDateString('pt-BR')}
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Status: {anamnese.status}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novo Preenchimento */}
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <h3 className="font-bold text-blue-900 dark:text-blue-100 mb-4">
          Nova Anamnese
        </h3>
        <AnamneseExample
          patientId={patientId}
          patientName={patientName}
          lastAnamneseData={
            anamneseList.length > 0
              ? {
                  date: new Date(anamneseList[0].created_at).toLocaleDateString('pt-BR'),
                  painIntensity: anamneseList[0].dados.pain_intensity_last || 5,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
};
