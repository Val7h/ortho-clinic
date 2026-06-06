'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, AlertCircle, Check, X, Pill } from 'lucide-react';
import toast from 'react-hot-toast';

interface Medicacao {
  id: string;
  nome: string;
  dosagem: string;
  via: 'oral' | 'injetável' | 'tópica' | 'intravenosa';
  fabricante: string;
}

interface Interacao {
  medicacao: string;
  severidade: 'leve' | 'moderada' | 'grave';
  descricao: string;
}

interface MedicacaoSelecionada {
  id: string;
  nome: string;
  dosagem: string;
  via: string;
  fabricante: string;
  posologia: string;
  duracao: string; // ex: "7 dias", "2 semanas"
  interacoes: Interacao[];
  temContraindicacao: boolean;
}

interface MedicationSelectorProps {
  pacienteId: string;
  pacienteAlergias?: string[];
  medicacoesAtuais?: string[]; // IDs de medicações que o paciente toma
  onMedicationAdd?: (medicacao: MedicacaoSelecionada) => void;
  onMedicationRemove?: (medicacaoId: string) => void;
  apiUrl?: string;
}

/**
 * MedicationSelector: Input inteligente para seleção de medicações
 *
 * Features:
 * - Autocomplete com busca via API
 * - Exibe: nome, dosagem, via, fabricante
 * - Alerta visual de INTERAÇÕES (badges coloridos)
 * - Alerta visual de CONTRAINDICAÇÃO (alergia do paciente)
 * - Inputs para posologia e duração
 * - Validação visual e em tempo real
 * - Lista de medicações selecionadas com opções de remoção
 * - Dark mode completo
 * - Otimizado com useMemo e useCallback
 */
