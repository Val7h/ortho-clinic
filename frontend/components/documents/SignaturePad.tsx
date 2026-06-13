"use client";

/**
 * SignaturePad — captura de assinatura digital por toque.
 *
 * Usa <canvas> com eventos de mouse e touch.
 * Exporta PNG base64 (data:image/png;base64,...) via onSave.
 *
 * Uso:
 *   <SignaturePad
 *     signerName="João Silva"
 *     onSave={(dataUrl, name) => sendToApi(dataUrl, name)}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Check, X } from "lucide-react";

interface Props {
  signerName?: string;
  onSave: (dataUrl: string, signerName: string) => void;
  onCancel: () => void;
}

export function SignaturePad({ signerName: initialName = "", onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [signerName, setSignerName] = useState(initialName);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // ── Setup canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resolve DPR para telas Retina
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // ── Coordenadas relativas ao canvas ──────────────────────────────────────
  function getCoords(
    e: React.MouseEvent | React.TouchEvent,
  ): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(true);
    setIsEmpty(false);
    lastPoint.current = getCoords(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPoint.current) return;

    const current = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPoint.current = current;
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(false);
    lastPoint.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setIsEmpty(true);
  }

  function handleSave() {
    if (isEmpty) return;
    if (!signerName.trim()) {
      alert("Informe o nome do signatário antes de salvar.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl, signerName.trim());
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nome do signatário */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          Nome do signatário
        </label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Ex: João Silva (Paciente)"
          className="h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700
                     bg-white dark:bg-slate-900 text-sm focus:outline-none
                     focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {/* Canvas de assinatura */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Assinatura
          </label>
          <button
            onClick={clearCanvas}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <RotateCcw className="w-3 h-3" />
            Limpar
          </button>
        </div>

        <div
          className="relative border-2 border-dashed border-slate-300 dark:border-slate-600
                      rounded-xl overflow-hidden bg-white"
          style={{ height: 160 }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair touch-none"
            style={{ height: 160 }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
            aria-label="Área de assinatura — desenhe com o dedo ou mouse"
          />
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-slate-400 select-none">
                Assine aqui com o dedo ou mouse
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ao assinar, o signatário confirma ciência e concordância com o documento.
        </p>
      </div>

      {/* Ações */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700
                     text-sm font-medium text-slate-600 dark:text-slate-400
                     hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors
                     flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isEmpty || !signerName.trim()}
          className="flex-1 h-11 rounded-xl bg-emerald-600 disabled:bg-slate-200
                     dark:disabled:bg-slate-700 text-white disabled:text-slate-400
                     text-sm font-semibold hover:bg-emerald-700 transition-colors
                     flex items-center justify-center gap-2 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" />
          Confirmar Assinatura
        </button>
      </div>
    </div>
  );
}
