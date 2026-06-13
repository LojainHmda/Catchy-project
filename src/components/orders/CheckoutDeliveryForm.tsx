import React, { useEffect, useState } from 'react';
import { MapPin, Phone, User, Mail, Truck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { DeliveryFormValues } from '../../lib/orders';
import { formatOrderMoney } from '../../lib/orders';
import { SHIPPING_ZONES } from '../../lib/shippingZones';
import { cn } from '../../lib/utils';

type CheckoutDeliveryFormProps = {
  values: DeliveryFormValues;
  onChange: (values: DeliveryFormValues) => void;
  showEmail?: boolean;
  isSignedIn?: boolean;
  showAllErrors?: boolean;
  fieldErrors?: Partial<Record<keyof DeliveryFormValues, string>>;
  /** Inside modal — hide duplicate heading and outer card chrome. */
  embedded?: boolean;
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
}) => {
  const errors: Partial<Record<keyof DeliveryFormValues, string>> = fieldErrors ?? {};
  const { t, isRTL } = useLanguage();
  const [touched, setTouched] = useState<Partial<Record<keyof DeliveryFormValues, boolean>>>({});

  useEffect(() => {
    setTouched({});
  }, [values.customerName, values.customerPhone, values.deliveryAddress, values.deliveryZone, values.email]);

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

  const fieldClass = embedded ? compactInputClass : inputClass;
  const labelClass = cn(
    'mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500',
    isRTL && 'font-arabic'
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
            autoComplete="tel"
            dir="ltr"
            value={values.customerPhone}
            onChange={(e) => setField('customerPhone', e.target.value)}
            onBlur={() => markTouched('customerPhone')}
            placeholder={t('cart.deliveryPhonePlaceholder')}
            className={cn(fieldClass, showError('customerPhone') && 'border-red-300 focus:border-red-400 focus:ring-red-100')}
          />
          {showError('customerPhone') ? (
            <p className={cn('mt-0.5 text-[9px] text-red-600', isRTL && 'font-arabic')}>{errors.customerPhone}</p>
          ) : null}
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>
          <MapPin size={11} />
          {t('cart.deliveryAddress')}
        </span>
        <textarea
          rows={embedded ? 2 : 3}
          autoComplete="street-address"
          value={values.deliveryAddress}
          onChange={(e) => setField('deliveryAddress', e.target.value)}
          onBlur={() => markTouched('deliveryAddress')}
          placeholder={t('cart.deliveryAddressPlaceholder')}
          className={cn(
            fieldClass,
            'resize-none',
            showError('deliveryAddress') && 'border-red-300 focus:border-red-400 focus:ring-red-100',
            isRTL && 'font-arabic text-end'
          )}
        />
        {showError('deliveryAddress') ? (
          <p className={cn('mt-0.5 text-[9px] text-red-600', isRTL && 'font-arabic')}>{errors.deliveryAddress}</p>
        ) : null}
      </label>

      <fieldset className="block min-w-0">
        <legend className={cn('mb-1 flex w-full items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500', isRTL && 'font-arabic')}>
          <Truck size={11} />
          {t('cart.deliveryZone')}
        </legend>
        <div className="grid grid-cols-4 gap-1">
          {SHIPPING_ZONES.map((zone) => {
            const active = values.deliveryZone === zone.id;
            return (
              <label
                key={zone.id}
                className={cn(
                  'relative flex min-w-0 cursor-pointer flex-col items-center gap-0.5 rounded-md border px-0.5 py-1.5 text-center transition',
                  active
                    ? 'border-catchy bg-catchy/5 ring-1 ring-catchy/20'
                    : 'border-gray-200 bg-white hover:border-catchy/40',
                  showError('deliveryZone') && !active && values.deliveryZone === '' && 'border-red-200'
                )}
              >
                <input
                  type="radio"
                  name="deliveryZone"
                  value={zone.id}
                  checked={active}
                  onChange={() => {
                    setField('deliveryZone', zone.id);
                    markTouched('deliveryZone');
                  }}
                  className="sr-only"
                />
                <span className={cn('text-[8px] font-semibold leading-tight text-gray-900', isRTL && 'font-arabic')}>
                  {t(zone.labelKey)}
                </span>
                <span className={cn('text-[8px] font-bold tabular-nums', active ? 'text-catchy' : 'text-gray-500')}>
                  {formatOrderMoney(zone.cost)}
                </span>
              </label>
            );
          })}
        </div>
        {showError('deliveryZone') ? (
          <p className={cn('mt-1 text-[9px] text-red-600', isRTL && 'font-arabic')}>{errors.deliveryZone}</p>
        ) : null}
      </fieldset>

      {showEmail ? (
        <label className="block">
          <span className={labelClass}>
            <Mail size={11} />
            {t('cart.deliveryEmail')}
            <span className="font-normal normal-case tracking-normal text-gray-400">({t('cart.optional')})</span>
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
