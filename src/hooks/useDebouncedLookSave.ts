import { useCallback, useEffect, useRef } from 'react';
import type { CoordinateLook } from '../types/coordinates';
import { updateCoordinateLook } from '../lib/coordinatesService';

const SAVE_DELAY_MS = 650;

/**
 * Batches per-look field edits and flushes to Firestore after a short delay.
 * Avoids a write on every keystroke (cost + rate limits).
 */
export function useDebouncedLookSave() {
  const pendingRef = useRef<Record<string, Partial<CoordinateLook>>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savingRef = useRef<Set<string>>(new Set());
  const onSavingChangeRef = useRef<(id: string, saving: boolean) => void>(() => {});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  const setSavingListener = useCallback((fn: (id: string, saving: boolean) => void) => {
    onSavingChangeRef.current = fn;
  }, []);

  const flush = useCallback(async (id: string) => {
    const patch = pendingRef.current[id];
    if (!patch || Object.keys(patch).length === 0) return;

    delete pendingRef.current[id];
    savingRef.current.add(id);
    onSavingChangeRef.current(id, true);

    try {
      await updateCoordinateLook(id, patch);
    } finally {
      savingRef.current.delete(id);
      onSavingChangeRef.current(id, false);
    }
  }, []);

  const queuePatch = useCallback(
    (id: string, patch: Partial<CoordinateLook>) => {
      pendingRef.current[id] = { ...pendingRef.current[id], ...patch };

      if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => {
        delete timersRef.current[id];
        void flush(id);
      }, SAVE_DELAY_MS);
    },
    [flush]
  );

  const flushNow = useCallback(
    async (id: string) => {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
      await flush(id);
    },
    [flush]
  );

  const flushAll = useCallback(async () => {
    Object.keys(timersRef.current).forEach((id) => {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    });
    const ids = Object.keys(pendingRef.current);
    await Promise.all(ids.map((id) => flush(id)));
  }, [flush]);

  return { queuePatch, flushNow, flushAll, setSavingListener };
}
