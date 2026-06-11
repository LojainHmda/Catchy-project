import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { db, collection, getDocs, query, orderBy, limit, addDoc, serverTimestamp, doc, getDoc, setDoc } from '../firebase';
import { Package, ShoppingCart, Users, TrendingUp, ArrowUpRight, ArrowDownRight, Database, Loader2, Image as ImageIcon, Megaphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

const FONT_OPTIONS = [
  { label: 'Inter',        value: 'Inter, sans-serif' },
  { label: 'Bodoni Moda', value: '"Bodoni Moda", serif' },
  { label: 'Cairo',        value: 'Cairo, sans-serif' },
  { label: 'Sans-Serif',   value: 'sans-serif' },
  { label: 'Serif',        value: 'serif' },
  { label: 'Monospace',    value: 'monospace' },
];

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    users: 0,
    revenue: 0
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
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
      toast.success(next ? 'Banner enabled' : 'Banner hidden');
    } catch {
      toast.error('Failed to save setting');
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
      toast.success('Banner settings saved — changes are live instantly');
    } catch {
      toast.error('Failed to save banner settings');
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
      toast.success('Firestore seeded', {
        description: 'Sample products and hero slides were added. Reloading…',
      });
      window.location.reload();
    } catch (error) {
      console.error('Error seeding data:', error);
      toast.error('Could not seed Firestore', {
        description: error instanceof Error ? error.message : 'Deploy security rules and sign in as an admin.',
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
        const [productsSnap, ordersSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'orders')),
          getDocs(collection(db, 'users'))
        ]);

        const orders = ordersSnap.docs.map(doc => doc.data());
        const totalRevenue = orders.reduce((acc, curr) => acc + (curr.total || 0), 0);

        setStats({
          products: productsSnap.size,
          orders: ordersSnap.size,
          users: usersSnap.size,
          revenue: totalRevenue,
        });

        try {
          const recentQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5));
          const recentSnap = await getDocs(recentQ);
          setRecentOrders(recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (recentErr) {
          console.warn('Recent orders query failed (ok if no orders yet):', recentErr);
          setRecentOrders([]);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [authLoading, role]);

  const statCards = [
    { label: 'Total Revenue', value: `ILS ${stats.revenue.toLocaleString()}`, icon: TrendingUp, color: 'bg-emerald-500', trend: '+12.5%', isUp: true },
    { label: 'Total Orders', value: stats.orders, icon: ShoppingCart, color: 'bg-blue-500', trend: '+5.2%', isUp: true, path: '/admin/orders' },
    { label: 'Total Products', value: stats.products, icon: Package, color: 'bg-purple-500', trend: '-2.1%', isUp: false, path: '/admin/products' },
    { label: 'Total Customers', value: stats.users, icon: Users, color: 'bg-orange-500', trend: '+8.4%', isUp: true, path: '/admin/customers' },
    { label: 'Hero Reels', value: 'Manage', icon: ImageIcon, color: 'bg-pink-500', trend: 'Live', isUp: true, path: '/admin/hero' },
  ];

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8 md:space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="mb-2 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl md:text-4xl">
            Dashboard Overview
          </h1>
          <p className="text-sm font-medium text-gray-500 sm:text-base">
            Welcome back! Here&apos;s what&apos;s happening with Catchy Clothing today.
          </p>
        </div>
        <button
          type="button"
          onClick={seedData}
          disabled={isSeeding}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#4ba673] px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-[#4ba673]/20 transition-all hover:bg-[#3d8a5f] disabled:opacity-50 sm:w-auto sm:px-6 touch-manipulation min-h-[48px]"
        >
          {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
          {isSeeding ? 'Seeding...' : 'Seed Sample Data'}
        </button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:gap-8 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link
              to={stat.path || '#'}
              className="block min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-xl group sm:p-6 md:p-8"
            >
              <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg sm:h-14 sm:w-14', stat.color)}>
                  <stat.icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} aria-hidden />
                </div>
                <div className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black",
                  stat.isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {stat.isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stat.trend}
                </div>
              </div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">{stat.label}</p>
              <h3 className="truncate text-2xl font-black text-gray-900 sm:text-3xl">{stat.value}</h3>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Site Settings — Ticker Banner Editor */}
      <div className="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 md:p-8">
        <h2 className="mb-6 text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Site Settings</h2>

        {/* Toggle row */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0a150c] text-white">
              <Megaphone size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">Offers Ticker Banner</p>
              <p className="text-xs font-medium text-gray-400">Scrolling banner shown below the navigation bar</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400">{tickerEnabled ? 'Visible' : 'Hidden'}</span>
            <button
              type="button"
              disabled={tickerLoading || tickerSaving}
              onClick={handleTickerToggle}
              className={cn(
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                tickerEnabled ? 'bg-catchy' : 'bg-gray-200'
              )}
              aria-label="Toggle ticker banner"
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
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Live Preview</p>
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
            {bannerText || '  ◆  Banner Text Preview  ◆  '}
          </div>
        </div>

        <div className="space-y-5">
          {/* Banner text */}
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-gray-500">
              Banner Text
            </label>
            <input
              type="text"
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder="  ◆  عروض وتخفيضات  ◆  Offers & Discounts"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:border-catchy focus:outline-none focus:ring-1 focus:ring-catchy"
            />
            <p className="mt-1 text-[11px] text-gray-400">This segment is repeated across the full banner. Use ◆ as a separator.</p>
          </div>

          {/* Color + font size row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Background color */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-gray-500">
                Background Color
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2">
                <input
                  type="color"
                  value={bannerBgColor}
                  onChange={(e) => setBannerBgColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Pick background color"
                />
                <span className="font-mono text-xs text-gray-500">{bannerBgColor}</span>
              </div>
            </div>

            {/* Text color */}
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-gray-500">
                Text Color
              </label>
              <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2">
                <input
                  type="color"
                  value={bannerTextColor}
                  onChange={(e) => setBannerTextColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Pick text color"
                />
                <span className="font-mono text-xs text-gray-500">{bannerTextColor}</span>
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-black uppercase tracking-widest text-gray-500">
                Font Size
                <span className="ml-1 font-mono text-catchy">{bannerFontSize}px</span>
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
              Font Family
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
              {bannerSaving ? 'Saving…' : 'Save Banner Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-10">
        <div className="min-w-0 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6 md:p-8">
            <h2 className="text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Recent Orders</h2>
            <button
              type="button"
              className="self-start text-sm font-bold text-catchy hover:underline sm:self-auto touch-manipulation min-h-[44px] px-1"
            >
              View All
            </button>
          </div>

          {/* Mobile: stacked cards */}
          <div className="divide-y divide-gray-50 md:hidden">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div key={order.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-gray-400">#{order.id.slice(0, 8)}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider',
                        order.status === 'delivered'
                          ? 'bg-emerald-50 text-emerald-600'
                          : order.status === 'pending'
                            ? 'bg-orange-50 text-orange-600'
                            : 'bg-blue-50 text-blue-600'
                      )}
                    >
                      {order.status}
                    </span>
                  </div>
                  <p className="break-all text-sm font-medium text-gray-600">{String(order.userId ?? '—')}</p>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-black text-gray-900">ILS {order.total}</span>
                    <span className="text-xs text-gray-400">
                      {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="p-8 text-center text-sm font-medium text-gray-400">No recent orders found.</p>
            )}
          </div>

          {/* md+: table */}
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full min-w-0 text-left text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-xs font-black uppercase tracking-widest text-gray-400">
                  <th className="px-4 py-4 md:px-8 md:py-5">Order ID</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">Customer</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">Status</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">Total</th>
                  <th className="px-4 py-4 md:px-8 md:py-5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.length > 0 ? (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="px-4 py-4 font-bold text-gray-900 md:px-8 md:py-6">#{order.id.slice(0, 8)}</td>
                      <td className="max-w-[10rem] truncate px-4 py-4 font-medium text-gray-500 md:max-w-none md:px-8 md:py-6">
                        {order.userId}
                      </td>
                      <td className="px-4 py-4 md:px-8 md:py-6">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider',
                            order.status === 'delivered'
                              ? 'bg-emerald-50 text-emerald-600'
                              : order.status === 'pending'
                                ? 'bg-orange-50 text-orange-600'
                                : 'bg-blue-50 text-blue-600'
                          )}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-black text-gray-900 md:px-8 md:py-6">ILS {order.total}</td>
                      <td className="px-4 py-4 font-medium text-gray-400 md:px-8 md:py-6">
                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-8 py-16 text-center font-medium text-gray-400 md:py-20">
                      No recent orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 md:p-8">
          <h2 className="mb-6 text-xl font-black tracking-tight text-gray-900 sm:text-2xl">Inventory Alerts</h2>
          <div className="space-y-4 sm:space-y-6">
            {/* Low stock items would go here */}
            <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-3 sm:gap-4 sm:p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white sm:h-12 sm:w-12">
                <Package size={22} className="sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-orange-900">Low Stock Alert</h4>
                <p className="text-sm font-medium text-orange-700">5 items are below threshold</p>
              </div>
            </div>
            <p className="text-center text-sm font-medium text-gray-400">All systems operational.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
