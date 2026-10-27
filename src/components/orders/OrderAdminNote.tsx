import React, { useEffect, useState } from 'react';
import { Loader2, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { formatOrderDateTime, updateOrderAdminNote } from '../../lib/orders';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { OrderRecord } from '../../types/order';

type OrderAdminNoteProps = {
  order: OrderRecord;
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
};

/** Internal staff note on an order — stored on the order, never shown to the customer. */
const OrderAdminNote: React.FC<OrderAdminNoteProps> = ({ order, onOrderPatch }) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState(order.adminNote ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(order.adminNote ?? '');
  }, [order.id, order.adminNote]);

  const dirty = draft.trim() !== (order.adminNote ?? '').trim();

  const save = async () => {
    if (!user || !dirty || saving) return;
    setSaving(true);
    try {
      const actor = { uid: user.uid, name: user.displayName || user.email };
      const saved = await updateOrderAdminNote(order.id, draft, actor);
      onOrderPatch(order.id, { adminNote: saved, adminNoteUpdatedAt: new Date(), adminNoteUpdatedByName: actor.name });
      toast.success(t('admin.orders.detail.adminNoteSaved'));
    } catch (error) {
      console.error('Saving admin note failed:', error);
      toast.error(t('admin.orders.detail.adminNoteFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-4">
      <label
        htmlFor={`admin-note-${order.id}`}
        className="mb-1.5 flex items-center gap-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500"
      >
        <StickyNote size={12} />
        {t('admin.orders.detail.adminNote')}
      </label>
      <textarea
        id={`admin-note-${order.id}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        maxLength={2000}
        disabled={saving}
        placeholder={t('admin.orders.detail.adminNoteHint')}
        className="w-full resize-y rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">
          {order.adminNoteUpdatedByName
            ? t('admin.orders.detail.adminNoteUpdatedBy')
                .replace('{name}', order.adminNoteUpdatedByName)
                .replace('{date}', formatOrderDateTime(order.adminNoteUpdatedAt ?? null, language === 'ar' ? 'ar' : 'en-GB'))
            : t('admin.orders.detail.adminNoteHint')}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-xs font-medium text-white disabled:opacity-40"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : null}
          {t('admin.orders.detail.adminNoteSave')}
        </button>
      </div>
    </section>
  );
};

export default OrderAdminNote;
