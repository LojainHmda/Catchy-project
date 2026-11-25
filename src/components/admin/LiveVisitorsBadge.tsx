import { useCallback, useEffect, useState } from 'react';
import { Eye, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AnalyticsApiError, fetchLiveVisitors } from '../../lib/analytics/analyticsApi';
import { cn } from '../../lib/utils';

const POLL_MS = 30_000;
const HIDDEN_KEY = 'catchy.admin.liveVisitors.hidden';

const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Floating live-visitor count for owners, on every page. The UI gate (role) only decides
 * whether to ask; the server's owner check decides whether there is anything to show — a
 * 401/403 removes the badge entirely.
 */
export default function LiveVisitorsBadge() {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const [hidden, setHidden] = useState(readHidden);
  const [live, setLive] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'denied'>('loading');
  const eligible = Boolean(user) && role === 'admin';

  const refresh = useCallback(async () => {
    try {
      const res = await fetchLiveVisitors();
      setLive(res.live);
      setState('ok');
    } catch (err) {
      setState(err instanceof AnalyticsApiError && (err.status === 401 || err.status === 403) ? 'denied' : 'error');
    }
  }, []);

  useEffect(() => {
    if (!eligible) return;
    void refresh(); // also when hidden: confirms the account is an authorized owner
    if (hidden) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [eligible, hidden, refresh]);

  const setHiddenPersisted = (value: boolean) => {
    setHidden(value);
    try {
      localStorage.setItem(HIDDEN_KEY, value ? '1' : '0');
    } catch {
      /* preference just won't persist */
    }
  };

  if (!eligible || state === 'denied') return null;

  const position = 'fixed bottom-20 start-4 z-[60] sm:bottom-4';
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHiddenPersisted(false)}
        className={cn(position, 'flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-500 shadow-md backdrop-blur hover:text-catchy-dark')}
        title={t('admin.liveVisitors.show')}
        aria-label={t('admin.liveVisitors.show')}
      >
        <Eye className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <div
      className={cn(position, 'flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 py-1.5 ps-3 pe-1.5 text-xs text-gray-700 shadow-lg backdrop-blur')}
      role="status"
      aria-live="polite"
      title={t('admin.liveVisitors.tooltip')}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60', state === 'ok' && live ? 'animate-ping bg-emerald-400' : '')} />
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', state === 'ok' ? 'bg-emerald-500' : 'bg-gray-300')} />
      </span>
      <Users className="h-4 w-4 text-gray-500" aria-hidden />
      <span className="font-semibold tabular-nums text-gray-900">
        {state === 'ok' && live !== null ? `≈ ${live}` : state === 'error' ? '—' : '…'}
      </span>
      <span className="text-gray-500">{t('admin.liveVisitors.label')}</span>
      <button
        type="button"
        onClick={() => setHiddenPersisted(true)}
        className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        title={t('admin.liveVisitors.hide')}
        aria-label={t('admin.liveVisitors.hide')}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
