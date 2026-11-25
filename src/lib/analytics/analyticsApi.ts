import { auth } from '../../firebase';

/** Thrown for any failed analytics request; `status` 401/403 means "not an authorized owner". */
export class AnalyticsApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new AnalyticsApiError(401, 'NOT_SIGNED_IN', 'Not signed in.');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || data?.ok !== true) {
    throw new AnalyticsApiError(res.status, String(data?.code ?? 'UNKNOWN'), String(data?.message ?? `Request failed (${res.status}).`));
  }
  return data as T;
}

export type LiveResponse = { live: number; windowMinutes: number; approximate: true; at: string };

export type AnalyticsSummary = {
  from: string;
  to: string;
  trackingSince: string | null;
  hasData: boolean;
  totals: { pageViews: number; sessions: number; productViews: number; uniqueVisitors: number; uniqueVisitorsApproximate: boolean };
  days: { day: string; pageViews: number; sessions: number; visitors: number; productViews: number }[];
  months: { month: string; days: number; pageViews: number; sessions: number; productViews: number; uniqueVisitors: number; uniqueVisitorsApproximate: true }[];
  topProducts: { id: string; name: string | null; views: number }[];
  productTrend: { productIds: string[]; days: { day: string; total: number; byProduct: Record<string, number> }[] };
  topPages: { page: string; views: number }[];
  sources: { channel: string; sessions: number }[];
  referrers: { host: string; sessions: number }[];
};

export const fetchLiveVisitors = () => post<LiveResponse>('/api/admin/analytics/live', {});
export const fetchAnalyticsSummary = (from: string, to: string) => post<AnalyticsSummary>('/api/admin/analytics/summary', { from, to });
