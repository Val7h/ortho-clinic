'use client';
/**
 * PatientPhotoCapture
 *
 * Handles patient photo documentation via two strategies:
 * 1. Camera capture (preferred on mobile) — uses MediaDevices.getUserMedia
 *    with `facingMode: "environment"` to prefer the back camera.
 * 2. File upload fallback — <input type="file" accept="image/*" capture="environment">
 *    which also triggers the native camera on iOS/Android.
 *
 * Design decisions:
 * - Image is resized client-side to 800×800 max (canvas) before upload to
 *   keep payloads small and server processing cheap.
 * - Camera stream is stopped immediately after capture to release the
 *   hardware lock and prevent the browser camera indicator from staying on.
 * - JPEG at quality 0.85 gives a good size/quality tradeoff for portraits.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, X, Check, RotateCcw, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { patientsApi } from '@/lib/api';
import { Button } from '@/components/ui';

interface Props {
  patientId: number;
  currentPhotoUrl?: string;
  onUploadSuccess: (newPhotoUrl: string) => void;
  onClose: () => void;
}

type Stage = 'idle' | 'camera' | 'preview' | 'uploading';

const MAX_DIM = 800;
const JPEG_QUALITY = 0.85;

function resizeImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function PatientPhotoCapture({ patientId, currentPhotoUrl, onUploadSuccess, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stop camera stream on unmount or when leaving camera stage
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  // ── Camera ──────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setStage('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Permissão de câmera negada. Use o upload de arquivo.'
        : 'Câmera não disponível. Use o upload de arquivo.';
      setCameraError(msg);
      setStage('idle');
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const scale = Math.min(1, MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) return;
      stopStream();
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStage('preview');
    }, 'image/jpeg', JPEG_QUALITY);
  }, [stopStream]);

  // ── File input ──────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await resizeImage(file);
    setCapturedBlob(resized);
    setPreviewUrl(URL.createObjectURL(resized));
    setStage('preview');
  }, []);

  // ── Upload ──────────────────────────────────────────────────────────────

  const uploadPhoto = useCallback(async () => {
    if (!capturedBlob) return;
    setStage('uploading');
    try {
      const file = new File([capturedBlob], 'photo.jpg', { type: 'image/jpeg' });
      const result = await patientsApi.uploadPhoto(patientId, file);
      toast.success('Foto atualizada!');
      onUploadSuccess(result.photo_url);
      onClose();
    } catch {
      toast.error('Erro ao enviar foto');
      setStage('preview');
    }
  }, [capturedBlob, patientId, onUploadSuccess, onClose]);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    stopStream();
    setStage('idle');
  }, [previewUrl, stopStream]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Foto do paciente</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Camera error */}
      {cameraError && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {cameraError}
        </p>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {stage === 'idle' && (
        <div className="space-y-3">
          {currentPhotoUrl && (
            <div className="flex justify-center">
              <img
                src={currentPhotoUrl}
                alt="Foto atual"
                className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-200"
              />
            </div>
          )}
          <Button
            fullWidth
            icon={<Camera className="w-4 h-4" />}
            onClick={startCamera}
          >
            Abrir câmera
          </Button>
          <Button
            fullWidth
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => fileInputRef.current?.click()}
          >
            Escolher arquivo
          </Button>
        </div>
      )}

      {stage === 'camera' && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 border-2 border-white/20 rounded-xl pointer-events-none" />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset} fullWidth>
              Cancelar
            </Button>
            <Button onClick={capturePhoto} fullWidth icon={<Camera className="w-4 h-4" />}>
              Tirar foto
            </Button>
          </div>
        </div>
      )}

      {stage === 'preview' && previewUrl && (
        <div className="space-y-3">
          <div className="flex justify-center">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-40 h-40 rounded-2xl object-cover border-2 border-brand-200"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset} icon={<RotateCcw className="w-4 h-4" />} fullWidth>
              Refazer
            </Button>
            <Button onClick={uploadPhoto} icon={<Check className="w-4 h-4" />} fullWidth>
              Usar foto
            </Button>
          </div>
        </div>
      )}

      {stage === 'uploading' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          <p className="text-sm text-slate-600">Enviando foto...</p>
        </div>
      )}
    </div>
  );
}
