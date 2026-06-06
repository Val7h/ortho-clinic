/**
 * Página de exemplo: Sala de Espera com TV Display
 *
 * Use este arquivo como referência para implementar a página
 * de exibição em TV da sala de espera.
 *
 * Para usar:
 * 1. Crie um arquivo app/sala-espera/page.tsx
 * 2. Copie o conteúdo de SalaEsperaPage
 */

'use client';

import React, { useEffect } from 'react';
import { TVDisplay } from '@/components/TVDisplay';

/**
 * SalaEsperaPage: Full-screen display para TV da sala de espera
 *
 * Mostra:
 * - Nome do paciente em GRANDE (80%+ tela)
 * - Sala de atendimento
 * - Próximos 3 pacientes
 * - Status de conexão
 * - Timestamp da última chamada
 */
export default function SalaEsperaPage() {
  useEffect(() => {
    // Remove scroll e navbars se existirem
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-black">
      <TVDisplay
        apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
        updateInterval={5000}
        wsUrl={process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/queue'}
      />
    </div>
  );
}

/**
 * Environment variables necessárias no .env.local:
 *
 * NEXT_PUBLIC_API_URL=http://localhost:8000
 * NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/queue
 */
