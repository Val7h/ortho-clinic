/**
 * Hooks customizados para gerenciamento de medicações
 * Reutilizáveis em múltiplos componentes
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook para search com debounce
 * Evita muitas requisições de API
 */
export function useDebouncedSearch(
  searchFn: (term: string) => Promise<any>,
  delay = 300
) {
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    (term: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (!term || term.length < 2) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      timeoutRef.current = setTimeout(async () => {
        try {
          const data = await searchFn(term);
          setResults(data);
        } catch (error) {
          console.error('Erro em search:', error);
        } finally {
          setIsLoading(false);
        }
      }, delay);
    },
    [searchFn, delay]
  );

  return { results, isLoading, search };
}

/**
 * Hook para gerenciar interações medicamentosas
 */
export function useMedicationInteractions(apiUrl: string) {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchInteractions = useCallback(
    async (medicationId: string, currentMedications: string[]) => {
      setLoading(true);
      try {
        const res = await fetch(
          `${apiUrl}/api/medicamentos/${medicationId}/interacoes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medicacoesAtuais: currentMedications }),
          }
        );

        if (!res.ok) throw new Error('Erro ao buscar interações');

        const data = await res.json();
        setInteractions(data.interacoes || []);
        return data.interacoes;
      } catch (error) {
        console.error('Erro ao buscar interações:', error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [apiUrl]
  );

  return { interactions, loading, fetchInteractions };
}

/**
 * Hook para validar contraindicações com alergias
 */
export function useContraindicationCheck() {
  const [hasContraindication, setHasContraindication] = useState<boolean>(false);

  const checkContraindication = useCallback(
    (medicationName: string, allergies: string[]) => {
      const hasAlergy = allergies.some(
        (allergy) =>
          medicationName.toLowerCase().includes(allergy.toLowerCase()) ||
          allergy.toLowerCase().includes(medicationName.toLowerCase())
      );

      setHasContraindication(hasAlergy);
      return hasAlergy;
    },
    []
  );

  return { hasContraindication, checkContraindication };
}

/**
 * Hook para gerenciar lista de medicações selecionadas
 */
export function useSelectedMedications() {
  const [medications, setMedications] = useState<any[]>([]);

  const addMedication = useCallback((medication: any) => {
    setMedications((prev) => [...prev, { ...medication, id: Date.now().toString() }]);
  }, []);

  const removeMedication = useCallback((medicationId: string) => {
    setMedications((prev) => prev.filter((m) => m.id !== medicationId));
  }, []);

  const clearMedications = useCallback(() => {
    setMedications([]);
  }, []);

  return { medications, addMedication, removeMedication, clearMedications };
}

/**
 * Hook para buscar dados da fila em tempo real
 */
export function useQueueData(apiUrl: string, pollInterval = 5000) {
  const [data, setData] = useState<{
    totalAguardando: number;
    pacienteAtual: any | null;
    proximosPacientes: any[];
    lastUpdate: Date | null;
  }>({
    totalAguardando: 0,
    pacienteAtual: null,
    proximosPacientes: [],
    lastUpdate: null as Date | null,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueueData = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/fila/status`);
      if (!res.ok) throw new Error('Erro ao buscar fila');

      const newData = await res.json();
      setData({
        totalAguardando: newData.totalAguardando,
        pacienteAtual: newData.pacienteAtual,
        proximosPacientes: newData.proximosPacientes,
        lastUpdate: new Date(),
      });
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setLoading(false);
    }
  }, [apiUrl]);

  // Setup inicial e polling
  useEffect(() => {
    fetchQueueData();
    const interval = setInterval(fetchQueueData, pollInterval);

    return () => clearInterval(interval);
  }, [fetchQueueData, pollInterval]);

  return { data, loading, error, refetch: fetchQueueData };
}

/**
 * Hook para gerenciar conexão WebSocket com fallback
 */
export function useWebSocketQueue(
  wsUrl: string,
  onMessage: (data: any) => void,
  onConnectionChange?: (connected: boolean) => void
) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        onConnectionChange?.(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessage(message);
        } catch (err) {
          console.error('Erro ao processar mensagem WebSocket:', err);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
        onConnectionChange?.(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        onConnectionChange?.(false);
        // Reconectar em 3s
        setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
      setIsConnected(false);
    }
  }, [wsUrl, onMessage, onConnectionChange]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected };
}
