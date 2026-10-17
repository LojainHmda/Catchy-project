import React from 'react';
import { Flame, LayoutGrid, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getCategoryIcon } from '../../lib/categoryIcons';
import type { StoreCategory } from '../../lib/categoriesService';
import type { PosCategorySelection } from '../../lib/pos/posProduct';
import { cn } from '../../lib/utils';

type PosCategorySidebarProps = {
  categories: StoreCategory[];
  selection: PosCategorySelection;
  onSelect: (selection: PosCategorySelection) => void;
  className?: string;
};

function isSame(a: PosCategorySelection, b: PosCategorySelection): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'category' && b.kind === 'category' ? a.id === b.id : true;
}

type Tone = { grad: string; glow: string };

/** Every real category gets its own permanent identity color, cycling through this curated set. */
const PALETTE: Tone[] = [
  { grad: 'from-pink-500 to-rose-600', glow: 'shadow-pink-500/30' },
  { grad: 'from-cyan-500 to-sky-600', glow: 'shadow-cyan-500/30' },
  { grad: 'from-amber-400 to-orange-500', glow: 'shadow-amber-500/30' },
  { grad: 'from-teal-500 to-emerald-600', glow: 'shadow-teal-500/30' },
  { grad: 'from-indigo-500 to-blue-700', glow: 'shadow-indigo-500/30' },
  { grad: 'from-violet-500 to-purple-700', glow: 'shadow-violet-500/30' },
  { grad: 'from-fuchsia-500 to-pink-700', glow: 'shadow-fuchsia-500/30' },
  { grad: 'from-lime-500 to-green-600', glow: 'shadow-lime-500/30' },
];

const ALL_TONE: Tone = { grad: 'from-catchy to-catchy-dark', glow: 'shadow-catchy/30' };
const NEW_TONE: Tone = { grad: 'from-amber-300 to-amber-500', glow: 'shadow-amber-400/30' };
const SALE_TONE: Tone = { grad: 'from-rose-500 to-red-600', glow: 'shadow-rose-500/30' };

/**
 * Always-visible category rail — a horizontal strip pinned above the grid on
 * phones/portrait tablets, and a wide vertical rail on the right at desktop
 * width. Every category keeps a fixed, vivid identity color so the cashier
 * recognizes it instantly by glance/muscle memory, not just by reading the
 * label. Selection is shown with a bright ring rather than dimming everything
 * else, so the rail stays lively at all times. This panel's own position
 * relative to the cart/grid never mirrors for RTL (matches the store's chosen
 * hardware layout), but the text/icon order inside each button does.
 */
const PosCategorySidebar: React.FC<PosCategorySidebarProps> = ({ categories, selection, onSelect, className }) => {
  const { t, isRTL, language } = useLanguage();
  const realCategories = categories.filter((c) => c.id.toLowerCase() !== 'coordinates');

  const items: { sel: PosCategorySelection; label: string; icon: React.ReactNode; tone: Tone; badge?: string }[] = [
    { sel: { kind: 'all' }, label: t('pos.category.all'), icon: <LayoutGrid size={22} strokeWidth={2} />, tone: ALL_TONE },
    {
      sel: { kind: 'new' },
      label: t('pos.category.new'),
      icon: <Sparkles size={22} strokeWidth={2} />,
      tone: NEW_TONE,
    },
    {
      sel: { kind: 'sale' },
      label: t('pos.category.sale'),
      icon: <Flame size={22} strokeWidth={2} />,
      tone: SALE_TONE,
      badge: t('pos.category.saleBadge'),
    },
    ...realCategories.map((cat, idx) => ({
      sel: { kind: 'category' as const, id: cat.id },
      label: language === 'ar' && cat.nameAr ? cat.nameAr : cat.name,
      icon: React.createElement(getCategoryIcon(cat.icon), { size: 22, strokeWidth: 1.8 }),
      tone: PALETTE[idx % PALETTE.length]!,
    })),
  ];

  return (
    <nav
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn(
        'flex shrink-0 gap-2 overflow-x-auto border-b border-white/8 bg-neutral-900/60 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'lg:h-full lg:w-64 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-b-0 lg:border-l lg:p-3',
        className
      )}
    >
      {items.map(({ sel, label, icon, tone, badge }) => {
        const active = isSame(sel, selection);
        return (
          <button
            key={sel.kind === 'category' ? sel.id : sel.kind}
            type="button"
            onClick={() => onSelect(sel)}
            className={cn(
              'relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br px-2 py-2 text-center transition-all duration-150 active:scale-[0.97]',
              'h-20 w-20',
              'lg:h-auto lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-3.5 lg:py-4 lg:text-start',
              tone.grad,
              active ? cn('scale-[1.02] shadow-lg ring-2 ring-white/85', tone.glow) : 'opacity-80 hover:opacity-100'
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm lg:h-12 lg:w-12">
              {icon}
            </span>
            <span className="line-clamp-2 min-w-0 flex-1 text-[10px] font-bold leading-[1.15] text-white lg:truncate lg:text-sm">
              {label}
            </span>
            {badge ? (
              <span className="absolute -top-1.5 end-1.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black tracking-wide text-rose-600 shadow lg:-end-1.5">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};

export default PosCategorySidebar;
