import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Loader2 } from 'lucide-react';
import { collection, db, getDocs, limit, orderBy, query } from '../../firebase';
import { formatOrderDateTime, shortOrderId, toDate } from '../../lib/orders';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';

type StockMovement = {
  id: string;
  productName: string | null;
  productId: string;
  colorId: string | null;
  size: string | null;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  reason: string;
  orderId: string | null;
  returnId: string | null;
  actorName: string | null;
  createdAt: Date | null;
};

const LEDGER_LIMIT = 100;

function parseMovement(id: string, d: Record<string, unknown>): StockMovement {
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    id,
    productName: str(d.productName),
    productId: String(d.productId ?? ''),
    colorId: str(d.colorId),
    size: str(d.size),
    qtyBefore: num(d.qtyBefore),
    qtyChange: num(d.qtyChange),
    qtyAfter: num(d.qtyAfter),
    reason: String(d.reason ?? ''),
    orderId: str(d.orderId),
    returnId: str(d.returnId),
    actorName: str(d.actorName),
    createdAt: toDate(d.createdAt),
  };
}

/**
 * Read-only view of the `stockMovements` ledger (owner-readable, written only by
 * the server in the same transaction as the stock change). Loaded on demand.
 */
const StockLedgerPanel: React.FC = () => {
  const { t, language } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || rows !== null) return;
    let cancelled = false;
    getDocs(query(collection(db, 'stockMovements'), orderBy('createdAt', 'desc'), limit(LEDGER_LIMIT)))
      .then((snap) => {
        if (!cancelled) setRows(snap.docs.map((d) => parseMovement(d.id, d.data() as Record<string, unknown>)));
      })
      .catch((err) => {
        console.warn('Stock ledger unavailable:', err);
        if (!cancelled) {
          setError(true);
          setRows([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, rows]);

  return (
    <section className="mt-6 rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <History size={16} className="text-gray-500" />
          {t('admin.stockLedger.title')}
        </span>
        <span className="text-xs text-gray-500">{open ? t('admin.stockLedger.hide') : t('admin.stockLedger.show')}</span>
      </button>
      {open ? (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="mb-2 text-xs text-gray-500">{t('admin.stockLedger.subtitle')}</p>
          {rows === null ? (
            <p className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" />
              {t('admin.common.loading')}
            </p>
          ) : error ? (
            <p className="text-xs text-red-600">{t('admin.stockLedger.loadFailed')}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-500">{t('admin.stockLedger.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-xs">
              {rows.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">
                      {m.productName || m.productId}
                      {m.colorId || m.size ? (
                        <span className="text-gray-500"> · {[m.colorId, m.size].filter(Boolean).join(' / ')}</span>
                      ) : null}
                    </p>
                    <p className="text-gray-500">
                      {t(`admin.stockLedger.reason.${m.reason}`)}
                      {m.orderId ? (
                        <>
                          {' · '}
                          <Link to={`/admin/orders?order=${encodeURIComponent(m.orderId)}`} className="font-mono text-catchy hover:underline">
                            {shortOrderId(m.orderId)}
                          </Link>
                        </>
                      ) : null}
                      {m.returnId ? (
                        <>
                          {' · '}
                          <Link to={`/admin/returns?return=${encodeURIComponent(m.returnId)}`} className="text-catchy hover:underline">
                            {t('admin.stockLedger.viewReturn')}
                          </Link>
                        </>
                      ) : null}
                      {m.actorName ? ` · ${m.actorName}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-end tabular-nums">
                    <p className={cn('font-semibold', m.qtyChange > 0 ? 'text-emerald-700' : 'text-red-700')}>
                      {m.qtyChange > 0 ? `+${m.qtyChange}` : m.qtyChange}
                      <span className="ms-1 font-normal text-gray-500">
                        ({m.qtyBefore} → {m.qtyAfter})
                      </span>
                    </p>
                    <p className="text-gray-400">{formatOrderDateTime(m.createdAt, locale)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default StockLedgerPanel;
