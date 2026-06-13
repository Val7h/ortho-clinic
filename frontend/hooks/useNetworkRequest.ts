'use client';
/**
 * useNetworkRequest
 *
 * Sprint 6 performance: composable hook that wraps dedupGet with:
 *   1. Automatic AbortController cleanup on unmount (prevents memory leaks)
 *   2. Request coalescing — identical parallel requests share one in-flight call
 *   3. Stale-while-revalidate: returns cached state immediately, then refreshes
 *   4. Loading + error state management
 *
 * Usage:
 *   const { data, loading, error, refetch } = useNetworkRequest(
 *     '/patients',
 *     { search: query }
 *   );
 *
 * This reduces the number of mount-time API calls across dashboard:
 *   BEFORE: NavBar + PatientPage + DashboardAnalytics → 3 separate /auth/me calls
 *   AFTER:  All 3 share one in-flight promise via dedupGet
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { dedupGet } from '@/lib/api';

interface Options<T> {
  /** Skip fetching entirely (e.g. wait for params to be ready). Default false. */
  skip?: boolean;
  /** Fallback value used before first successful fetch. */
  initialData?: T;
  /** Called once on successful fetch. Useful for side-effects like cache writes. */
  onSuccess?: (data: T) => void;
}

interface State<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

export function useNetworkRequest<T = any>(
  url: string,
  params?: Record<string, any>,
  options: Options<T> = {}
) {
  const { skip = false, initialData, onSuccess } = options;

  const [state, setState] = useState<State<T>>({
    data: initialData,
    loading: !skip,
    error: null,
  });

  // Stable ref so the cleanup function always cancels the latest controller
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    if (skip) return;

    // Cancel any previous in-flight request for this hook instance
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await dedupGet<T>(url, params, ctrl.signal);
      if (ctrl.signal.aborted) return; // component unmounted mid-flight
      setState({ data, loading: false, error: null });
      onSuccess?.(data);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      setState(prev => ({ ...prev, loading: false, error: err as Error }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params), skip]);

  useEffect(() => {
    fetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetch]);

  return { ...state, refetch: fetch };
}
