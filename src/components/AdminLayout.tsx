import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
  Image as ImageIcon,
  Store,
  MessageCircle,
  Menu,
  X,
  Percent,
  Film,
  LayoutGrid,
  CreditCard,
  Languages,
  BarChart3,
  PackageOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePendingOrdersCount } from '../hooks/usePendingOrdersCount';
import { useOpenReturnsCount } from '../hooks/useOpenReturnsCount';
import { cn } from '../lib/utils';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout, role } = useAuth();
  const pendingOrders = usePendingOrdersCount(role === 'admin');
  const openReturns = useOpenReturnsCount(role === 'admin');
  const location = useLocation();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const syncBodyScroll = () => {
      if (mq.matches) {
        document.body.style.overflow = '';
        setMobileNavOpen((open) => (open ? false : open));
      } else {
        document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
      }
    };
    syncBodyScroll();
    mq.addEventListener('change', syncBodyScroll);
    return () => {
      mq.removeEventListener('change', syncBodyScroll);
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const menuItems = [
    { icon: LayoutDashboard, label: t('admin.nav.dashboard'), path: '/admin' },
    { icon: Store, label: t('admin.nav.shopPage'), path: '/' },
    { icon: CreditCard, label: t('admin.nav.pointOfSale'), path: '/pos' },
    { icon: ImageIcon, label: t('admin.nav.heroReels'), path: '/admin/hero' },
    { icon: Film, label: t('admin.nav.heroVideo'), path: '/admin/hero-video' },
    { icon: Package, label: t('admin.nav.products'), path: '/admin/products' },
    { icon: Percent, label: t('admin.nav.discounts'), path: '/admin/discounts' },
    { icon: LayoutGrid, label: t('admin.nav.coordinates'), path: '/admin/coordinates' },
    { icon: ClipboardList, label: t('admin.nav.stock'), path: '/admin/stock' },
    { icon: ShoppingCart, label: t('admin.nav.orders'), path: '/admin/orders', badge: pendingOrders },
    {
      icon: PackageOpen,
      label: t('admin.nav.returns'),
      path: '/admin/returns',
      badge: openReturns,
      badgeLabelKey: 'admin.nav.openReturnsBadge',
    },
    { icon: BarChart3, label: t('admin.nav.reports'), path: '/admin/reports' },
    { icon: Users, label: t('admin.nav.customers'), path: '/admin/customers' },
    { icon: MessageCircle, label: t('admin.nav.whatsapp'), path: '/admin/whatsapp' },
    { icon: Settings, label: t('admin.nav.settings'), path: '/admin/settings' },
  ];

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={language}
      className={cn(
        'flex min-h-screen min-w-0 max-w-[100vw] flex-col overflow-x-hidden bg-gray-50/50 md:flex-row',
        isRTL ? 'font-arabic' : 'font-sans'
      )}
    >
      {/* Mobile top bar */}
      <header
        className={cn(
          'flex md:hidden shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))]'
        )}
      >
        <button
          type="button"
          aria-expanded={mobileNavOpen}
          aria-controls="admin-mobile-drawer"
          aria-label={t('admin.nav.openMenu')}
          onClick={() => setMobileNavOpen(true)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 shadow-sm touch-manipulation active:bg-gray-50"
        >
          <Menu size={22} strokeWidth={2} />
        </button>
        <Link
          to="/admin"
          className="flex min-w-0 flex-1 items-center gap-2.5"
          onClick={closeMobileNav}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-catchy text-base font-bold text-white shadow-md shadow-catchy/25">
            C
          </div>
          <span className="truncate text-lg font-black tracking-tight text-gray-900">{t('admin.nav.brand')}</span>
        </Link>
        <button
          type="button"
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          aria-label={t('admin.language.switch')}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-bold text-gray-600 transition hover:border-catchy/40 hover:text-catchy active:scale-[0.95]"
        >
          <Languages size={14} />
          {language === 'en' ? 'ع' : 'EN'}
        </button>
      </header>

      {/* Mobile drawer backdrop (not in DOM on desktop — avoids covering main) */}
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label={t('admin.nav.closeMenu')}
          className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[1px] md:hidden"
          onClick={closeMobileNav}
        />
      ) : null}

      {/* Sidebar: off-canvas drawer on small screens, persistent rail on md+ */}
      <aside
        id="admin-mobile-drawer"
        className={cn(
          'flex max-h-[100dvh] flex-col border-e border-gray-100 bg-white shadow-xl md:shadow-none',
          'fixed inset-y-0 z-[70] w-[min(19rem,88vw)] max-w-[min(19rem,88vw)] transition-transform duration-300 ease-out motion-reduce:transition-none',
          isRTL ? 'right-0' : 'left-0',
          mobileNavOpen
            ? 'translate-x-0'
            : cn(isRTL ? 'translate-x-full' : '-translate-x-full', 'pointer-events-none md:pointer-events-auto'),
          'md:relative md:z-0 md:h-screen md:max-h-none md:w-72 md:max-w-none md:translate-x-0 md:sticky md:top-0 md:shadow-none'
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-50 p-5 md:p-8 md:pb-8">
          <Link to="/" className="flex min-w-0 items-center gap-3" onClick={closeMobileNav}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-catchy text-xl font-bold text-white shadow-lg shadow-catchy/20">
              C
            </div>
            <span className="text-xl font-black tracking-tight text-gray-900 md:text-2xl">{t('admin.nav.brand')}</span>
          </Link>
          <button
            type="button"
            aria-label={t('admin.nav.closeMenuShort')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 touch-manipulation active:bg-gray-50 md:hidden"
            onClick={closeMobileNav}
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-4 pb-6 md:space-y-2 md:p-6">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobileNav}
                className={cn(
                  'flex min-h-[48px] items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition-all duration-200 group touch-manipulation md:py-3.5',
                  isActive
                    ? 'bg-catchy text-white shadow-lg shadow-catchy/20'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100'
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <item.icon
                    size={20}
                    className={cn('shrink-0', isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-900')}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {'badge' in item && item.badge ? (
                    <span
                      className={cn(
                        'min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-black tabular-nums',
                        isActive ? 'bg-white text-catchy' : 'bg-orange-500 text-white'
                      )}
                      aria-label={t(
                        'badgeLabelKey' in item && item.badgeLabelKey ? item.badgeLabelKey : 'admin.nav.pendingBadge'
                      ).replace('{n}', String(item.badge))}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                  {isActive ? (
                    isRTL ? <ChevronLeft size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />
                  ) : null}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-50 p-4 md:p-6">
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            aria-label={t('admin.language.switch')}
            className="mb-1.5 hidden min-h-[44px] w-full items-center gap-3 rounded-2xl px-4 text-sm font-bold text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-900 md:flex"
          >
            <Languages size={20} className="text-gray-400" />
            {language === 'en' ? 'العربية' : 'English'}
          </button>
          <button
            type="button"
            onClick={() => {
              closeMobileNav();
              logout();
            }}
            className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-red-500 transition-all touch-manipulation hover:bg-red-50 active:bg-red-100 md:py-3.5"
          >
            <LogOut size={20} />
            {t('admin.nav.logout')}
          </button>
        </div>
      </aside>

      {/* Main: hero editor uses tighter padding; other admin pages stay spacious */}
      <main
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto',
          location.pathname === '/admin/hero' || location.pathname === '/admin/products' || location.pathname === '/admin/discounts' || location.pathname === '/admin/coordinates'
            ? 'p-4 sm:p-5 md:p-6'
            : 'p-4 sm:p-6 md:p-10'
        )}
      >
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
