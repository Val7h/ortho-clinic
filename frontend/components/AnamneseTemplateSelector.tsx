'use client';

import React, { useState } from 'react';
import { Check, ArrowRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui';

type TemplateType = 'first_consultation' | 'follow_up';

export interface AnamneseTemplateSelectorProps {
  patientName: string;
  onSelect: (templateType: TemplateType) => void;
}

export const AnamneseTemplateSelector: React.FC<AnamneseTemplateSelectorProps> = ({
  patientName,
  onSelect,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);

  const templates = [
    {
      id: 'first_consultation' as const,
      title: 'Primeira Consulta',
      description: 'Anamnese completa para novo paciente com histórico detalhado e exame físico',
      icon: '🏥',
      color: 'from-blue-500 to-cyan-600',
      borderColor: 'border-blue-300 dark:border-blue-700',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      textColor: 'text-blue-900 dark:text-blue-100',
      badgeColor: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
      features: [
        'Queixa principal e localização',
        'Histórico de traumas',
        'Cirurgias anteriores',
        'Hábitos e fatores de risco',
        'Exame físico detalhado',
        'Resumo estruturado',
      ],
    },
    {
      id: 'follow_up' as const,
      title: 'Retorno',
      description: 'Anamnese simplificada para acompanhamento e evolução do tratamento',
      icon: '📋',
      color: 'from-emerald-500 to-teal-600',
      borderColor: 'border-emerald-300 dark:border-emerald-700',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
      textColor: 'text-emerald-900 dark:text-emerald-100',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200',
      features: [
        'Evolução desde última consulta',
        'Comparação de sintomas',
        'Aderência ao tratamento',
        'Novos sintomas aparecidos',
        'Próximos passos',
      ],
    },
  ];

  const handleSelect = (templateId: TemplateType) => {
    setSelectedTemplate(templateId);
    setTimeout(() => {
      onSelect(templateId);
    }, 300);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">
          Nova Anamnese
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Paciente: <span className="font-semibold text-slate-900 dark:text-slate-50">{patientName}</span>
        </p>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
        <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Dica
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Escolha o tipo de anamnese apropriado para o contexto da consulta. Você pode salvar como rascunho e continuar depois.
          </p>
        </div>
      </div>

      {/* Template Cards Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => handleSelect(template.id)}
            className={`group relative overflow-hidden rounded-2xl border-2 transition-all duration-300 transform ${
              selectedTemplate === template.id
                ? `border-${template.color.split(' ')[0].split('-')[0]}-500 scale-105 shadow-xl`
                : `${template.borderColor} hover:border-opacity-100 hover:scale-102 hover:shadow-lg`
            }`}
          >
            {/* Background Gradient */}
            <div
              className={`absolute inset-0 opacity-10 dark:opacity-5 bg-gradient-to-br ${template.color} group-hover:opacity-20 dark:group-hover:opacity-10 transition-all duration-300`}
            />

            {/* Content */}
            <div className={`relative p-8 space-y-6 ${template.bgColor} border-b-2 border-opacity-30 border-slate-300 dark:border-slate-600`}>
              {/* Icon & Title */}
              <div className="space-y-3">
                <div className="text-5xl">{template.icon}</div>
                <h2 className={`text-2xl font-bold text-left ${template.textColor}`}>
                  {template.title}
                </h2>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-700 dark:text-slate-300 text-left">
                {template.description}
              </p>

              {/* Features List */}
              <div className="space-y-2.5">
                {template.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <div
                className={`flex items-center justify-between pt-4 border-t-2 border-opacity-20 border-slate-900 dark:border-slate-50 transition-opacity duration-300 ${
                  selectedTemplate === template.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <span className={`text-sm font-semibold ${template.textColor}`}>
                  {selectedTemplate === template.id ? 'Selecionado' : 'Selecionar'}
                </span>
                <ArrowRight className={`w-4 h-4 ${template.textColor}`} />
              </div>
            </div>

            {/* Selection Indicator */}
            {selectedTemplate === template.id && (
              <div className={`h-1 bg-gradient-to-r ${template.color}`} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
