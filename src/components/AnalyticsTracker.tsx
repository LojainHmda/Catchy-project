import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { firebaseEmulatorMode } from '../firebase';
import { createBrowserTracker, trackingAllowed, type Tracker } from '../lib/analytics/tracker';

const HEARTBEAT_CHECK_MS = 30_000;
const TAB_PING_MS = 15_000;

// One tracker per tab, created lazily and kept at module level so StrictMode's double
// mount/unmount and re-renders never create a second set of listeners or duplicate views.
let tracker: Tracker | null | undefined;
let listenersInstalled = false;

function getTracker(): Tracker | null {
  if (tracker !== undefined) return tracker;
  // Production builds, and the local emulator dev server; never plain `npm run dev`
  // (that has no collect endpoint pointing at a safe database).
  const enabled = (import.meta.env.PROD || firebaseEmulatorMode) && typeof window !== 'undefined' && trackingAllowed();
  try {
    tracker = enabled ? createBrowserTracker() : null;
  } catch {
    tracker = null; // e.g. storage blocked
  }
  return tracker;
}

function installListeners(t: Tracker) {
  if (listenersInstalled) return;
  listenersInstalled = true;
  let lastInteraction = 0;
  const onInteraction = () => {
    const now = Date.now();
    if (now - lastInteraction < 5_000) return;
    lastInteraction = now;
    t.interaction();
  };
  for (const type of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
    window.addEventListener(type, onInteraction, { passive: true, capture: true });
  }
  const beat = () => {
    if (document.visibilityState === 'visible') t.heartbeat();
  };
  window.setInterval(beat, HEARTBEAT_CHECK_MS);
  window.setInterval(() => t.tabPing(), TAB_PING_MS);
  document.addEventListener('visibilitychange', beat);
  window.addEventListener('pagehide', () => t.leave());
  // Restored from the back/forward cache after a "leave": become live again.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      t.interaction();
      beat();
    }
  });
  t.tabPing();
}

/** Records anonymous storefront page views and live presence. Renders nothing. */
export default function AnalyticsTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    const t = getTracker();
    if (!t) return;
    installListeners(t);
    t.pageView(pathname);
  }, [pathname]);
  return null;
}
