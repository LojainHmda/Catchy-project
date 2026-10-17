import { useCallback, useEffect, useState } from 'react';
import { db, doc, onSnapshot } from '../firebase';
import { closeRegisterSession, openRegisterSession } from '../lib/pos/posApi';
import type { RegisterSession } from '../types/pos';

const STORAGE_KEY = 'pos_session_id';

function toDateOrNull(value: unknown): Date | null {
  const maybe = value as { toDate?: () => Date } | null | undefined;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate();
  return null;
}

function parseSessionDoc(id: string, data: Record<string, unknown>): RegisterSession {
  return {
    id,
    cashierUid: String(data.cashierUid ?? ''),
    cashierEmail: typeof data.cashierEmail === 'string' ? data.cashierEmail : null,
    cashierName: typeof data.cashierName === 'string' ? data.cashierName : null,
    status: data.status === 'closed' ? 'closed' : 'open',
    openedAt: toDateOrNull(data.openedAt),
    closedAt: toDateOrNull(data.closedAt),
    openingCashFloat: Number(data.openingCashFloat) || 0,
    expectedCashAtClose: data.expectedCashAtClose == null ? null : Number(data.expectedCashAtClose),
    countedCashAtClose: data.countedCashAtClose == null ? null : Number(data.countedCashAtClose),
    cashVarianceAtClose: data.cashVarianceAtClose == null ? null : Number(data.cashVarianceAtClose),
    salesCount: Number(data.salesCount) || 0,
    cashTotal: Number(data.cashTotal) || 0,
    cardTotal: Number(data.cardTotal) || 0,
    discountTotal: Number(data.discountTotal) || 0,
    grossTotal: Number(data.grossTotal) || 0,
    notes: typeof data.notes === 'string' ? data.notes : null,
  };
}

/**
 * Tracks the cashier's active register session: caches the session id in
 * localStorage so a page refresh resumes instead of losing it, and keeps the
 * live totals in sync via onSnapshot while a sale is in progress.
 */
export function usePosSession() {
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [session, setSession] = useState<RegisterSession | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'register_sessions', sessionId),
      (snap) => {
        if (!snap.exists()) {
          setSession(null);
          localStorage.removeItem(STORAGE_KEY);
          setSessionId(null);
        } else {
          const parsed = parseSessionDoc(snap.id, snap.data() as Record<string, unknown>);
          setSession(parsed.status === 'open' ? parsed : null);
          if (parsed.status !== 'open') localStorage.removeItem(STORAGE_KEY);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [sessionId]);

  const open = useCallback(async (openingCashFloat: number) => {
    setOpening(true);
    setError(null);
    try {
      const opened = await openRegisterSession(openingCashFloat);
      localStorage.setItem(STORAGE_KEY, opened.id);
      setSessionId(opened.id);
      setSession(opened.status === 'open' ? opened : null);
      return opened;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the register.');
      throw err;
    } finally {
      setOpening(false);
    }
  }, []);

  const close = useCallback(
    async (countedCashAtClose: number, notes?: string) => {
      if (!sessionId) throw new Error('No open register session.');
      const closed = await closeRegisterSession(sessionId, countedCashAtClose, notes);
      localStorage.removeItem(STORAGE_KEY);
      setSessionId(null);
      setSession(null);
      return closed;
    },
    [sessionId]
  );

  return { session, loading, opening, error, open, close };
}
