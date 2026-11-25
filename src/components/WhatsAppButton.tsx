import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

/** The store's WhatsApp chat link, exactly as given by the owner. */
export const STORE_WHATSAPP_URL = 'https://wa.me/message/5PDMN46QGMGQC1';
/** The store's WhatsApp number — shown in the button's label; the chat itself opens through the link above. */
export const STORE_WHATSAPP_NUMBER = '+970 593 227 556';

/** Customer-facing storefront pages only — never Admin, POS or the owner's AI-connector consent page. */
export function showsWhatsAppButton(pathname: string): boolean {
  return !/^\/(admin|pos|mcp-authorize)(\/|$)/.test(pathname);
}

/**
 * Floating "chat with us" button, fixed to the bottom-left corner of every storefront page.
 * Phones: sits above the bottom navigation bar. Admin sign-ins also get the owner's live-visitor
 * badge in the bottom-start corner (= left in English), so the button stacks above it then.
 * Stays under the header, drawers and dialogs (z-40), so they always cover it.
 */
export default function WhatsAppButton() {
  const { pathname } = useLocation();
  const { user, role } = useAuth();
  const { t, isRTL } = useLanguage();
  if (!showsWhatsAppButton(pathname)) return null;

  const aboveOwnerBadge = Boolean(user) && role === 'admin' && !isRTL;
  const label = t('whatsapp.float.label');

  return (
    <a
      href={STORE_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} ${STORE_WHATSAPP_NUMBER}`}
      data-testid="whatsapp-float"
      className={cn(
        'group fixed left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white',
        'shadow-lg shadow-black/25 ring-[3px] ring-white transition duration-200 ease-out',
        'hover:bg-[#1EBE5B] hover:shadow-xl motion-safe:hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-on-surface',
        'sm:left-6 sm:h-14 sm:w-14',
        aboveOwnerBadge ? 'bottom-32 sm:bottom-16' : 'bottom-20 sm:bottom-6'
      )}
    >
      <WhatsAppGlyph className="h-7 w-7 sm:h-8 sm:w-8" />
      {/* Desktop hover/focus label; the link's aria-label already says the same to screen readers. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-sm font-medium text-on-surface opacity-0 shadow-lg ring-1 ring-black/5 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:flex"
      >
        {label}
        <span dir="ltr" className="text-xs font-normal text-on-surface-variant">
          {STORE_WHATSAPP_NUMBER}
        </span>
      </span>
    </a>
  );
}

/** WhatsApp logo glyph (single path, 24×24), drawn in the current text colour. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}
