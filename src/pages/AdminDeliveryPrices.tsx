import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useDeliveryLocationIndex } from '../hooks/useDeliveryData';
import {
  DELIVERY_GROUPS,
  DELIVERY_REGIONS,
  deliveryRegionById,
  deliveryRegionLabel,
  deliveryRegionPrice,
  normalizeDeliveryPrice,
  type DeliveryLocation,
  type DeliveryRegion,
} from '../lib/delivery/deliveryAreas';
import {
  fetchDeliveryPriceSettings,
  saveDeliveryPriceSettings,
  type DeliveryPriceSettingsInfo,
} from '../lib/delivery/deliveryPriceService';
import { checkoutErrorCode, formatOrderDateTime, formatOrderMoney } from '../lib/orders';
import DeliveryLocationPicker from '../components/orders/DeliveryLocationPicker';
import { cn } from '../lib/utils';

type Drafts = { regions: Record<string, string>; places: Record<string, string> };

function draftsFrom(settings: DeliveryPriceSettingsInfo): Drafts {
  return {
    regions: Object.fromEntries(DELIVERY_REGIONS.map((region) => [region.id, String(deliveryRegionPrice(region.id, settings))])),
    places: Object.fromEntries(Object.entries(settings.locationPrices).map(([id, price]) => [id, String(price)])),
  };
}

const priceInputClass =
  'h-9 w-24 rounded-md border bg-white px-2 text-end text-sm tabular-nums text-gray-900 outline-none transition focus:ring-2 disabled:opacity-60';

/**
 * Admin → Delivery prices. Every region has a price; a town or neighbourhood uses its
 * region's price unless it is given its own. Saved to Firestore site_settings/
 * delivery_prices (owner-only by the existing rules) and picked up by checkout live.
 */
