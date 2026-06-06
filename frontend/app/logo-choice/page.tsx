'use client';

import { useState } from 'react';

export default function LogoChoice() {
  const [selected, setSelected] = useState<number | null>(null);

  const logos = [
    {
      id: 1,
      name: 'ASCENT MODERN',
      tagline: 'Crescimento & Sofisticação',
      description: 'Linhas diagonais ascendentes convergentes - pura geometria profissional',
      colors: 'Azul Profundo + Cinza + Branco',
      bestFor: 'Website premium, cartão executivo, fachada',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <linearGradient id="ascent-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1B4965" />
              <stop offset="100%" stopColor="#1B4965" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" fill="#F8F9FA" rx="20" />

          {/* Linhas ascendentes */}
          <line x1="30" y1="90" x2="60" y2="30" stroke="#1B4965" strokeWidth="5" strokeLinecap="round" />
          <line x1="45" y1="95" x2="75" y2="25" stroke="#1B4965" strokeWidth="5" strokeLinecap="round" opacity="0.8" />
          <line x1="60" y1="98" x2="90" y2="20" stroke="#1B4965" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
        </svg>
      )
    },
    {
      id: 2,
      name: 'HELIX EVOLUTION',
      tagline: 'Inovação & Transformação',
      description: 'Espiral ascendente abstrata - DNA e movimento moderno',
      colors: 'Verde Esmeralda + Cinza Prata + Branco',
      bestFor: 'Comunicações clínicas, prescrições médicas, material científico',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="120" fill="#F8F9FA" rx="20" />

          {/* Espiral */}
          <path
            d="M 60 100 Q 70 85 65 70 Q 55 55 70 45 Q 85 35 75 20"
            stroke="#2D6A4F"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 60 100 Q 50 85 55 70 Q 65 55 50 45 Q 35 35 45 20"
            stroke="#2D6A4F"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
        </svg>
      )
    },
    {
      id: 3,
      name: 'BRIDGE MINIMAL',
      tagline: 'Equilíbrio & Conexão',
      description: 'Dois arcos que se tocam - elegância atemporal e simetria perfeita',
      colors: 'Cinza Escuro + Coral Suave + Branco',
      bestFor: 'Redes sociais, TV/rádio, identidade corporativa completa',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="120" fill="#F8F9FA" rx="20" />

          {/* Arco esquerdo */}
          <path
            d="M 35 70 Q 35 40 60 40"
            stroke="#3C3C3C"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />

          {/* Arco direito */}
          <path
            d="M 60 40 Q 85 40 85 70"
            stroke="#3C3C3C"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />

          {/* Ponto central */}
          <circle cx="60" cy="40" r="3" fill="#E8927D" />
        </svg>
      )
    },
    {
      id: 4,
      name: 'CORE LATTICE',
      tagline: 'Precisão & Expertise',
      description: 'Estrutura reticulada geométrica - integridade e inovação técnica',
      colors: 'Azul-Petróleo + Dourado Suave + Branco',
      bestFor: 'Pesquisa clínica, material técnico, parcerias B2B',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="120" fill="#F8F9FA" rx="20" />

          {/* Estrutura reticulada */}
          <circle cx="40" cy="40" r="4" fill="#0F4C75" />
          <circle cx="60" cy="40" r="4" fill="#0F4C75" />
          <circle cx="80" cy="40" r="4" fill="#0F4C75" />

          <circle cx="40" cy="60" r="4" fill="#0F4C75" />
          <circle cx="60" cy="60" r="5" fill="#C4A747" />
          <circle cx="80" cy="60" r="4" fill="#0F4C75" />

          <circle cx="40" cy="80" r="4" fill="#0F4C75" />
          <circle cx="60" cy="80" r="4" fill="#0F4C75" />
          <circle cx="80" cy="80" r="4" fill="#0F4C75" />

          {/* Conexões */}
          <line x1="40" y1="40" x2="60" y2="40" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="60" y1="40" x2="80" y2="40" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />

          <line x1="40" y1="40" x2="40" y2="60" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="60" y1="40" x2="60" y2="60" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="80" y1="40" x2="80" y2="60" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />

          <line x1="40" y1="60" x2="60" y2="60" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="60" y1="60" x2="80" y2="60" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />

          <line x1="40" y1="60" x2="40" y2="80" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="60" y1="60" x2="60" y2="80" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="80" y1="60" x2="80" y2="80" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />

          <line x1="40" y1="80" x2="60" y2="80" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
          <line x1="60" y1="80" x2="80" y2="80" stroke="#0F4C75" strokeWidth="1.5" opacity="0.5" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            🎨 Escolha seu Logo
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            Qual design representa melhor a OrthoClinic?
          </p>
          <div className="w-20 h-1 bg-blue-500 mx-auto mt-6"></div>
        </div>

        {/* Grid de Logos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {logos.map((logo) => (
            <div
              key={logo.id}
              onClick={() => setSelected(logo.id)}
              className={`cursor-pointer rounded-2xl p-8 transition-all duration-300 ${
                selected === logo.id
                  ? 'ring-4 ring-blue-500 bg-white shadow-2xl scale-105'
                  : 'bg-white shadow-lg hover:shadow-xl hover:scale-102 border-2 border-transparent'
              }`}
            >
              {/* Logo Preview */}
              <div className="h-56 mb-6 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
                {logo.svg}
              </div>

              {/* Conteúdo */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-gray-900">
                    Opção {logo.id}
                  </h3>
                  {selected === logo.id && (
                    <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                      ✓ Selecionado
                    </span>
                  )}
                </div>

                <h4 className="text-blue-600 font-bold text-lg mb-2">
                  {logo.name}
                </h4>

                <p className="text-gray-500 text-sm font-semibold mb-3 italic">
                  "{logo.tagline}"
                </p>

                <p className="text-gray-700 mb-4 leading-relaxed">
                  {logo.description}
                </p>

                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-bold">Cores:</span> {logo.colors}
                  </p>
                </div>

                <p className="text-xs text-gray-500">
                  <span className="font-semibold">Ideal para:</span> {logo.bestFor}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Selection Confirmation */}
        {selected && (
          <div className="fixed bottom-8 right-8 bg-gradient-to-r from-blue-500 to-blue-600 text-white p-8 rounded-2xl shadow-2xl max-w-sm">
            <div className="mb-4">
              <h3 className="text-lg font-bold mb-1">
                ✓ Logo Selecionado
              </h3>
              <p className="text-blue-100 text-sm">
                {logos.find(l => l.id === selected)?.name}
              </p>
            </div>

            <button
              onClick={() => {
                // Aqui você pode fazer a ação de confirmar
                alert(
                  `✓ Logo ${selected} - ${logos.find(l => l.id === selected)?.name} será implementado!`
                );
              }}
              className="w-full bg-white text-blue-600 font-bold py-3 px-6 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Confirmar Escolha
            </button>
          </div>
        )}

        {/* Instructions */}
        {!selected && (
          <div className="text-center text-gray-500">
            <p className="text-lg">👆 Clique em uma opção para selecionar</p>
          </div>
        )}
      </div>
    </div>
  );
}
