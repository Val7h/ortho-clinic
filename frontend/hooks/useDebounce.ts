'use client';
import { useEffect, useState } from 'react';

/**
 * useDebounce
 * Returns a debounced copy of `value` after `delay` ms (default 180ms).
 * Kept well under 200ms to satisfy the search latency requirement.
 */
export function useDebounce<T>(value: T, delay = 180): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
