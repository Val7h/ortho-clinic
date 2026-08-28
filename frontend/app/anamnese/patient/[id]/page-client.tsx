'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AnamneseTemplateSelector } from '@/components/AnamneseTemplateSelector';
import { AnamneseFirstConsultation } from '@/components/AnamneseFirstConsultation';
import { AnamneseFollowUp } from '@/components/AnamneseFollowUp';
import { Card, Button } from '@/components/ui';
import type { AnamneseFirstConsultationData, AnamneseFollowUpData } from '@/types/anamnese';
import {
  ArrowLeft,
  Plus,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { resolveDynamicParam } from '@/lib/utils';
import { hojeISO } from "@/lib/utils";

interface PatientData {
  id: number;
  name: string;
  email: string;
  phone: string;
  birth_date: string;
}

interface AnamneseHistory {
  id: number;
  template_type: 'first_consultation' | 'follow_up';
  status: 'draft' | 'completed' | 'signed';
  created_at: string;
  dados: any;
}

export default function PatientAnamnesePage() {
  const params = useParams();
  const id = resolveDynamicParam(params?.id as string);
  if (!id) return <div>Paciente não encontrado</div>;
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<'first_consultation' | 'follow_up' | null>(null);
  const [anamneseHistory, setAnamneseHistory] = useState<AnamneseHistory[]>([]);

  useEffect(() => {
    const loadPatientData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/patients/${id}`);
        if (response.ok) {
          const data = await response.json();
          setPatient(data);
        } else {
          toast.error('Paciente não encontrado');
        }

        const historyResponse = await fetch(`/api/anamneses?patient_id=${id}`);
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          setAnamneseHistory(history);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar informações do paciente');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadPatientData();
    }
  }, [id]);

  const handleSaveFirstConsultation = async (data: AnamneseFirstConsultationData) => {
    try {
      const response = await fetch('/api/anamneses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: parseInt(id),
          ...data,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnamneseHistory([result, ...anamneseHistory]);
        setSelectedTemplate(null);
        toast.success('Primeira consulta registrada com sucesso!');
      } else {
        throw new Error('Erro ao salvar');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar anamnese');
    }
  };

  const handleSaveFollowUp = async (data: AnamneseFollowUpData) => {
    try {
      const response = await fetch('/api/anamneses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: parseInt(id),
          ...data,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnamneseHistory([result, ...anamneseHistory]);
        setSelectedTemplate(null);
        toast.success('Retorno registrado com sucesso!');
      } else {
        throw new Error('Erro ao salvar');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar anamnese');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300">Paciente não encontrado</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href={`/patients/${id}`}>
            <Button variant="tertiary" icon={<ArrowLeft className="w-4 h-4" />}>
              Voltar ao Paciente
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Paciente Info */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
            {patient.name}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Prontuário ID: {patient.id}</p>
          <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Email</p>
              <p className="font-medium text-slate-900 dark:text-slate-50">{patient.email}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Telefone</p>
              <p className="font-medium text-slate-900 dark:text-slate-50">{patient.phone}</p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Data de Nascimento</p>
              <p className="font-medium text-slate-900 dark:text-slate-50">
                {new Date(patient.birth_date).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        {/* Template Selector ou Formulário */}
        {!selectedTemplate ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <Plus className="w-6 h-6" />
                  Nova Anamnese
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                  Escolha o tipo de anamnese para este atendimento
                </p>
              </div>

              <AnamneseTemplateSelector
                patientName={patient.name}
                onSelect={(template) => setSelectedTemplate(template)}
              />
            </div>
          </div>
        ) : selectedTemplate === 'first_consultation' ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <AnamneseFirstConsultation
              patientId={patient.id}
              patientName={patient.name}
              onSave={handleSaveFirstConsultation}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <AnamneseFollowUp
              patientId={patient.id}
              patientName={patient.name}
              lastConsultationDate={
                anamneseHistory.length > 0
                  ? hojeISO(new Date(anamneseHistory[0].created_at))
                  : undefined
              }
              lastPainIntensity={
                anamneseHistory.length > 0 &&
                anamneseHistory[0].dados.pain_intensity
                  ? anamneseHistory[0].dados.pain_intensity
                  : 5
              }
              onSave={handleSaveFollowUp}
            />
          </div>
        )}

        {/* Histórico de Anamneses */}
        {anamneseHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6" />
              Histórico de Anamneses ({anamneseHistory.length})
            </h2>

            <div className="space-y-4">
              {anamneseHistory.map((anamnese) => (
                <div
                  key={anamnese.id}
                  className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {anamnese.template_type === 'first_consultation' ? (
                            <FileText className="w-5 h-5 text-blue-500" />
                          ) : (
                            <FileText className="w-5 h-5 text-emerald-500" />
                          )}
                          <span className="font-semibold text-slate-900 dark:text-slate-50">
                            {anamnese.template_type === 'first_consultation'
                              ? 'Primeira Consulta'
                              : 'Retorno'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {anamnese.status === 'completed' ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                Completo
                              </span>
                            </>
                          ) : anamnese.status === 'signed' ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-blue-500" />
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                Assinado
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                Rascunho
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {new Date(anamnese.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>

                      {anamnese.template_type === 'first_consultation' &&
                        anamnese.dados.chief_complaint && (
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 line-clamp-2">
                            {anamnese.dados.chief_complaint}
                          </p>
                        )}

                      {anamnese.template_type === 'follow_up' && (
                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 space-y-1">
                          <p>
                            Dor: {anamnese.dados.pain_intensity_last}/10 →{' '}
                            {anamnese.dados.pain_intensity_current}/10
                          </p>
                          <p>Adesão: {anamnese.dados.treatment_adherence}</p>
                        </div>
                      )}
                    </div>

                    <Button variant="secondary" size="sm">
                      Visualizar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {anamneseHistory.length === 0 && selectedTemplate === null && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma anamnese registrada ainda</p>
            <p className="text-xs mt-1">
              Comece criando uma nova anamnese acima
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