export const MedicationSelector: React.FC<MedicationSelectorProps> = ({
  pacienteId,
  pacienteAlergias = [],
  medicacoesAtuais = [],
  onMedicationAdd,
  onMedicationRemove,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
}) => {
  // Estados de busca
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Medicacao[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Estado do formulário
  const [selectedMedicacao, setSelectedMedicacao] = useState<Medicacao | null>(null);
  const [posologia, setPosologia] = useState('');
  const [duracao, setDuracao] = useState('');
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [temContraindicacao, setTemContraindicacao] = useState(false);

  // Lista de medicações adicionadas
  const [selectedMedicacoes, setSelectedMedicacoes] = useState<MedicacaoSelecionada[]>([]);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Busca medicações via API com debounce
   */
  const searchMedicacoes = useCallback(
    async (term: string) => {
      if (term.length < 2) {
        setSuggestions([]);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(
          `${apiUrl}/api/medicamentos?search=${encodeURIComponent(term)}&limite=10`
        );
        if (!res.ok) throw new Error('Erro ao buscar medicações');

        const data = await res.json();
        setSuggestions(data.medicamentos || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Erro ao buscar medicações:', error);
        toast.error('Erro ao buscar medicações');
      } finally {
        setIsSearching(false);
      }
    },
    [apiUrl]
  );

  // Debounce na busca
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchMedicacoes(value);
    }, 300);
  }, [searchMedicacoes]);

  /**
   * Quando uma medicação é selecionada, busca interações e contraindicações
   */
  const handleSelectMedicacao = useCallback(
    async (medicacao: Medicacao) => {
      setSelectedMedicacao(medicacao);
      setSearchTerm(medicacao.nome);
      setShowSuggestions(false);

      // Busca interações com medicações atuais
      try {
        const res = await fetch(`${apiUrl}/api/medicamentos/${medicacao.id}/interacoes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            medicacoesAtuais,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setInteracoes(data.interacoes || []);
        }
      } catch (error) {
        console.error('Erro ao buscar interações:', error);
      }

      // Verifica contraindicação com alergias
      const temAlergia = pacienteAlergias.some(
        (alergia) =>
          medicacao.nome.toLowerCase().includes(alergia.toLowerCase()) ||
          alergia.toLowerCase().includes(medicacao.nome.toLowerCase())
      );
      setTemContraindicacao(temAlergia);

      if (temAlergia) {
        toast.error('Alerta: Paciente tem alergia a este medicamento!');
      }
    },
    [apiUrl, medicacoesAtuais, pacienteAlergias]
  );

  /**
   * Adiciona medicação à lista
   */
  const handleAddMedicacao = useCallback(() => {
    if (!selectedMedicacao || !posologia || !duracao) {
      toast.error('Preencha todos os campos: medicação, posologia e duração');
      return;
    }

    if (temContraindicacao) {
      toast.error('Não é possível adicionar medicação com contraindicação');
      return;
    }

    const novaMedicacao: MedicacaoSelecionada = {
      id: selectedMedicacao.id,
      nome: selectedMedicacao.nome,
      dosagem: selectedMedicacao.dosagem,
      via: selectedMedicacao.via,
      fabricante: selectedMedicacao.fabricante,
      posologia,
      duracao,
      interacoes,
      temContraindicacao,
    };

    setSelectedMedicacoes([...selectedMedicacoes, novaMedicacao]);
    onMedicationAdd?.(novaMedicacao);

    // Limpa o formulário
    setSelectedMedicacao(null);
    setSearchTerm('');
    setPosologia('');
    setDuracao('');
    setInteracoes([]);
    setTemContraindicacao(false);

    toast.success(`${selectedMedicacao.nome} adicionado(a)`);
  }, [
    selectedMedicacao,
    posologia,
    duracao,
    temContraindicacao,
    selectedMedicacoes,
    interacoes,
    onMedicationAdd,
  ]);

  /**
   * Remove medicação da lista
   */
  const handleRemoveMedicacao = useCallback(
    (medicacaoId: string) => {
      setSelectedMedicacoes(
        selectedMedicacoes.filter((m) => m.id !== medicacaoId)
      );
      onMedicationRemove?.(medicacaoId);
    },
    [selectedMedicacoes, onMedicationRemove]
  );

  /**
   * Determina cor do badge de interação
   */
  const getInteracaoColor = useCallback((severidade: string) => {
    switch (severidade) {
      case 'grave':
        return 'bg-error-500/20 text-error-300 border-error-500/30';
      case 'moderada':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'leve':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  }, []);

  /**
   * Valida se há interações graves
   */
  const temInteracaoGrave = useMemo(
    () => interacoes.some((i) => i.severidade === 'grave'),
    [interacoes]
  );

  return (
    <div className="w-full bg-gradient-to-br from-slate-900 to-slate-950 rounded-xl border border-slate-800 p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-50">Medicações</h3>
        <p className="text-sm text-slate-400 mt-1">
          Adicione medicações com posologia e duração do tratamento
        </p>
      </div>

      {/* Área de Busca e Seleção */}
      <div className="bg-slate-800/50 rounded-lg p-5 mb-6 border border-slate-700/50">
        {/* Search Input */}
        <div className="mb-4 relative">
          <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
            Buscar Medicação
          </label>

          <div className="relative">
            <input
              type="text"
              placeholder="Digite o nome do medicamento..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchTerm && setShowSuggestions(true)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-50 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            />

            {isSearching && (
              <div className="absolute right-3 top-3">
                <div className="animate-spin h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>

          {/* Sugestões dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {suggestions.map((med) => (
                <button
                  key={med.id}
                  onClick={() => handleSelectMedicacao(med)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-800 border-b border-slate-800 last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-slate-50">{med.nome}</div>
                  <div className="text-xs text-slate-400">
                    {med.dosagem} • {med.via} • {med.fabricante}
                  </div>
                </button>
              ))}
            </div>
          )}

          {showSuggestions && searchTerm && suggestions.length === 0 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg p-4 text-center text-slate-400 text-sm">
              Nenhuma medicação encontrada
            </div>
          )}
        </div>

        {/* Medicação Selecionada - Info Card */}
        {selectedMedicacao && (
          <div className="bg-slate-900/50 rounded-lg p-4 mb-4 border border-slate-700/50">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-slate-50">{selectedMedicacao.nome}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {selectedMedicacao.dosagem} • {selectedMedicacao.via} • {selectedMedicacao.fabricante}
                </div>
              </div>
            </div>

            {/* Alerta de Contraindicação */}
            {temContraindicacao && (
              <div className="mb-3 p-3 rounded-lg bg-error-500/10 border border-error-500/30 flex items-start gap-2">
                <AlertTriangle size={16} className="text-error-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-error-300">
                  <strong>Contraindicação:</strong> Paciente tem alergia registrada a este medicamento
                </div>
              </div>
            )}

            {/* Alertas de Interação */}
            {interacoes.length > 0 && (
              <div className="mb-3 space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <AlertCircle size={14} />
                  Interações medicamentosas detectadas:
                </div>
                <div className="space-y-1.5">
                  {interacoes.map((inter, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg border text-xs ${getInteracaoColor(inter.severidade)}`}
                    >
                      <div className="font-semibold">{inter.medicacao}</div>
                      <div className="text-xs opacity-90 mt-0.5">{inter.descricao}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid: Posologia e Duração */}
        {selectedMedicacao && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Posologia */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
                Posologia
              </label>
              <input
                type="text"
                placeholder="Ex: 1 comprimido a cada 8h"
                value={posologia}
                onChange={(e) => setPosologia(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-50 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </div>

            {/* Duração */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">
                Duração
              </label>
              <input
                type="text"
                placeholder="Ex: 7 dias"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-50 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </div>
          </div>
        )}

        {/* Botão Adicionar */}
        {selectedMedicacao && (
          <button
            onClick={handleAddMedicacao}
            disabled={temContraindicacao || temInteracaoGrave || !posologia || !duracao}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              temContraindicacao || temInteracaoGrave || !posologia || !duracao
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Pill size={18} />
            Adicionar Medicação
          </button>
        )}
      </div>

      {/* Lista de Medicações Selecionadas */}
      {selectedMedicacoes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3">
            Medicações Prescritas ({selectedMedicacoes.length})
          </h4>

          <div className="space-y-3">
            {selectedMedicacoes.map((med) => (
              <div
                key={med.id}
                className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
              >
                {/* Header da medicação */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-semibold text-slate-50 flex items-center gap-2">
                      <Check size={16} className="text-emerald-500" />
                      {med.nome}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {med.dosagem} • {med.via} • {med.fabricante}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRemoveMedicacao(med.id)}
                    className="p-1.5 hover:bg-error-500/10 rounded-lg transition-colors text-slate-400 hover:text-error-400"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Posologia e Duração */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div className="bg-slate-900/30 rounded px-2 py-1.5">
                    <span className="text-slate-500">Posologia: </span>
                    <span className="text-slate-200">{med.posologia}</span>
                  </div>
                  <div className="bg-slate-900/30 rounded px-2 py-1.5">
                    <span className="text-slate-500">Duração: </span>
                    <span className="text-slate-200">{med.duracao}</span>
                  </div>
                </div>

                {/* Badges de Interação (se houver) */}
                {med.interacoes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {med.interacoes.map((inter, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-1 rounded-full text-xs font-semibold border ${getInteracaoColor(
                          inter.severidade
                        )}`}
                      >
                        {inter.medicacao}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sem medicações */}
      {selectedMedicacoes.length === 0 && !selectedMedicacao && (
        <div className="text-center py-8 text-slate-500">
          <Pill size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma medicação adicionada ainda</p>
        </div>
      )}
    </div>
  );
};

export default MedicationSelector;
