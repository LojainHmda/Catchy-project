import React, { useEffect, useState } from 'react';
import { MapPin, Phone, User, Mail, Truck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { DeliveryFormValues } from '../../lib/orders';
import { hasWrongMobilePrefix } from '../../lib/orders/deliveryDetails';
import type { DeliveryLocation, DeliveryLocationIndex } from '../../lib/delivery/deliveryAreas';
import { cn } from '../../lib/utils';
import DeliveryLocationPicker from './DeliveryLocationPicker';

type CheckoutDeliveryFormProps = {
  values: DeliveryFormValues;
  onChange: (values: DeliveryFormValues) => void;
  showEmail?: boolean;
  isSignedIn?: boolean;
  showAllErrors?: boolean;
  fieldErrors?: Partial<Record<keyof DeliveryFormValues, string>>;
  /** Inside modal — hide duplicate heading and outer card chrome. */
  embedded?: boolean;
  /** Catchy's delivery places (null while the list loads). */
  locationIndex: DeliveryLocationIndex | null;
  locationsLoadFailed?: boolean;
  onRetryLocations?: () => void;
  /** Current delivery price of a place (null while prices load). */
  priceForLocation?: (location: DeliveryLocation) => number | null;
};

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-catchy focus:ring-2 focus:ring-catchy/15';

const compactInputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-catchy focus:ring-2 focus:ring-catchy/15';

const CheckoutDeliveryForm: React.FC<CheckoutDeliveryFormProps> = ({
  values,
  onChange,
  showEmail = true,
  isSignedIn = false,
  showAllErrors = false,
  fieldErrors,
  embedded = false,
  locationIndex,
  locationsLoadFailed = false,
  onRetryLocations,
  priceForLocation,
}) => {
  const errors: Partial<Record<keyof DeliveryFormValues, string>> = fieldErrors ?? {};
  const { t, isRTL } = useLanguage();
  const [touched, setTouched] = useState<Partial<Record<keyof DeliveryFormValues, boolean>>>({});

  useEffect(() => {
    setTouched({});
  }, [values.customerName, values.customerPhone, values.deliveryAddress, values.deliveryLocationId, values.email]);

  const setField = (field: keyof DeliveryFormValues, value: string) => {
    onChange({ ...values, [field]: value });
  };

  const markTouched = (field: keyof DeliveryFormValues) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const showError = (field: keyof DeliveryFormValues) => {
    const message = errors[field];
    return Boolean(message && (showAllErrors || touched[field]));
  };

  // Mobile numbers must start with 05: say so as soon as the first two digits are wrong,
  // without waiting for the customer to leave the field (the number is never changed).
  const phoneError = hasWrongMobilePrefix(values.customerPhone)
    ? t('cart.deliveryPhoneMustStart05')
    : showError('customerPhone')
      ? errors.customerPhone
      : null;

  const fieldClass = embedded ? compactInputClass : inputClass;
  const labelClass = cn(
    'mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500',
    isRTL && 'font-arabic'
  );
  const optionalTag = (
    <span className="font-normal normal-case tracking-normal text-gray-400">({t('cart.optional')})</span>
  );

  return (
    <div className={cn(embedded ? 'space-y-2' : 'space-y-3', !embedded && 'rounded-xl border border-gray-100 bg-gray-50/80 p-3')}>
      {!embedded ? (
        <div>
          <p className={cn('text-[10px] font-black uppercase tracking-[0.2em] text-catchy/70', isRTL && 'font-arabic')}>
            {t('cart.deliveryTitle')}
          </p>
          <p className={cn('mt-1 text-[11px] leading-relaxed text-gray-500', isRTL && 'font-arabic')}>
            {isSignedIn ? t('cart.deliverySubtitleSignedIn') : t('cart.deliverySubtitle')}
          </p>
        </div>
      ) : null}

      <div className={cn(embedded ? 'grid grid-cols-2 gap-2' : 'space-y-3')}>
        <label className="block">
          <span className={labelClass}>
            <User size={11} />
            {t('cart.deliveryName')}
          </span>
          <input
            type="text"
            autoComplete="name"
            value={values.customerName}
            onChange={(e) => setField('customerName', e.target.value)}
            onBlur={() => markTouched('customerName')}
            placeholder={t('cart.deliveryNamePlaceholder')}
            className={cn(fieldClass, showError('customerName') && 'border-red-300 focus:border-red-400 focus:ring-red-100', isRTL && 'font-arabic text-end')}
          />
          {showError('customerName') ? (
            <p className={cn('mt-0.5 text-[9px] text-red-600', isRTL && 'font-arabic')}>{errors.customerName}</p>
          ) : null}
        </label>

        <label className="block">
          <span className={labelClass}>
            <Phone size={11} />
            {t('cart.deliveryPhone')}
          </span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            dir="ltr"
            maxLength={10}
            value={values.customerPhone}
            onChange={(e) => setField('customerPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            onBlur={() => markTouched('customerPhone')}
            placeholder={t('cart.deliveryPhonePlaceholder')}
            aria-invalid={phoneError ? true : undefined}
            className={cn(fieldClass, phoneError && 'border-red-300 focus:border-red-400 focus:ring-red-100')}
            data-testid="checkout-phone"
          />
          {phoneError ? (
            <p className={cn('mt-0.5 text-[9px] text-red-600', isRTL && 'font-arabic')} data-testid="checkout-phone-error">
              {phoneError}
            </p>
          ) : null}
        </label>
      </div>

      {/* Delivery place: chosen from Catchy's list (required). */}
      <div className="block" data-testid="checkout-delivery-place">
        <span id="checkout-delivery-place-label" className={labelClass}>
          <Truck size={11} />
          {t('cart.deliveryZone')}
        </span>
        <DeliveryLocationPicker
          labelledBy="checkout-delivery-place-label"
          value={values.deliveryLocationId}
          onChange={(locationId) => setField('deliveryLocationId', locationId)}
          onBlur={() => markTouched('deliveryLocationId')}
          index={locationIndex}
          loadFailed={locationsLoadFailed}
          onRetry={onRetryLocations}
          priceFor={priceForLocation}
          invalid={showError('deliveryLocationId')}
          compact={embedded}
        />
        {showError('deliveryLocationId') ? (
          <p className={cn('mt-0.5 text-[9px] text-red-600', isRTL && 'font-arabic')} data-testid="checkout-delivery-place-error">
            {errors.deliveryLocationId}
          </p>
        ) : (
          <p className={cn('mt-0.5 text-[9px] text-gray-400', isRTL && 'font-arabic')}>{t('cart.deliveryLocationHint')}</p>
        )}
      </div>

      {/* Street, building, house number, directions: optional, never required. */}
      <label className="block">
        <span className={labelClass}>
          <MapPin size={11} />
          {t('cart.deliveryAddressDetails')}
          {optionalTag}
        </span>
        <textarea
          rows={2}
          autoComplete="street-address"
          value={values.deliveryAddress}
          onChange={(e) => setField('deliveryAddress', e.target.value)}
          onBlur={() => markTouched('deliveryAddress')}
          placeholder={t('cart.deliveryAddressDetailsPlaceholder')}
          className={cn(fieldClass, 'resize-none', isRTL && 'font-arabic text-end')}
          data-testid="checkout-address-details"
        />
      </label>

      {showEmail ? (
        <label className="block">
          <span className={labelClass}>
            <Mail size={11} />
            {t('cart.deliveryEmail')}
            {optionalTag}
          </span>
          <input
            type="email"
            autoComplete="email"
            dir="ltr"
            value={values.email}
            onChange={(e) => setField('email', e.target.value)}
            onBlur={() => markTouched('email')}
            placeholder={t('cart.deliveryEmailPlaceholder')}
            className={cn(fieldClass, showError('email') && 'border-red-300 focus:border-red-400 focus:ring-red-100')}
          />
          {showError('email') ? (
            <p className={cn('mt-0.5 text-[9px] text-red-600', isRTL && 'font-arabic')}>{errors.email}</p>
          ) : null}
        </label>
      ) : null}
    </div>
  );
};

export default CheckoutDeliveryForm;
