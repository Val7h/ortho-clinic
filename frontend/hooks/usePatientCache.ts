'use client';
/**
 * usePatientCache
 *
 * Offline-first LRU cache for patient data.
 * Keeps the last 100 viewed patients in localStorage so the list and
 * profile remain usable without network connectivity.
 *
 * Design decisions:
 * - LRU eviction: each access bumps the patient to the front. When the
 *   cache exceeds MAX_SIZE the oldest entry is dropped.
 * - Cache is invalidated per-patient by storing a `cachedAt` timestamp
 *   and checking it on reads. Entries older than TTL_MS are considered
 *   stale and re-fetched when online.
 * - Search is performed over the in-memory cache when offline, so the
 *   user gets a partial but useful result set.
 * - The cache is shared across all browser tabs via the `storage` event.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CachedPatient {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  birthdate?: string;
  cpf?: string;
  insurance?: string;
  insurance_number?: string;
  insurance_plan?: string;
  photo_url?: string;
  blood_type?: string;
  allergies?: string;
  chronic_conditions?: string;
  current_medications?: string;
  gender?: string;
  address_city?: string;
  consultation_count?: number;
  // Cache metadata
  cachedAt: number;
}

const STORAGE_KEY = 'ortho_patient_cache_v2';
const MAX_SIZE = 100;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Storage helpers ────────────────────────────────────────────────────────

function loadCache(): CachedPatient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCache(cache: CachedPatient[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded — keep the most-recently-used half
    const trimmed = cache.slice(0, Math.ceil(MAX_SIZE / 2));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* ignore */ }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function usePatientCache() {
  const [cache, setCache] = useState<CachedPatient[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  // Hydrate on mount
  useEffect(() => {
    setCache(loadCache());
    setIsOnline(navigator.onLine);
  }, []);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCache(loadCache());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Online/offline tracking
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /**
   * Write/update a patient into the cache (LRU bump to front).
   */
  const put = useCallback((patient: Omit<CachedPatient, 'cachedAt'>) => {
    const entry: CachedPatient = { ...patient, cachedAt: Date.now() };
    const current = loadCache().filter(p => p.id !== patient.id);
    const updated = [entry, ...current].slice(0, MAX_SIZE);
    saveCache(updated);
    setCache(updated);
  }, []);

  /**
   * Bulk-write a list (e.g. from a search result) without bumping order.
   */
  const putMany = useCallback((patients: Omit<CachedPatient, 'cachedAt'>[]) => {
    const now = Date.now();
    const incoming = new Map(patients.map(p => [p.id, { ...p, cachedAt: now }]));
    const current = loadCache().filter(p => !incoming.has(p.id));
    const updated = [...Array.from(incoming.values()), ...current].slice(0, MAX_SIZE);
    saveCache(updated);
    setCache(updated);
  }, []);

  /**
   * Get a single patient from cache. Returns null if not cached or stale.
   */
  const get = useCallback((id: number): CachedPatient | null => {
    const entry = loadCache().find(p => p.id === id);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) return null; // stale
    return entry;
  }, []);

  /**
   * Search within the cache (offline search fallback).
   * Matches against name, cpf, phone, email (case-insensitive).
   */
  const search = useCallback((query: string): CachedPatient[] => {
    if (!query.trim()) return loadCache();
    const q = query.toLowerCase().trim();
    return loadCache().filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.cpf?.includes(q) ||
      p.phone?.includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  }, []);

  /**
   * Remove a single patient from cache (e.g. after deletion).
   */
  const remove = useCallback((id: number) => {
    const updated = loadCache().filter(p => p.id !== id);
    saveCache(updated);
    setCache(updated);
  }, []);

  /**
   * Clear all cached patients.
   */
  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCache([]);
  }, []);

  const size = cache.length;

  return { cache, isOnline, size, put, putMany, get, search, remove, clear };
}
