import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';
import AdminToggle from './AdminToggle';
import {
  ANNOUNCEMENT_DEFAULTS,
  subscribeAnnouncement,
  saveAnnouncement,
  type AnnouncementSettings,
} from '../../lib/announcementBanner';

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0';

const AnnouncementBannerPanel = () => {
  const [form, setForm] = useState<AnnouncementSettings>(ANNOUNCEMENT_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let first = true;
    const unsub = subscribeAnnouncement((settings) => {
      // Only hydrate from the server on the initial load so we don't clobber
      // edits in progress when other tabs/fields write to the same doc.
      if (first) {
        setForm(settings);
        first = false;
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const update = (patch: Partial<AnnouncementSettings>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAnnouncement({
        enabled: form.enabled,
        textAr: form.textAr.trim() || ANNOUNCEMENT_DEFAULTS.textAr,
        textEn: form.textEn.trim() || ANNOUNCEMENT_DEFAULTS.textEn,
      });
      toast.success('Banner updated — live on the site instantly');
    } catch (error) {
      console.error('Failed to save announcement banner:', error);
      toast.error('Could not save banner');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading banner settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-500">Live preview</p>
        {form.enabled ? (
          <div
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-center text-xs tracking-wide text-on-primary"
            dir="rtl"
          >
            <Truck size={14} />
            <span>{form.textAr.trim() || ANNOUNCEMENT_DEFAULTS.textAr}</span>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 py-2 text-center text-xs text-gray-400">
            Banner is hidden — customers won't see it.
          </div>
        )}
      </div>

      {/* Show / hide */}
      <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Show banner</p>
          <p className="text-xs text-gray-500">Toggle the top announcement bar on every page.</p>
        </div>
        <AdminToggle
          checked={form.enabled}
          onChange={(checked) => update({ enabled: checked })}
          aria-label="Show announcement banner"
        />
      </div>

      {/* Text fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Arabic text</label>
          <input
            type="text"
            dir="rtl"
            value={form.textAr}
            onChange={(e) => update({ textAr: e.target.value })}
            placeholder={ANNOUNCEMENT_DEFAULTS.textAr}
            className={INPUT}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">English text</label>
          <input
            type="text"
            dir="ltr"
            value={form.textEn}
            onChange={(e) => update({ textEn: e.target.value })}
            placeholder={ANNOUNCEMENT_DEFAULTS.textEn}
            className={INPUT}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-catchy-dark disabled:opacity-50'
          )}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
};

export default AnnouncementBannerPanel;
