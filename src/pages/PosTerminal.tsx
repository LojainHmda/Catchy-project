import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Clock,
  Languages,
  LogOut,
  Loader2,
  Maximize2,
  Minimize2,
  ShoppingBag,
  Sparkles,
  Store,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { usePosSession } from '../hooks/usePosSession';
import { usePosProducts } from '../hooks/usePosProducts';
import { usePosCart } from '../hooks/usePosCart';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import PosCategorySidebar from '../components/pos/PosCategorySidebar';
import PosProductGrid from '../components/pos/PosProductGrid';
import PosVariantPicker from '../components/pos/PosVariantPicker';
import PosCartPanel from '../components/pos/PosCartPanel';
import PosPaymentModal from '../components/pos/PosPaymentModal';
import PosQrScanner from '../components/pos/PosQrScanner';
import PosReceiptView from '../components/pos/PosReceiptView';
import { formatOrderMoney } from '../lib/orders';
import { fetchOrderById } from '../lib/orders';
import { PosApiError, submitPosSale } from '../lib/pos/posApi';
import { emptyDiscountDraft, resolveDiscountAmount, type PosDiscountDraft } from '../lib/pos/posPricing';
import { posProductInStock, type PosCategorySelection } from '../lib/pos/posProduct';
import { parseProductIdFromScan } from '../lib/qr/productQr';
import type { OrderRecord } from '../types/order';
import type { PosPayment } from '../types/pos';

/** Soft radial glow behind the header — the app's signature dark-mode accent, cheap CSS only. */
const AmbientGlow = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(66,170,119,0.16),transparent_70%)]"
  />
);

/** Live clock — a real, self-contained ticking display (no fake data). */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 30);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Real browser Fullscreen API — useful for a kiosk-style POS tablet, no backend involved. */
function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  return { isFullscreen, toggle };
}

