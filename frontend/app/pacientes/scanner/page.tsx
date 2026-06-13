'use client';
/**
 * Patient Scanner Page
 *
 * Barcode and QR Code scanner for patient ID lookup.
 *
 * Strategy:
 * - Uses the BarcodeDetector Web API (Chrome 83+, Edge 83+, Android Chrome)
 *   when available — zero JS bundle cost, hardware-accelerated on mobile.
 * - Falls back to manual ID entry when the API is not available (Safari,
 *   Firefox). A note explains the limitation so users know why.
 *
 * Expected QR/barcode format: plain numeric patient ID, or a URL ending
 * in /pacientes/<id> (e.g. a QR code printed on the patient card).
 *
 * Scanning loop: requestAnimationFrame-based — processes one frame at a
 * time and stops immediately on a successful scan to avoid redundant work.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, AlertCircle, Keyboard, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import NavBar from '@/components/NavBar';
import { Button, Input } from '@/components/ui';
import { patientsApi } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

declare global {
  // BarcodeDetector is not yet in TypeScript lib.dom
  interface Window {
    BarcodeDetector?: {
      new(opts?: { formats?: string[] }): {
        detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]>;
      };
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

type ScanState = 'idle' | 'starting' | 'scanning' | 'found' | 'error' | 'unsupported';

// ── Extract patient ID from raw barcode value ──────────────────────────────
function extractPatientId(raw: string): number | null {
  // 1. Plain integer
  if (/^\d+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10);
    return n > 0 ? n : null;
  }
  // 2. URL ending in /pacientes/<id>
  const match = raw.match(/\/pacientes\/(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    return n > 0 ? n : null;
  }
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PatientScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<InstanceType<NonNullable<Window['BarcodeDetector']>> | null>(null);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState('');
  const [looking, setLooking] = useState(false);

  // ── Cleanup ────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Navigate to patient ────────────────────────────────────────────────

  const navigateToPatient = useCallback(async (id: number) => {
    setScanState('found');
    stopCamera();
    // Verify patient exists
    try {
      setLooking(true);
      await patientsApi.get(id);
      router.push(`/pacientes/${id}`);
    } catch {
      toast.error(`Paciente #${id} não encontrado`);
      setScanState('idle');
    } finally {
      setLooking(false);
    }
  }, [router, stopCamera]);

  // ── Scanning loop ──────────────────────────────────────────────────────

  const scanLoop = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    try {
      const results = await detector.detect(video);
      if (results.length > 0) {
        const raw = results[0].rawValue;
        const id = extractPatientId(raw);
        if (id) {
          navigateToPatient(id);
          return; // stop loop
        }
        // Barcode found but not a patient ID — keep scanning
      }
    } catch { /* detector may fail on first few frames — ignore */ }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, [navigateToPatient]);

  // ── Start scanning ─────────────────────────────────────────────────────

  const startScanning = useCallback(async () => {
    setScanState('starting');

    // Check BarcodeDetector support
    if (!window.BarcodeDetector) {
      setScanState('unsupported');
      setManualMode(true);
      return;
    }

    try {
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
      const formats = supportedFormats.filter(f =>
        ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'pdf417', 'data_matrix'].includes(f)
      );

      detectorRef.current = new window.BarcodeDetector({ formats: formats.length > 0 ? formats : undefined });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setScanState('scanning');
          rafRef.current = requestAnimationFrame(scanLoop);
        };
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        toast.error('Permissão de câmera necessária');
      }
      setScanState('error');
      setManualMode(true);
    }
  }, [scanLoop]);

  // ── Manual lookup ──────────────────────────────────────────────────────

  const handleManualLookup = useCallback(async () => {
    const id = parseInt(manualId, 10);
    if (!id || id <= 0) {
      toast.error('ID inválido');
      return;
    }
    navigateToPatient(id);
  }, [manualId, navigateToPatient]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar title="Scanner de paciente" back="/pacientes" />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Camera viewport */}
        {!manualMode && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Viewfinder reticle */}
            {scanState === 'scanning' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 relative">
                  {/* Corner marks */}
                  {[
                    'top-0 left-0 border-t-4 border-l-4 rounded-tl-lg',
                    'top-0 right-0 border-t-4 border-r-4 rounded-tr-lg',
                    'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg',
                    'bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 border-brand-400 ${cls}`} />
                  ))}
                  {/* Scan line animation */}
                  <div className="absolute left-2 right-2 h-0.5 bg-brand-400/70 animate-bounce" style={{ top: '50%' }} />
                </div>
              </div>
            )}

            {/* Overlays by state */}
            {scanState === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/80">
                <QrCode className="w-16 h-16 text-slate-400" />
                <Button onClick={startScanning} icon={<QrCode className="w-4 h-4" />}>
                  Iniciar scanner
                </Button>
              </div>
            )}

            {scanState === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
            )}

            {scanState === 'found' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-emerald-900/80">
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {looking && <Loader2 className="w-5 h-5 text-white animate-spin" />}
                <p className="text-white font-semibold">Código lido!</p>
              </div>
            )}

            {scanState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/80">
                <AlertCircle className="w-10 h-10 text-rose-400" />
                <p className="text-white text-sm">Câmera indisponível</p>
              </div>
            )}
          </div>
        )}

        {/* Unsupported note */}
        {scanState === 'unsupported' && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-900/30 border border-amber-700 p-4">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-200">
              Scanner de código de barras não suportado neste navegador (use Chrome ou Edge).
              Use a entrada manual abaixo.
            </p>
          </div>
        )}

        {/* Manual ID input */}
        <div className="rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Busca por ID</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="ID do paciente"
              value={manualId}
              onChange={e => setManualId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
              fullWidth
            />
            <Button
              onClick={handleManualLookup}
              disabled={!manualId || looking}
              isLoading={looking}
            >
              Buscar
            </Button>
          </div>
        </div>

        {/* Toggle manual/camera */}
        {!manualMode && scanState !== 'unsupported' && (
          <button
            onClick={() => { setManualMode(true); stopCamera(); }}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Keyboard className="w-4 h-4" />
            Digitar ID manualmente
          </button>
        )}
        {manualMode && scanState !== 'unsupported' && (
          <button
            onClick={() => { setManualMode(false); setScanState('idle'); }}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Usar câmera
          </button>
        )}

      </main>
    </div>
  );
}
