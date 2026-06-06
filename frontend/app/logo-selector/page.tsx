'use client';

import { useState } from 'react';

export default function LogoSelector() {
  const [selected, setSelected] = useState<number | null>(null);

  const logos = [
    {
      id: 1,
      name: 'The Movement',
      description: 'Figura humana em movimento dinâmico',
      colors: 'Azul + Verde limão + Branco',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" fill="url(#grad1)" rx="20" />

          {/* Cabeça */}
          <circle cx="60" cy="25" r="8" fill="white" />

          {/* Corpo */}
          <line x1="60" y1="33" x2="60" y2="55" stroke="white" strokeWidth="3" />

          {/* Braços em movimento */}
          <line x1="60" y1="40" x2="35" y2="30" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="40" x2="85" y2="50" stroke="white" strokeWidth="3" strokeLinecap="round" />

          {/* Pernas dinâmicas */}
          <line x1="60" y1="55" x2="45" y2="85" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="55" x2="75" y2="90" stroke="white" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    },
    {
      id: 2,
      name: 'Hand of Care',
      description: 'Mão protegendo uma articulação',
      colors: 'Verde médico + Cinza + Tons quentes',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" fill="url(#grad2)" rx="20" />

          {/* Mão */}
          <ellipse cx="55" cy="70" rx="20" ry="28" fill="white" opacity="0.9" />

          {/* Dedos */}
          <circle cx="30" cy="50" r="5" fill="white" />
          <circle cx="40" cy="40" r="5" fill="white" />
          <circle cx="55" cy="35" r="5" fill="white" />
          <circle cx="70" cy="40" r="5" fill="white" />
          <circle cx="80" cy="55" r="5" fill="white" />

          {/* Articulação (círculos) */}
          <circle cx="60" cy="75" r="10" fill="white" />
          <circle cx="60" cy="75" r="5" fill="#059669" />

          {/* Linhas de proteção */}
          <path d="M 30 50 Q 50 60 60 75" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
          <path d="M 80 55 Q 70 65 60 75" stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
        </svg>
      )
    },
    {
      id: 3,
      name: 'Structural Harmony',
      description: 'Estrutura geométrica de hexágonos',
      colors: 'Azul corporativo + Laranja + Cinza',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e40af" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" fill="url(#grad3)" rx="20" />

          {/* Hexágonos */}
          <circle cx="60" cy="60" r="8" fill="white" />
          <circle cx="45" cy="50" r="6" fill="white" opacity="0.8" />
          <circle cx="75" cy="50" r="6" fill="white" opacity="0.8" />
          <circle cx="40" cy="70" r="6" fill="white" opacity="0.8" />
          <circle cx="80" cy="70" r="6" fill="white" opacity="0.8" />
          <circle cx="55" cy="85" r="6" fill="white" opacity="0.8" />
          <circle cx="65" cy="85" r="6" fill="white" opacity="0.8" />

          {/* Conexões */}
          <line x1="60" y1="60" x2="45" y2="50" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <line x1="60" y1="60" x2="75" y2="50" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <line x1="60" y1="60" x2="40" y2="70" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <line x1="60" y1="60" x2="80" y2="70" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <line x1="60" y1="60" x2="55" y2="85" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <line x1="60" y1="60" x2="65" y2="85" stroke="white" strokeWidth="1.5" opacity="0.6" />
        </svg>
      )
    },
    {
      id: 4,
      name: 'The Arc of Recovery',
      description: 'Trajetória ascendente de recuperação',
      colors: 'Verde + Azul + Ouro',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <linearGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" fill="url(#grad4)" rx="20" />

          {/* Arco */}
          <path d="M 25 85 Q 60 30 95 50" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />

          {/* Pessoa na base */}
          <circle cx="25" cy="85" r="6" fill="white" />
          <line x1="25" y1="91" x2="25" y2="105" stroke="white" strokeWidth="2" />
          <line x1="20" y1="95" x2="30" y2="95" stroke="white" strokeWidth="2" />

          {/* Pessoa no topo */}
          <circle cx="95" cy="50" r="6" fill="white" />
          <line x1="95" y1="56" x2="95" y2="70" stroke="white" strokeWidth="2" />
          <line x1="90" y1="60" x2="100" y2="60" stroke="white" strokeWidth="2" />

          {/* Estrela de chegada */}
          <circle cx="95" cy="50" r="12" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />
        </svg>
      )
    },
    {
      id: 5,
      name: 'Joint & Joint',
      description: 'Dois círculos interconectados',
      colors: 'Azul + Verde + Cinza + Rosa',
      svg: (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <defs>
            <linearGradient id="grad5" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <rect width="120" height="120" fill="url(#grad5)" rx="20" />

          {/* Círculo esquerdo */}
          <circle cx="45" cy="60" r="20" fill="white" opacity="0.9" />

          {/* Círculo direito */}
          <circle cx="75" cy="60" r="20" fill="white" opacity="0.9" />

          {/* Centro de sobreposição */}
          <circle cx="60" cy="60" r="8" fill="#0369a1" />

          {/* Linhas de movimento */}
          <line x1="35" y1="50" x2="30" y2="40" stroke="white" strokeWidth="2" opacity="0.7" />
          <line x1="40" y1="35" x2="35" y2="25" stroke="white" strokeWidth="2" opacity="0.7" />
          <line x1="85" y1="50" x2="90" y2="40" stroke="white" strokeWidth="2" opacity="0.7" />
          <line x1="80" y1="35" x2="85" y2="25" stroke="white" strokeWidth="2" opacity="0.7" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            🎨 Escolha o Logo da OrthoClinic
          </h1>
          <p className="text-slate-400 text-lg">
            Selecione qual design você mais gosta para representar sua clínica
          </p>
        </div>

        {/* Grid de Logos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
          {logos.map((logo) => (
            <div
              key={logo.id}
              onClick={() => setSelected(logo.id)}
              className={`cursor-pointer transform transition-all duration-300 rounded-xl p-6 ${
                selected === logo.id
                  ? 'scale-110 ring-4 ring-cyan-400 bg-slate-700'
                  : 'bg-slate-700 hover:scale-105 hover:bg-slate-600'
              }`}
            >
              {/* Logo Preview */}
              <div className="h-40 mb-4 flex items-center justify-center bg-slate-800 rounded-lg p-4">
                {logo.svg}
              </div>

              {/* Nome */}
              <h3 className="text-white font-bold text-lg mb-1">Opção {logo.id}</h3>
              <h4 className="text-cyan-400 font-semibold mb-2">{logo.name}</h4>

              {/* Descrição */}
              <p className="text-slate-300 text-sm mb-3">{logo.description}</p>

              {/* Cores */}
              <p className="text-slate-400 text-xs mb-4">
                <span className="font-semibold">Cores:</span> {logo.colors}
              </p>

              {/* Botão */}
              {selected === logo.id && (
                <div className="bg-cyan-500 text-white py-2 px-4 rounded-lg font-bold text-center text-sm">
                  ✓ Selecionado
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Seleção Atual */}
        {selected && (
          <div className="fixed bottom-8 right-8 bg-cyan-500 text-white p-6 rounded-lg shadow-2xl">
            <p className="font-bold text-lg mb-2">
              ✓ Você escolheu: Opção {selected}
            </p>
            <p className="text-sm mb-4">
              {logos.find(l => l.id === selected)?.name}
            </p>
            <button
              onClick={() => {
                alert(`Logo ${selected} selecionado! Implementando...`);
              }}
              className="bg-white text-cyan-500 font-bold py-2 px-6 rounded-lg hover:bg-slate-100 w-full"
            >
              Confirmar Escolha
            </button>
          </div>
        )}

        {/* Instruções */}
        {!selected && (
          <div className="text-center text-slate-400">
            <p className="text-lg">Clique em uma opção acima para visualizar</p>
          </div>
        )}
      </div>
    </div>
  );
}