const PosTerminal: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const now = useClock();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const { visibleCategories } = useStoreCategories();
  const { session, loading: sessionLoading, opening, error: sessionError, open } = usePosSession();
  const { products, loading: productsLoading } = usePosProducts();
  const cart = usePosCart();

  const [openingFloatInput, setOpeningFloatInput] = useState('0');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<PosCategorySelection>({ kind: 'all' });
  const [picker, setPicker] = useState<{ productId: string; colorId: string | null } | null>(null);
  const [discount, setDiscount] = useState<PosDiscountDraft>(emptyDiscountDraft());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<OrderRecord | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);

  const pickerProduct = picker ? products.find((p) => p.id === picker.productId) ?? null : null;
  const dateLocale = language === 'ar' ? 'ar-u-nu-latn' : 'en-GB';

  const handleScan = (code: string) => {
    // Scanners that read both symbologies can hand us either a plain barcode value
    // or (for a QR code) a full product URL / bare id — try the id/URL form first,
    // since it's an unambiguous exact match (same as a camera QR scan) even if the
    // matched product happens to be out of stock right now.
    const scannedId = parseProductIdFromScan(code);
    const idMatch = scannedId ? products.find((p) => p.id === scannedId) : null;
    if (idMatch) {
      setPicker({ productId: idMatch.id, colorId: null });
      return;
    }

    // A printed barcode encodes either the admin-entered value or, when none was
    // set, the product's own id (see productBarcodeValue) — check both.
    const match = products.find((p) => (p.barcode && p.barcode === code) || p.id === code);
    if (!match || !posProductInStock(match)) {
      setSearch(code);
      return;
    }
    setPicker({ productId: match.id, colorId: null });
  };

  const handleQrScan = (text: string) => {
    const id = parseProductIdFromScan(text);
    if (!id) {
      toast.error(t('pos.qr.invalidCode'));
      return;
    }
    const match = products.find((p) => p.id === id);
    if (!match) {
      toast.error(t('pos.qr.notFound'));
      return;
    }
    // A QR code is an exact product-id match (unlike a barcode, which can be ambiguous),
    // so even an out-of-stock match is worth opening — the picker shows why it can't be added.
    setPicker({ productId: match.id, colorId: null });
  };

  useBarcodeScanner(handleScan, { enabled: !!session && !paymentOpen && !completedOrder && !qrScannerOpen });

  if (sessionLoading) {
    return (
      <div dir="ltr" className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-7 w-7 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
        className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 p-6 ${isRTL ? 'font-arabic' : ''}`}
      >
        <AmbientGlow />
        <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-900/80 p-7 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-catchy to-catchy-dark text-white shadow-lg shadow-catchy/30">
              <Store size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">{t('pos.openRegister.title')}</h1>
            <p className="mt-1.5 text-sm text-neutral-400">{t('pos.openRegister.subtitle')}</p>
          </div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">
            {t('pos.openRegister.floatLabel')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={openingFloatInput}
            onChange={(e) => setOpeningFloatInput(e.target.value)}
            className="mb-4 h-14 w-full rounded-2xl border border-white/10 bg-neutral-800/80 px-4 text-lg font-semibold text-white outline-none transition focus:border-catchy/50 focus:ring-2 focus:ring-catchy/20"
          />
          {sessionError ? <p className="mb-3 text-sm font-medium text-rose-400">{sessionError}</p> : null}
          <button
            type="button"
            onClick={() => open(parseFloat(openingFloatInput) || 0)}
            disabled={opening}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('pos.openRegister.button')}
          </button>
          <button
            type="button"
            onClick={logout}
            className="mt-4 w-full text-center text-xs font-medium text-neutral-500 transition hover:text-rose-400"
          >
            {t('pos.signOut')}
          </button>
        </div>
      </div>
    );
  }

  if (completedOrder) {
    return (
      <div dir="ltr" className="flex h-screen flex-col bg-neutral-950">
        <PosReceiptView
          order={completedOrder}
          onNewSale={() => {
            setCompletedOrder(null);
          }}
        />
      </div>
    );
  }

  const totalDue = Math.max(0, cart.subtotal - resolveDiscountAmount(discount, cart.subtotal));

  const confirmPayment = async (payment: PosPayment) => {
    setSubmitting(true);
    setSaleError(null);
    try {
      const discountInput =
        discount.enabled && resolveDiscountAmount(discount, cart.subtotal) > 0
          ? { mode: discount.mode, value: parseFloat(discount.value) || 0, reason: discount.reason || null }
          : null;
      const result = await submitPosSale({
        registerSessionId: session.id,
        items: cart.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          size: i.size ?? null,
          colorId: i.colorId ?? null,
          colorName: i.colorName ?? null,
          image: i.image,
        })),
        discount: discountInput,
        payment,
      });
      const order = await fetchOrderById(result.orderId);
      setPaymentOpen(false);
      cart.clear();
      setDiscount(emptyDiscountDraft());
      setSearch('');
      setSelection({ kind: 'all' });
      setMobileCartOpen(false);
      if (order) setCompletedOrder(order);
    } catch (err) {
      setSaleError(err instanceof PosApiError ? err.message : t('pos.sale.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  const initials = (user?.displayName || user?.email || 'C').trim().charAt(0).toUpperCase();

  const cartPanel = (
    <PosCartPanel
      items={cart.items}
      subtotal={cart.subtotal}
      discount={discount}
      onDiscountChange={setDiscount}
      onChangeQty={cart.changeQty}
      onRemoveItem={cart.removeItem}
      onClear={() => {
        cart.clear();
        setDiscount(emptyDiscountDraft());
      }}
      onCharge={() => {
        setSaleError(null);
        setPaymentOpen(true);
      }}
      onCloseMobile={() => setMobileCartOpen(false)}
    />
  );

  // The chrome (header + main 3-panel arrangement) keeps fixed physical positions
  // regardless of language — only the text/content inside each panel mirrors for
  // Arabic. This matches real POS hardware where cashiers rely on muscle memory
  // for where the cart/checkout/categories live, independent of language.
  return (
    <div dir="ltr" className="relative flex h-screen flex-col overflow-hidden bg-neutral-950">
      <AmbientGlow />
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/8 bg-neutral-900/70 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-300 ring-1 ring-white/10">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-white">
              {user?.displayName || user?.email}
            </p>
            <p className={`text-[11px] leading-tight text-neutral-500 ${isRTL ? 'font-arabic' : ''}`}>
              {t('pos.cashierLabel')}
            </p>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-catchy to-catchy-dark text-xs font-bold text-white shadow-md shadow-catchy/25">
            C
          </div>
          <p className="hidden items-center gap-1 text-sm font-black tracking-wide text-white sm:flex">
            CATCHY <span className="font-bold text-catchy">POS</span>
            <Sparkles size={12} className="text-catchy/70" />
          </p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 rounded-xl border border-white/8 bg-neutral-800/50 px-3 py-1.5 text-xs font-medium text-neutral-400 md:flex">
            <Clock size={13} />
            <span dir="ltr">
              {now.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
              {now.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/10 bg-neutral-800/60 px-2.5 text-xs font-bold text-neutral-300 transition hover:border-catchy/40 hover:text-catchy active:scale-[0.95]"
            aria-label={t('pos.header.language')}
          >
            <Languages size={14} />
            {language === 'en' ? 'ع' : 'EN'}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="hidden h-8 w-8 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-white/5 hover:text-white sm:inline-flex"
            aria-label={isFullscreen ? t('pos.header.fullscreenExit') : t('pos.header.fullscreenEnter')}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={() => navigate('/pos/close')}
            className="rounded-xl border border-white/10 bg-neutral-800/60 px-2 py-1.5 text-[11px] font-semibold text-neutral-300 transition hover:border-catchy/40 hover:text-catchy active:scale-[0.97] sm:px-3 sm:text-xs"
          >
            {t('pos.closeRegisterButton')}
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-rose-500/10 hover:text-rose-400"
            aria-label={t('pos.signOut')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:flex-row">
        <PosCategorySidebar
          categories={visibleCategories}
          selection={selection}
          onSelect={setSelection}
          className="order-first shrink-0 lg:order-last"
        />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="hidden lg:block lg:h-auto lg:w-full lg:max-w-sm lg:shrink-0">{cartPanel}</div>
          <div className="min-h-0 min-w-0 flex-1 pb-[4.5rem] lg:pb-0">
            <PosProductGrid
              products={products}
              loading={productsLoading}
              search={search}
              onSearchChange={setSearch}
              selection={selection}
              onQuickAdd={(item) => cart.addItem(item)}
              onOpenPicker={(productId, colorId) => setPicker({ productId, colorId })}
              onScanQr={() => setQrScannerOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Mobile / tablet-portrait: cart lives behind a floating bar instead of a fixed column. */}
      {!mobileCartOpen ? (
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark px-4 py-3.5 text-white shadow-lg shadow-catchy/30 transition active:scale-[0.98] lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingBag size={18} />
            {cart.itemCount}
          </span>
          <span className="text-sm font-black tabular-nums">{formatOrderMoney(totalDue)}</span>
        </button>
      ) : (
        <div className="fixed inset-0 z-40 lg:hidden">{cartPanel}</div>
      )}

      {pickerProduct ? (
        <PosVariantPicker
          product={pickerProduct}
          initialColorId={picker?.colorId ?? null}
          onAdd={(item) => cart.addItem(item)}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {paymentOpen ? (
        <PosPaymentModal
          total={totalDue}
          submitting={submitting}
          error={saleError}
          onConfirm={confirmPayment}
          onClose={() => !submitting && setPaymentOpen(false)}
        />
      ) : null}

      {qrScannerOpen ? <PosQrScanner onScan={handleQrScan} onClose={() => setQrScannerOpen(false)} /> : null}
    </div>
  );
};

export default PosTerminal;
