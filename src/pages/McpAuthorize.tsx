import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import { navigateToExternal } from '../lib/externalNavigation';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

/**
 * Consent page for the read-only Catchy MCP server (server/lib/mcp/). claude.ai or ChatGPT
 * sends the store owner here (via /oauth/authorize); the owner signs in and allows or
 * denies. The server checks the owner again and only then issues a code — this page
 * decodes the signed request only to show who is asking.
 */

type PendingRequest = { n?: string; ru?: string; exp?: number };

function decodeRequest(raw: string | null): PendingRequest | null {
  if (!raw || !raw.includes('.')) return null;
  try {
    const body = raw.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(body)))) as PendingRequest;
  } catch {
    return null;
  }
}

const hostOf = (uri?: string) => {
  try {
    return uri ? new URL(uri).host : '';
  } catch {
    return '';
  }
};

const McpAuthorize: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const { user, loading, sessionResolving, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requestToken = new URLSearchParams(location.search).get('req');
  const request = useMemo(() => decodeRequest(requestToken), [requestToken]);
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expired = !request || (typeof request.exp === 'number' && request.exp * 1000 <= Date.now());
  const client = request?.n || 'AI assistant';
  const host = hostOf(request?.ru);

  const answer = async (approve: boolean) => {
    if (!user || busy || !requestToken) return;
    setBusy(approve ? 'allow' : 'deny');
    setError(null);
    try {
      // useAuth().user is a plain profile record (no getIdToken); the ID token comes from
      // the Firebase Auth user, as in the other owner-only API calls (adminOrderApi.ts).
      const current = auth.currentUser;
      if (!current) throw new Error('Not signed in');
      const token = await current.getIdToken();
      const response = await fetch('/oauth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ request: requestToken, approve }),
      });
      const body = (await response.json().catch(() => ({}))) as { redirect?: string; code?: string };
      if (response.ok && body.redirect) {
        navigateToExternal(body.redirect);
        return;
      }
      console.error('[mcp-authorize] approve refused:', response.status, body.code ?? '');
      setError(body.code === 'FORBIDDEN' ? t('mcp.notOwner') : body.code === 'EXPIRED' ? t('mcp.expired') : t('mcp.failed'));
    } catch (err) {
      console.error('[mcp-authorize] approve failed:', err);
      setError(t('mcp.failed'));
    }
    setBusy(null);
  };

  const scopes = [t('mcp.scopeProducts'), t('mcp.scopeOrders'), t('mcp.scopeReports')];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="flex min-h-[70vh] flex-col items-center justify-center bg-gradient-to-b from-neutral-50 to-white px-4 py-14">
      <div className="w-full max-w-[460px] rounded-3xl border border-neutral-200/90 bg-white p-8 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.12)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-catchy text-white shadow-md shadow-catchy/25">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </div>
          <h1 className={cn('text-2xl font-semibold tracking-tight text-catchy-dark', isRTL ? 'font-arabic' : 'font-serif')}>{t('mcp.title')}</h1>
        </div>

        {expired ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('mcp.expired')}</p>
        ) : (
          <>
            <p className="text-center text-[15px] text-catchy-dark">
              {t('mcp.request').replace('{client}', client)}
            </p>
            <p className="mt-4 text-sm font-medium text-catchy-dark/80">{t('mcp.canRead')}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-catchy-dark/70">
              {scopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium text-catchy">{t('mcp.cannotChange')}</p>
            {host ? <p className="mt-3 text-xs text-catchy-dark/50">{t('mcp.redirectNote').replace('{host}', host)}</p> : null}

            {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-6">
              {loading || sessionResolving ? (
                <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-catchy" aria-hidden /></div>
              ) : user ? (
                <>
                  <p className="mb-3 text-center text-xs text-catchy-dark/60">{t('mcp.signedInAs').replace('{email}', user.email ?? '')}</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => answer(false)}
                      disabled={!!busy}
                      className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-catchy-dark transition hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {busy === 'deny' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden /> : t('mcp.deny')}
                    </button>
                    <button
                      type="button"
                      onClick={() => answer(true)}
                      disabled={!!busy}
                      className="flex-1 rounded-xl bg-catchy py-3 text-sm font-semibold text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark disabled:opacity-60"
                    >
                      {busy === 'allow' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden /> : t('mcp.allow')}
                    </button>
                  </div>
                  <button type="button" onClick={() => void logout()} className="mt-4 w-full text-center text-xs text-catchy-dark/50 underline">
                    {t('mcp.switchAccount')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/login', { state: { returnTo: `${location.pathname}${location.search}` } })}
                  className="w-full rounded-xl bg-catchy py-3 text-sm font-semibold text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark"
                >
                  {t('mcp.signIn')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default McpAuthorize;
