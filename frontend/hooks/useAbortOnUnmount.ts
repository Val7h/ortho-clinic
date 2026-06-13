'use client';
/**
 * useAbortOnUnmount
 *
 * Returns a stable AbortSignal that fires when the component unmounts.
 * Use this signal in fetch/axios calls to automatically cancel in-flight
 * requests, preventing the classic "can't update state on unmounted
 * component" memory leak.
 *
 * Usage:
 *   const signal = useAbortOnUnmount();
 *   useEffect(() => {
 *     dedupGet('/patients', {}, signal).then(setPatients);
 *   }, [signal]);
 *
 * Sprint 6 perf target: eliminate all "state update on unmounted component"
 * warnings — measured via React DevTools Profiler.
 */

import { useEffect, useRef } from 'react';

export function useAbortOnUnmount(): AbortSignal {
  const controllerRef = useRef<AbortController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new AbortController();
  }

  useEffect(() => {
    const ctrl = controllerRef.current!;
    return () => {
      ctrl.abort();
      // Reset so next mount gets a fresh controller
      controllerRef.current = new AbortController();
    };
  }, []);

  return controllerRef.current.signal;
}