const AdminDeliveryPrices = () => {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const locations = useDeliveryLocationIndex(true);
  const [loaded, setLoaded] = useState<DeliveryPriceSettingsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({ regions: {}, places: {} });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const settings = await fetchDeliveryPriceSettings();
      setLoaded(settings);
      setDrafts(draftsFrom(settings));
    } catch (error) {
      console.error('Delivery prices could not be loaded:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const placeCountByRegion = useMemo(() => {
    const counts = new Map<string, number>();
    for (const location of locations.index?.locations ?? []) counts.set(location.regionId, (counts.get(location.regionId) ?? 0) + 1);
    return counts;
  }, [locations.index]);

  const regionDirty = (region: DeliveryRegion) =>
    !!loaded && normalizeDeliveryPrice(drafts.regions[region.id]) !== deliveryRegionPrice(region.id, loaded);
  const regionInvalid = (region: DeliveryRegion) => normalizeDeliveryPrice(drafts.regions[region.id]) === null;
  const placeInvalid = (id: string) => normalizeDeliveryPrice(drafts.places[id]) === null;

  const dirty = useMemo(() => {
    if (!loaded) return false;
    if (DELIVERY_REGIONS.some((region) => normalizeDeliveryPrice(drafts.regions[region.id]) !== deliveryRegionPrice(region.id, loaded))) return true;
    const ids = new Set([...Object.keys(drafts.places), ...Object.keys(loaded.locationPrices)]);
    return [...ids].some((id) => normalizeDeliveryPrice(drafts.places[id]) !== (loaded.locationPrices[id] ?? null));
  }, [drafts, loaded]);

  const invalid =
    DELIVERY_REGIONS.some((region) => normalizeDeliveryPrice(drafts.regions[region.id]) === null) ||
    Object.keys(drafts.places).some((id) => normalizeDeliveryPrice(drafts.places[id]) === null);

  /** A region's price as currently typed (falls back to the saved one while a box is being edited). */
  const draftRegionPrice = useCallback(
    (regionId: string) => normalizeDeliveryPrice(drafts.regions[regionId]) ?? deliveryRegionPrice(regionId, loaded),
    [drafts.regions, loaded]
  );
  const draftPlacePrice = useCallback(
    (location: DeliveryLocation) =>
      drafts.places[location.id] !== undefined
        ? normalizeDeliveryPrice(drafts.places[location.id])
        : draftRegionPrice(location.regionId),
    [drafts.places, draftRegionPrice]
  );

  const ownPricePlaces = useMemo(
    () =>
      Object.keys(drafts.places)
        .map((id) => locations.index?.byId.get(id) ?? ({ id, nameAr: id, regionId: '' } as DeliveryLocation))
        .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar')),
    [drafts.places, locations.index]
  );
  const ownPriceIds = useMemo(() => new Set(Object.keys(drafts.places)), [drafts.places]);

  const setRegion = (regionId: string, value: string) =>
    setDrafts((prev) => ({ ...prev, regions: { ...prev.regions, [regionId]: value } }));
  const setPlace = (locationId: string, value: string) =>
    setDrafts((prev) => ({ ...prev, places: { ...prev.places, [locationId]: value } }));
  const addPlace = (locationId: string) => {
    const location = locations.index?.byId.get(locationId);
    if (!location || drafts.places[locationId] !== undefined) return;
    setPlace(locationId, String(draftRegionPrice(location.regionId) ?? ''));
  };
  const removePlace = (locationId: string) =>
    setDrafts((prev) => {
      const places = { ...prev.places };
      delete places[locationId];
      return { ...prev, places };
    });

  const save = async () => {
    if (!user || !loaded || !dirty || invalid || saving) return;
    setSaving(true);
    try {
      await saveDeliveryPriceSettings(
        {
          regionPrices: Object.fromEntries(DELIVERY_REGIONS.map((region) => [region.id, normalizeDeliveryPrice(drafts.regions[region.id]) as number])),
          locationPrices: Object.fromEntries(Object.keys(drafts.places).map((id) => [id, normalizeDeliveryPrice(drafts.places[id]) as number])),
        },
        { uid: user.uid, name: user.displayName || user.email || null }
      );
      toast.success(t('admin.deliveryPrices.saved'));
      await load(); // show what the server now holds
    } catch (error) {
      console.error('Delivery prices could not be saved:', error);
      const code = checkoutErrorCode(error);
      toast.error(t(code === 'permission-denied' ? 'admin.deliveryPrices.permissionDenied' : 'admin.deliveryPrices.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const lastSaved = loaded?.updatedAt
    ? loaded.updatedByName
      ? t('admin.deliveryPrices.lastSaved').replace('{date}', formatOrderDateTime(loaded.updatedAt, locale)).replace('{name}', loaded.updatedByName)
      : t('admin.deliveryPrices.lastSavedNoName').replace('{date}', formatOrderDateTime(loaded.updatedAt, locale))
    : t('admin.deliveryPrices.neverSaved');

  const priceBox = (
    id: string,
    value: string,
    onChange: (value: string) => void,
    isInvalid: boolean,
    label: string,
    testId: string
  ) => (
    <span className="inline-flex items-center gap-1" dir="ltr">
      <span className="text-xs text-gray-400" aria-hidden>
        ₪
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={isInvalid || undefined}
        className={cn(
          priceInputClass,
          isInvalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-catchy focus:ring-catchy/20'
        )}
        data-testid={testId}
      />
    </span>
  );

  return (
    <div className="min-w-0 pb-4" dir={isRTL ? 'rtl' : 'ltr'} data-testid="admin-delivery-prices">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{t('admin.deliveryPrices.heading')}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{t('admin.deliveryPrices.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            {t('admin.common.refresh')}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500" data-testid="delivery-prices-last-saved">
          {lastSaved} · {t('admin.deliveryPrices.ordersNote')}
        </p>
      </header>

      {!loaded ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
          {loadFailed ? (
            <>
              <span className="text-red-600">{t('admin.deliveryPrices.loadFailed')}</span>
              <button type="button" onClick={() => void load()} className="font-medium text-catchy underline">
                {t('admin.deliveryPrices.retry')}
              </button>
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('admin.common.loading')}
            </>
          )}
        </div>
      ) : (
        <>
          {DELIVERY_GROUPS.map((group) => {
            const regions = DELIVERY_REGIONS.filter((region) => region.groupId === group.id);
            if (!regions.length) return null;
            return (
              <section key={group.id} className="mt-5" data-testid={`delivery-group-${group.id}`}>
                <h2 className="mb-2 text-sm font-semibold text-gray-900">{deliveryRegionLabel(group, language)}</h2>
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  <table className="w-full text-start text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                        <th className="px-4 py-2 text-start font-medium">{t('admin.deliveryPrices.colRegion')}</th>
                        <th className="hidden px-4 py-2 text-end font-medium sm:table-cell">{t('admin.deliveryPrices.colPlaces')}</th>
                        <th className="px-4 py-2 text-end font-medium">{t('admin.deliveryPrices.colPrice')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {regions.map((region) => {
                        const label = deliveryRegionLabel(region, language);
                        const other = language === 'ar' ? region.nameEn : region.nameAr;
                        const current = draftRegionPrice(region.id);
                        return (
                          <tr key={region.id} className={cn(regionDirty(region) && 'bg-amber-50/60')} data-testid={`delivery-region-${region.id}`}>
                            <td className="px-4 py-2">
                              <p className="font-medium text-gray-900">
                                {label}
                                {regionDirty(region) ? (
                                  <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                    {t('admin.deliveryPrices.changed')}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-gray-500">
                                {other}
                                {current !== region.defaultPrice ? (
                                  <span className="ms-2 text-gray-400">
                                    {t('admin.deliveryPrices.startingPrice').replace('{price}', formatOrderMoney(region.defaultPrice))}
                                  </span>
                                ) : null}
                              </p>
                            </td>
                            <td className="hidden px-4 py-2 text-end tabular-nums text-gray-600 sm:table-cell">
                              {placeCountByRegion.get(region.id) ?? '…'}
                            </td>
                            <td className="px-4 py-2 text-end">
                              {priceBox(
                                `delivery-price-${region.id}`,
                                drafts.regions[region.id] ?? '',
                                (value) => setRegion(region.id, value),
                                regionInvalid(region),
                                `${t('admin.deliveryPrices.colPrice')} ${label}`,
                                `delivery-region-price-${region.id}`
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <section className="mt-6" data-testid="delivery-own-prices">
            <h2 className="text-sm font-semibold text-gray-900">{t('admin.deliveryPrices.placesHeading')}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t('admin.deliveryPrices.placesHint')}</p>
            <div className="mt-2 max-w-xl">
              <DeliveryLocationPicker
                value=""
                onChange={addPlace}
                index={locations.index}
                loadFailed={locations.error}
                onRetry={locations.retry}
                priceFor={draftPlacePrice}
                exclude={ownPriceIds}
                placeholder={t('admin.deliveryPrices.addPlacePlaceholder')}
                testId="admin-place-search"
              />
            </div>
            <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
              {ownPricePlaces.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">{t('admin.deliveryPrices.noPlaces')}</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {ownPricePlaces.map((location) => {
                    const region = deliveryRegionById(location.regionId);
                    const regionPrice = region ? draftRegionPrice(region.id) : null;
                    return (
                      <li key={location.id} className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid={`delivery-place-${location.id}`}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-900 font-arabic">{location.nameAr}</p>
                          <p className="truncate text-xs text-gray-500">
                            {deliveryRegionLabel(region, language)}
                            {regionPrice !== null ? (
                              <span className="ms-2 text-gray-400">
                                {t('admin.deliveryPrices.regionPrice').replace('{price}', formatOrderMoney(regionPrice))}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        {priceBox(
                          `delivery-place-price-${location.id}`,
                          drafts.places[location.id] ?? '',
                          (value) => setPlace(location.id, value),
                          placeInvalid(location.id),
                          `${t('admin.deliveryPrices.colPrice')} ${location.nameAr}`,
                          `delivery-place-price-${location.id}`
                        )}
                        <button
                          type="button"
                          onClick={() => removePlace(location.id)}
                          disabled={saving}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                          data-testid={`delivery-place-remove-${location.id}`}
                        >
                          <X size={12} aria-hidden />
                          {t('admin.deliveryPrices.removePlace')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
            <p className={cn('me-auto text-xs', dirty ? 'font-medium text-amber-700' : 'text-gray-500')} data-testid="delivery-prices-status">
              {dirty ? t('admin.deliveryPrices.unsaved') : t('admin.deliveryPrices.allSaved')}
            </p>
            {invalid ? (
              <p className="text-xs text-red-600" data-testid="delivery-prices-invalid">
                {t('admin.deliveryPrices.invalid')}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setDrafts(draftsFrom(loaded))}
              disabled={!dirty || saving}
              className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {t('admin.deliveryPrices.discard')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || invalid || saving}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-catchy px-4 text-xs font-semibold text-white transition hover:bg-catchy-dark disabled:opacity-50"
              data-testid="delivery-prices-save"
            >
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              {t('admin.deliveryPrices.save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDeliveryPrices;
