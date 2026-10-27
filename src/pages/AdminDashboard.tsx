import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { db, collection, getDocs, query, where, orderBy, limit, addDoc, serverTimestamp, doc, getDoc, setDoc, getCountFromServer, getAggregateFromServer, sum } from '../firebase';
import { Package, ShoppingCart, TrendingUp, ArrowUpRight, ArrowDownRight, Database, Loader2, Megaphone, CheckCircle2, Clock, AlertTriangle, BarChart3, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { CANCELLED_ORDER_STATUS, type OrderRecord } from '../types/order';
import { formatOrderDate, formatOrderMoney, parseOrderDocument, shortOrderId } from '../lib/orders';
import OrderStatusBadge from '../components/orders/OrderStatusBadge';
import { usePendingOrdersCount } from '../hooks/usePendingOrdersCount';
import {
  LOW_STOCK_THRESHOLD,
  computeDashboardOrderStats,
  dashboardOrdersWindow,
  findLowStockProducts,
  type LowStockProduct,
  type Trend,
} from '../lib/admin/dashboardStats';

const LOW_STOCK_SHOWN = 8;

const FONT_OPTIONS = [
  { label: 'Inter',        value: 'Inter, sans-serif' },
  { label: 'Bodoni Moda', value: '"Bodoni Moda", serif' },
  { label: 'Cairo',        value: 'Cairo, sans-serif' },
  { label: 'Sans-Serif',   value: 'sans-serif' },
  { label: 'Serif',        value: 'serif' },
  { label: 'Monospace',    value: 'monospace' },
];

const AdminDashboard = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    users: 0,
    revenue: 0
  });
  const [recentOrders, setRecentOrders] = useState<OrderRecord[]>([]);
  const [windowOrders, setWindowOrders] = useState<OrderRecord[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [tickerEnabled, setTickerEnabled] = useState(true);
  const [tickerLoading, setTickerLoading] = useState(true);
  const [tickerSaving, setTickerSaving] = useState(false);
  const [bannerText, setBannerText] = useState('   ◆   عروض وتخفيضات   ◆   Offers & Discounts');
  const [bannerBgColor, setBannerBgColor] = useState('#0a150c');
  const [bannerTextColor, setBannerTextColor] = useState('#ffffff');
  const [bannerFontSize, setBannerFontSize] = useState(10);
  const [bannerFontFamily, setBannerFontFamily] = useState('Inter, sans-serif');
  const [bannerSaving, setBannerSaving] = useState(false);
  const { loading: authLoading, role } = useAuth();
  const pendingCount = usePendingOrdersCount(!authLoading && role === 'admin');
  const orderStats = useMemo(() => computeDashboardOrderStats(windowOrders), [windowOrders]);

  useEffect(() => {
    getDoc(doc(db, 'site_settings', 'site'))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setTickerEnabled(d.tickerBannerEnabled !== false);
          if (d.tickerBannerText) setBannerText(d.tickerBannerText);
          if (d.tickerBannerBackgroundColor) setBannerBgColor(d.tickerBannerBackgroundColor);
          if (d.tickerBannerTextColor) setBannerTextColor(d.tickerBannerTextColor);
          if (d.tickerBannerFontSize) setBannerFontSize(Number(d.tickerBannerFontSize));
          if (d.tickerBannerFontFamily) setBannerFontFamily(d.tickerBannerFontFamily);
        }
      })
      .finally(() => setTickerLoading(false));
  }, []);

  const handleTickerToggle = async () => {
    const next = !tickerEnabled;
    setTickerSaving(true);
    try {
      await setDoc(doc(db, 'site_settings', 'site'), { tickerBannerEnabled: next }, { merge: true });
      setTickerEnabled(next);
      toast.success(next ? t('admin.dashboard.toastBannerEnabled') : t('admin.dashboard.toastBannerHidden'));
    } catch {
      toast.error(t('admin.dashboard.toastSettingFailed'));
    } finally {
      setTickerSaving(false);
    }
  };

  const handleBannerSave = async () => {
    setBannerSaving(true);
    try {
      await setDoc(
        doc(db, 'site_settings', 'site'),
        {
          tickerBannerText: bannerText,
          tickerBannerBackgroundColor: bannerBgColor,
          tickerBannerTextColor: bannerTextColor,
          tickerBannerFontSize: bannerFontSize,
          tickerBannerFontFamily: bannerFontFamily,
        },
        { merge: true }
      );
      toast.success(t('admin.dashboard.toastBannerSaved'));
    } catch {
      toast.error(t('admin.dashboard.toastBannerSaveFailed'));
    } finally {
      setBannerSaving(false);
    }
  };

  const seedData = async () => {
    setIsSeeding(true);
    const dummyProducts = [
      {
        name: "Emerald Silk Evening Gown",
        price: 245,
        category: "Dresses",
        description: "A stunning emerald green silk gown with a deep V-neck and elegant floor-length silhouette. Perfect for high-end evening events.",
        images: ["https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&q=80&w=1000"],
        stock: 12,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Midnight Velvet Blazer",
        price: 185,
        category: "Jackets",
        description: "Sophisticated midnight blue velvet blazer with satin lapels. Part of our signature evening set collection.",
        images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=1000"],
        stock: 8,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Ivory Lace Cocktail Dress",
        price: 195,
        category: "Dresses",
        description: "Delicate ivory lace overlay with a silk lining. Features a modern midi length and intricate floral patterns.",
        images: ["https://images.unsplash.com/photo-1539008835279-434674508233?auto=format&fit=crop&q=80&w=1000"],
        stock: 15,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Golden Hour Satin Set",
        price: 165,
        category: "Formal Sets",
        description: "Two-piece satin set in a warm golden hue. Includes a cropped top and high-waisted wide-leg trousers.",
        images: ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000"],
        stock: 5,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Pearl Embellished Top",
        price: 85,
        category: "Tops",
        description: "Elegant sheer top with hand-sewn pearl embellishments along the neckline and cuffs.",
        images: ["https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&q=80&w=1000"],
        stock: 20,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Onyx Leather Mini Skirt",
        price: 125,
        category: "Skirts",
        description: "Premium black leather mini skirt with a subtle gloss finish and silver hardware details.",
        images: ["https://images.unsplash.com/photo-1548624149-f9b1859aa700?auto=format&fit=crop&q=80&w=1000"],
        stock: 10,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Tailored Wool Trousers",
        price: 145,
        category: "Pants",
        description: "High-waisted tailored wool trousers in charcoal grey. Features a sharp crease and slim fit.",
        images: ["https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&q=80&w=1000"],
        stock: 15,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      {
        name: "Silk Coordinate Set",
        price: 210,
        category: "Coordinates",
        description: "Matching silk shirt and trousers set with a custom geometric print. Effortless luxury.",
        images: ["https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=1000"],
        stock: 7,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    ];

    const dummyHeroSlides = [
      {
        title: 'hero.slide1.title',
        subtitle: 'hero.slide1.subtitle',
        url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000',
        order: 0,
        type: 'standard' as const,
        enabled: true,
        createdAt: serverTimestamp(),
      },
      {
        title: 'hero.slide2.title',
        subtitle: 'hero.slide2.subtitle',
        url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e12?auto=format&fit=crop&q=80&w=1000',
        order: 1,
        type: 'standard' as const,
        enabled: true,
        createdAt: serverTimestamp(),
      },
      {
        title: 'hero.slide3.title',
        subtitle: 'hero.slide3.subtitle',
        url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1000',
        order: 2,
        type: 'standard' as const,
        enabled: true,
        createdAt: serverTimestamp(),
      },
      {
        title: 'hero.slide4.title',
        subtitle: 'hero.slide4.subtitle',
        url: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=80&w=1000',
        order: 3,
        type: 'standard' as const,
        enabled: true,
        createdAt: serverTimestamp(),
      },
    ];

    try {
      for (const product of dummyProducts) {
        await addDoc(collection(db, 'products'), product);
      }
      for (const slide of dummyHeroSlides) {
        await addDoc(collection(db, 'hero_slides'), slide);
      }
      toast.success(t('admin.dashboard.toastSeeded'), {
        description: t('admin.dashboard.toastSeededDesc'),
      });
      window.location.reload();
    } catch (error) {
      console.error('Error seeding data:', error);
      toast.error(t('admin.dashboard.toastSeedFailed'), {
        description: error instanceof Error ? error.message : t('admin.dashboard.toastSeedFailedDesc'),
      });
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (role !== 'admin') {
      setLoading(false);
      return;
    }
    const fetchStats = async () => {
      try {
        // Server-side aggregation — only the count/sum numbers cross the wire,
        // not every product/order/user document (was 3 full-collection reads).
        // Orders count stays a plain, unfiltered count (every order ever
        // placed, cancelled included — same "Total Orders" meaning as before
        // and as AdminOrders.tsx's own count) — only revenue changes meaning.
        //
        // Revenue excludes cancelled orders (see CANCELLED_ORDER_STATUS), but
        // NOT via a status-filtered `sum('total')` aggregate: verified live
        // against the real project that Firestore requires a brand-new
        // composite index for *any* status-filtered sum aggregate (`==` or
        // `!=` alike) — a plain unfiltered sum, as used today, does not need
        // one, and this task's boundaries don't allow publishing a new index
        // without separate approval. Instead: take the existing unfiltered
        // sum (no index needed) and subtract the cancelled subset's total,
        // fetched via a plain equality-filtered document query — a basic
        // single-field-equality query, already covered by Firestore's
        // automatic per-field index, so this also needs no new index. The
        // extra read cost is bounded by how many orders are cancelled, not by
        // the size of the whole collection.
        // Each part loads independently so one failure (e.g. missing permission)
        // shows a visible error instead of silently zeroing every figure.
        const errors: string[] = [];
        const ordersWindow = dashboardOrdersWindow();
        const [countsResult, windowResult, recentResult, productsResult] = await Promise.allSettled([
          Promise.all([
            getCountFromServer(collection(db, 'products')),
            getCountFromServer(collection(db, 'users')),
            getCountFromServer(collection(db, 'orders')),
            getAggregateFromServer(collection(db, 'orders'), { revenue: sum('total') }),
            getDocs(query(collection(db, 'orders'), where('status', '==', CANCELLED_ORDER_STATUS))),
          ]),
          // Last 60 days only (single-field range on createdAt → automatic index) for today + 30-day trends.
          getDocs(
            query(collection(db, 'orders'), where('createdAt', '>=', ordersWindow.start!), orderBy('createdAt', 'desc'))
          ),
          getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5))),
          getDocs(collection(db, 'products')),
        ]);

        if (countsResult.status === 'fulfilled') {
          const [productsCountSnap, usersCountSnap, ordersCountSnap, totalRevenueAggSnap, cancelledOrdersSnap] =
            countsResult.value;
          const cancelledRevenue = cancelledOrdersSnap.docs.reduce(
            (total, docSnap) => total + (Number(docSnap.data().total) || 0),
            0
          );
          setStats({
            products: productsCountSnap.data().count,
            orders: ordersCountSnap.data().count,
            users: usersCountSnap.data().count,
            revenue: (totalRevenueAggSnap.data().revenue || 0) - cancelledRevenue,
          });
        } else {
          console.error('Dashboard counts failed:', countsResult.reason);
          errors.push('counts');
        }

        if (windowResult.status === 'fulfilled') {
          setWindowOrders(windowResult.value.docs.map((d) => parseOrderDocument(d.id, d.data() as Record<string, unknown>)));
        } else {
          console.error('Dashboard order window failed:', windowResult.reason);
          errors.push('orders');
        }

        if (recentResult.status === 'fulfilled') {
          setRecentOrders(recentResult.value.docs.map((d) => parseOrderDocument(d.id, d.data() as Record<string, unknown>)));
        } else {
          console.error('Recent orders failed:', recentResult.reason);
          errors.push('recent');
        }

        if (productsResult.status === 'fulfilled') {
          setLowStock(
            findLowStockProducts(
              productsResult.value.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
            )
          );
        } else {
          console.error('Low stock scan failed:', productsResult.reason);
          errors.push('products');
        }

        setLoadErrors(errors);
      } catch (error) {
        console.error('Error fetching stats:', error);
        setLoadErrors(['unknown']);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [authLoading, role]);

  const formatTrend = (trend: Trend) =>
    trend.changePct === null
      ? t('admin.dashboard.noBaseline')
      : `${trend.changePct > 0 ? '+' : ''}${trend.changePct.toLocaleString(locale)}%`;

  const trendCards = [
    {
      label: t('admin.dashboard.statBooked30'),
      value: formatOrderMoney(orderStats.last30.bookedRevenue.current, locale),
      trend: orderStats.last30.bookedRevenue,
      icon: TrendingUp,
      color: 'bg-emerald-500',
      path: '/admin/reports',
    },
    {
      label: t('admin.dashboard.statFulfilled30'),
      value: formatOrderMoney(orderStats.last30.fulfilledRevenue.current, locale),
      trend: orderStats.last30.fulfilledRevenue,
      icon: CheckCircle2,
      color: 'bg-teal-500',
      path: '/admin/reports',
    },
    {
      label: t('admin.dashboard.statOrders30'),
      value: orderStats.last30.orders.current.toLocaleString(locale),
      trend: orderStats.last30.orders,
      icon: ShoppingCart,
      color: 'bg-blue-500',
      path: '/admin/orders',
    },
  ];

  const secondaryStats = [
    { label: t('admin.dashboard.statAllTimeBooked'), value: formatOrderMoney(stats.revenue, locale), path: '/admin/reports' },
    { label: t('admin.dashboard.statAllOrders'), value: stats.orders.toLocaleString(locale), path: '/admin/orders' },
    { label: t('admin.dashboard.statProducts'), value: stats.products.toLocaleString(locale), path: '/admin/products' },
    { label: t('admin.dashboard.statAccounts'), value: stats.users.toLocaleString(locale), path: '/admin/customers' },
  ];

  const cellLabel = (cell: LowStockProduct['lowCells'][number]) => {
    const color = language === 'ar' ? cell.colorAr || cell.color : cell.color;
    return [color, cell.size].filter(Boolean).join(' / ') || t('admin.dashboard.cellTotal');
  };

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8 md:space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl md:text-4xl">
            {t('admin.dashboard.title')}
          </h1>
          <p className="text-sm font-medium text-gray-500 sm:text-base">
            {t('admin.dashboard.welcome')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Link
            to="/admin/reports"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-800 transition-all hover:bg-gray-50 sm:w-auto touch-manipulation min-h-[48px]"
          >
            <BarChart3 size={18} />
            {t('admin.dashboard.openReports')}
          </Link>
          {/* Demo seeding writes sample products into the live catalog — local development only. */}
          {import.meta.env.DEV ? (
            <button
              type="button"
              onClick={seedData}
              disabled={isSeeding}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#4ba673] px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-[#4ba673]/20 transition-all hover:bg-[#3d8a5f] disabled:opacity-50 sm:w-auto sm:px-6 touch-manipulation min-h-[48px]"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
              {isSeeding ? t('admin.dashboard.seeding') : t('admin.dashboard.seedButton')}
            </button>
          ) : null}
        </div>
      </header>

      {loadErrors.length > 0 ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>{t('admin.dashboard.loadError')}</p>
        </div>
      ) : null}

      {/* Today */}
      <section aria-label={t('admin.dashboard.today')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          to="/admin/orders?status=pending"
          className="flex min-w-0 items-center gap-4 rounded-2xl border border-orange-100 bg-orange-50 p-4 transition hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
            <Clock size={20} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-widest text-orange-700">{t('admin.dashboard.pendingToHandle')}</span>
            <span className="block text-2xl font-black tabular-nums text-orange-900">{pendingCount ?? '—'}</span>
          </span>
        </Link>
        <div className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4">
          <span className="block text-xs font-bold uppercase tracking-widest text-gray-500">{t('admin.dashboard.todayOrders')}</span>
          <span className="block text-2xl font-black tabular-nums text-gray-900">{loading ? '—' : orderStats.today.orders}</span>
          <span className="block text-xs text-gray-500">
            {t('admin.dashboard.todayChannels').replace('{web}', String(orderStats.today.web)).replace('{pos}', String(orderStats.today.pos))}
          </span>
        </div>
        <div className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4">
          <span className="block text-xs font-bold uppercase tracking-widest text-gray-500">{t('admin.dashboard.todayBooked')}</span>
          <span className="block truncate text-2xl font-black tabular-nums text-gray-900">
            {loading ? '—' : formatOrderMoney(orderStats.today.booked, locale)}
          </span>
        </div>
      </section>

      {/* Last 30 days vs the 30 before — real comparisons from order data */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {trendCards.map((stat, i) => {
          const pct = stat.trend.changePct;
          const tone = pct === null || pct === 0 ? 'neutral' : pct > 0 ? 'up' : 'down';
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Link
                to={stat.path}
                className="block min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-xl sm:p-6"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg', stat.color)}>
                    <stat.icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black',
                      tone === 'up' && 'bg-emerald-50 text-emerald-600',
                      tone === 'down' && 'bg-red-50 text-red-600',
                      tone === 'neutral' && 'bg-gray-100 text-gray-500'
                    )}
                    title={t('admin.dashboard.vsPrevious')}
                  >
                    {tone === 'up' ? <ArrowUpRight size={14} /> : tone === 'down' ? <ArrowDownRight size={14} /> : <Minus size={14} />}
                    {loading ? '—' : formatTrend(stat.trend)}
                  </div>
                </div>
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">{stat.label}</p>
                <h3 className="truncate text-2xl font-black text-gray-900 sm:text-3xl">{loading ? '—' : stat.value}</h3>
                <p className="mt-1 text-xs text-gray-400">{t('admin.dashboard.vsPrevious')}</p>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {secondaryStats.map((stat) => (
          <Link key={stat.label} to={stat.path} className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 transition hover:shadow-md">
            <dt className="text-xs font-bold uppercase tracking-widest text-gray-500">{stat.label}</dt>
            <dd className="truncate text-lg font-black tabular-nums text-gray-900">{loading ? '—' : stat.value}</dd>
          </Link>
        ))}
      </dl>

      {/* Site Settings — Ticker Banner Editor */}
      <div className="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 md:p-8">
        <h2 className="mb-6 text-xl font-black tracking-tight text-gray-900 sm:text-2xl">{t('admin.dashboard.siteSettings')}</h2>

        {/* Toggle row */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0a150c] text-white">
              <Megaphone size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">{t('admin.dashboard.tickerBanner')}</p>
              <p className="text-xs font-medium text-gray-400">{t('admin.dashboard.tickerBannerDesc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400">{tickerEnabled ? t('admin.dashboard.visible') : t('coordinates.hiddenBadge')}</span>
            <button
              type="button"
              disabled={tickerLoading || tickerSaving}
              onClick={handleTickerToggle}
              className={cn(
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                tickerEnabled ? 'bg-catchy' : 'bg-gray-200'
              )}
              aria-label={t('admin.dashboard.toggleTicker')}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
                  tickerEnabled ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        </div>

        {/* Live Preview */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t('coordinates.livePreview')}</p>
          <div
            className="overflow-hidden rounded-xl py-2.5 text-center"
            style={{
              backgroundColor: bannerBgColor,
              color: bannerTextColor,
              fontSize: `${bannerFontSize}px`,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontWeight: 300,
              fontFamily: bannerFontFamily,
            }}
          >
            {bannerText || t('admin.dashboard.previewPlaceholder')}
          </div>
        </div>

        <div className="space-y-5">
          {/* Banner text */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-gray-500">
              {t('admin.dashboard.bannerTextLabel')}
            </label>
            <input
              type="text"
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder="  ◆  عروض وتخفيضات  ◆  Offers & Discounts"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:border-catchy focus:outline-none focus:ring-1 focus:ring-catchy"
            />
            <p className="mt-1 text-[11px] text-gray-400">{t('admin.dashboard.bannerTextHint')}</p>
          </div>

          {/* Color + font size row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Background color */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-gray-500">
                {t('admin.dashboard.bgColorLabel')}
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2">
                <input
                  type="color"
                  value={bannerBgColor}
                  onChange={(e) => setBannerBgColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  title={t('admin.dashboard.pickBgColor')}
                />
                <span className="font-mono text-xs text-gray-500">{bannerBgColor}</span>
              </div>
            </div>

            {/* Text color */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-gray-500">
                {t('admin.dashboard.textColorLabel')}
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2">
                <input
                  type="color"
                  value={bannerTextColor}
                  onChange={(e) => setBannerTextColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  title={t('admin.dashboard.pickTextColor')}
                />
                <span className="font-mono text-xs text-gray-500">{bannerTextColor}</span>
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-black uppercase tracking-widest text-gray-500">
                {t('admin.dashboard.fontSizeLabel')}
                <span className="ms-1 font-mono text-catchy">{bannerFontSize}px</span>
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3">
                <span className="text-[9px] font-bold text-gray-400">A</span>
                <input
                  type="range"
                  min={9}
                  max={16}
                  step={1}
                  value={bannerFontSize}
                  onChange={(e) => setBannerFontSize(Number(e.target.value))}
                  className="flex-1 cursor-pointer accent-catchy"
                />
                <span className="text-xs font-bold text-gray-400">A</span>
              </div>
            </div>
          </div>

          {/* Font family */}
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-500">
              {t('admin.dashboard.fontFamilyLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBannerFontFamily(opt.value)}
                  style={{ fontFamily: opt.value }}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-sm transition-all',
                    bannerFontFamily === opt.value
                      ? 'border-catchy bg-catchy text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-catchy hover:text-catchy'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleBannerSave}
              disabled={bannerSaving}
              className="flex items-center gap-2 rounded-2xl bg-catchy px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-catchy/20 transition-all hover:bg-catchy-dark disabled:opacity-50"
            >
              {bannerSaving ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} />}
              {bannerSaving ? t('admin.products.form.saving') : t('admin.dashboard.saveBannerButton')}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-10">
        <div className="min-w-0 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6 md:p-8">
            <h2 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">{t('admin.dashboard.recentOrders')}</h2>
            <Link
              to="/admin/orders"
              className="self-start text-sm font-bold text-catchy hover:underline sm:self-auto touch-manipulation min-h-[44px] px-1 inline-flex items-center"
            >
              {t('admin.dashboard.viewAll')}
            </Link>
          </div>

          {/* Mobile: stacked cards */}
          <div className="divide-y divide-gray-50 md:hidden">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <Link key={order.id} to={`/admin/orders?order=${order.id}`} className="block space-y-2 p-4 hover:bg-gray-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-gray-500">{shortOrderId(order.id)}</span>
                    <OrderStatusBadge status={order.status} needsReview={order.statusNeedsReview} rawStatus={order.rawStatus} showDot={false} className="px-2 py-0.5" />
                  </div>
                  <p className="truncate text-sm font-medium text-gray-700">
                    {order.customerName || order.customerEmail || t('admin.orders.detail.guest')}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-black text-gray-900">{formatOrderMoney(order.total, locale)}</span>
                    <span className="text-xs text-gray-400">{formatOrderDate(order.createdAt, locale)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="p-8 text-center text-sm font-medium text-gray-400">{t('admin.dashboard.noRecentOrders')}</p>
            )}
          </div>

          {/* md+: table */}
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full min-w-0 text-start text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-xs font-black uppercase tracking-widest text-gray-400">
                  <th className="px-4 py-4 md:px-8 md:py-5">{t('admin.dashboard.colOrderId')}</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">{t('admin.orders.detail.customer')}</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">{t('admin.common.status')}</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">{t('admin.common.total')}</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">{t('admin.common.date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.length > 0 ? (
                  recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      tabIndex={0}
                      onClick={() => navigate(`/admin/orders?order=${order.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/admin/orders?order=${order.id}`);
                      }}
                      className="cursor-pointer transition-colors hover:bg-gray-50/50 focus:bg-gray-50 focus:outline-none"
                    >
                      <td className="px-4 py-4 font-mono font-bold text-gray-900 md:px-8 md:py-6">{shortOrderId(order.id)}</td>
                      <td className="max-w-[10rem] px-4 py-4 md:max-w-none md:px-8 md:py-6">
                        <p className="truncate font-medium text-gray-700">
                          {order.customerName || t('admin.orders.detail.guest')}
                        </p>
                        {order.customerPhone || order.customerEmail ? (
                          <p className="truncate text-xs text-gray-400">{order.customerPhone || order.customerEmail}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 md:px-8 md:py-6">
                        <OrderStatusBadge status={order.status} needsReview={order.statusNeedsReview} rawStatus={order.rawStatus} showDot={false} className="px-2 py-0.5" />
                      </td>
                      <td className="px-4 py-4 font-black text-gray-900 md:px-8 md:py-6">{formatOrderMoney(order.total, locale)}</td>
                      <td className="px-4 py-4 font-medium text-gray-400 md:px-8 md:py-6">{formatOrderDate(order.createdAt, locale)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-8 py-16 text-center font-medium text-gray-400 md:py-20">
                      {t('admin.dashboard.noRecentOrders')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 md:p-8">
          <h2 className="mb-6 text-xl font-black tracking-tight text-gray-900 sm:text-2xl">{t('admin.dashboard.inventoryAlerts')}</h2>
          <div className="space-y-4">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" /> {t('admin.common.loading')}
              </p>
            ) : loadErrors.includes('products') ? (
              <p className="text-sm font-medium text-red-700">{t('admin.dashboard.lowStockUnavailable')}</p>
            ) : lowStock.length === 0 ? (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 size={18} aria-hidden />
                {t('admin.dashboard.noLowStock').replace('{threshold}', String(LOW_STOCK_THRESHOLD))}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-3 sm:p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
                    <Package size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-orange-900">{t('admin.dashboard.lowStockAlert')}</h4>
                    <p className="text-sm font-medium text-orange-700">
                      {t('admin.dashboard.lowStockSummary')
                        .replace('{n}', String(lowStock.length))
                        .replace('{threshold}', String(LOW_STOCK_THRESHOLD))}
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-gray-100">
                  {lowStock.slice(0, LOW_STOCK_SHOWN).map((product) => (
                    <li key={product.id} className="py-2.5">
                      <p className="truncate text-sm font-bold text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">
                        {product.lowCells.slice(0, 4).map((cell, i) => (
                          <span key={i} className={cn('me-2 inline-block', cell.quantity === 0 ? 'text-red-600' : 'text-orange-700')}>
                            {cellLabel(cell)}:{' '}
                            {cell.quantity === 0
                              ? t('admin.dashboard.soldOut')
                              : t('admin.dashboard.unitsLeft').replace('{n}', String(cell.quantity))}
                          </span>
                        ))}
                        {product.lowCells.length > 4 ? <span>+{product.lowCells.length - 4}</span> : null}
                      </p>
                    </li>
                  ))}
                </ul>
                <Link to="/admin/stock" className="block text-center text-sm font-bold text-catchy hover:underline">
                  {lowStock.length > LOW_STOCK_SHOWN
                    ? t('admin.dashboard.moreLowStock').replace('{n}', String(lowStock.length - LOW_STOCK_SHOWN))
                    : t('admin.dashboard.openStock')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
