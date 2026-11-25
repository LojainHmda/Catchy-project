import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  deliveryRegionById,
  deliveryRegionLabel,
  type DeliveryLocation,
  type DeliveryLocationIndex,
} from '../../lib/delivery/deliveryAreas';
import { searchDeliveryLocations } from '../../lib/delivery/locationSearch';
import { formatOrderMoney } from '../../lib/orders';
import { cn } from '../../lib/utils';

const MAX_SUGGESTIONS = 8;

type DeliveryLocationPickerProps = {
  /** Chosen place id ('' = none). */
  value: string;
  onChange: (locationId: string) => void;
  /** The place list; null while it loads. */
  index: DeliveryLocationIndex | null;
  loadFailed?: boolean;
  onRetry?: () => void;
  /** Current delivery price of a place (null = prices not loaded yet). */
  priceFor?: (location: DeliveryLocation) => number | null;
  invalid?: boolean;
  compact?: boolean;
  /** id of the visible label element. */
  labelledBy?: string;
  placeholder?: string;
  /** Places not to suggest (admin: places that already have their own price). */
  exclude?: ReadonlySet<string>;
  onBlur?: () => void;
  testId?: string;
};

/**
 * Search-as-you-type for Catchy's delivery places (towns, villages, neighbourhoods).
 * Arabic spelling variants and diacritics are ignored (see locationSearch.ts); every
 * suggestion shows its region, so places with the same name are easy to tell apart.
 * Only a place from the list can be chosen — free text is never accepted as a place.
 */
const DeliveryLocationPicker: React.FC<DeliveryLocationPickerProps> = ({
  value,
  onChange,
  index,
  loadFailed = false,
  onRetry,
  priceFor,
  invalid = false,
  compact = false,
  labelledBy,
  placeholder,
  exclude,
  onBlur,
  testId = 'delivery-location',
}) => {
  const { t, isRTL, language } = useLanguage();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [refocus, setRefocus] = useState(false);

  const selected = value && index ? index.byId.get(value) ?? null : null;
  const trimmed = query.trim();

  const results = useMemo(() => {
    if (!index || !trimmed) return [];
    const found = searchDeliveryLocations(index.search, trimmed, MAX_SUGGESTIONS + (exclude?.size ?? 0));
    return (exclude ? found.filter((entry) => !exclude.has(entry.location.id)) : found).slice(0, MAX_SUGGESTIONS);
  }, [index, trimmed, exclude]);

  useEffect(() => {
    setActive(0);
  }, [trimmed]);

  // After "Change", put the caret back in the (re-rendered) search box.
  useEffect(() => {
    if (refocus && !selected) {
      inputRef.current?.focus();
      setRefocus(false);
    }
  }, [refocus, selected]);

  const choose = (location: DeliveryLocation) => {
    onChange(location.id);
    setQuery('');
    setOpen(false);
  };

  const showList = open && trimmed.length > 0;
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const textSize = compact ? 'text-xs' : 'text-sm';

  if (selected) {
    const region = deliveryRegionById(selected.regionId);
    const price = priceFor ? priceFor(selected) : null;
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-catchy/40 bg-catchy/5',
          compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
        )}
        data-testid={`${testId}-selected`}
      >
        <MapPin size={14} className="shrink-0 text-catchy" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-semibold text-gray-900 font-arabic', textSize)} data-testid={`${testId}-selected-name`}>
            {selected.nameAr}
          </p>
          <p className={cn('truncate text-[10px] text-gray-500', isRTL && 'font-arabic')} data-testid={`${testId}-selected-region`}>
            {deliveryRegionLabel(region, language)}
          </p>
        </div>
        {priceFor ? (
          price === null ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-gray-400" aria-hidden />
          ) : (
            <span className="shrink-0 text-xs font-bold tabular-nums text-catchy" data-testid={`${testId}-selected-price`}>
              {formatOrderMoney(price)}
            </span>
          )
        ) : null}
        <button
          type="button"
          onClick={() => {
            onChange('');
            setQuery('');
            setRefocus(true);
          }}
          className={cn(
            'shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 transition hover:border-catchy hover:text-catchy',
            isRTL && 'font-arabic'
          )}
          data-testid={`${testId}-change`}
        >
          {t('cart.deliveryLocationChange')}
        </button>
      </div>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (results.length) setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (showList && results[active]) {
        e.preventDefault();
        choose(results[active].location);
      }
    } else if (e.key === 'Escape' && showList) {
      // Close the suggestions only — not the surrounding dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
          aria-labelledby={labelledBy}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          placeholder={placeholder ?? t('cart.deliveryLocationPlaceholder')}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full rounded-lg border bg-white ps-8 pe-3 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-catchy focus:ring-2 focus:ring-catchy/15',
            compact ? 'py-2 text-xs' : 'py-2.5 text-sm',
            invalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200',
            isRTL && 'font-arabic'
          )}
          data-testid={`${testId}-input`}
        />
      </div>

      {loadFailed && !index ? (
        <p className={cn('mt-1 text-[10px] text-red-600', isRTL && 'font-arabic')}>
          {t('cart.deliveryLocationLoadFailed')}{' '}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="font-semibold underline">
              {t('cart.deliveryLocationRetry')}
            </button>
          ) : null}
        </p>
      ) : null}

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          data-testid={`${testId}-options`}
        >
          {!index ? (
            <li role="presentation" className={cn('flex items-center gap-2 px-3 py-2 text-xs text-gray-500', isRTL && 'font-arabic')}>
              <Loader2 size={12} className="animate-spin" aria-hidden />
              {t('cart.deliveryLocationLoading')}
            </li>
          ) : results.length === 0 ? (
            <li role="presentation" className={cn('px-3 py-2 text-xs text-gray-500', isRTL && 'font-arabic')} data-testid={`${testId}-no-match`}>
              {t('cart.deliveryLocationNoMatch')}
            </li>
          ) : (
            results.map((entry, i) => {
              const price = priceFor ? priceFor(entry.location) : null;
              return (
                <li
                  key={entry.location.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // Keep focus in the input so the click lands before blur closes the list.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(entry.location)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2',
                    i === active ? 'bg-catchy/10' : 'hover:bg-gray-50'
                  )}
                  data-testid={`${testId}-option`}
                  data-location-id={entry.location.id}
                >
                  <span className={cn('min-w-0 flex-1 truncate font-medium text-gray-900 font-arabic', textSize)} data-testid={`${testId}-option-name`}>
                    {entry.location.nameAr}
                  </span>
                  <span className={cn('shrink-0 text-[10px] text-gray-500', isRTL && 'font-arabic')} data-testid={`${testId}-option-region`}>
                    {deliveryRegionLabel(entry.region, language)}
                  </span>
                  {price !== null ? (
                    <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-700">{formatOrderMoney(price)}</span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
};

export default DeliveryLocationPicker;
