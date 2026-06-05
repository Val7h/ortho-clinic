"use client";
import { useCallback, useRef } from "react";
export function useConsultationDraft(patientId) {
  const KEY = "consult_draft_" + patientId;
  const timerRef = useRef(null);
  const getDraft = useCallback(() => {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }, [KEY]);
  const saveDraft = useCallback((data) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    }, 1000);
  }, [KEY]);
  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    localStorage.removeItem(KEY);
  }, [KEY]);
  return { getDraft, saveDraft, clearDraft };
}
