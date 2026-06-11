import React, { useEffect, useState } from 'react';
import { db, doc, onSnapshot } from '../firebase';

const DEFAULTS = {
  text: '   ◆   عروض وتخفيضات   ◆   Offers & Discounts',
  backgroundColor: '#0a150c',
  textColor: '#ffffff',
  fontSize: 10,
  fontFamily: 'Inter, sans-serif',
};

interface BannerSettings {
  enabled: boolean;
  text: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
}

export default function TickerBanner() {
  const [settings, setSettings] = useState<BannerSettings>({
    enabled: true,
    text: DEFAULTS.text,
    backgroundColor: DEFAULTS.backgroundColor,
    textColor: DEFAULTS.textColor,
    fontSize: DEFAULTS.fontSize,
    fontFamily: DEFAULTS.fontFamily,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ref = doc(db, 'site_settings', 'site');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setSettings({
            enabled: d.tickerBannerEnabled !== false,
            text: d.tickerBannerText || DEFAULTS.text,
            backgroundColor: d.tickerBannerBackgroundColor || DEFAULTS.backgroundColor,
            textColor: d.tickerBannerTextColor || DEFAULTS.textColor,
            fontSize: d.tickerBannerFontSize ? Number(d.tickerBannerFontSize) : DEFAULTS.fontSize,
            fontFamily: d.tickerBannerFontFamily || DEFAULTS.fontFamily,
          });
        }
        setReady(true);
      },
      () => setReady(true)
    );
    return () => unsub();
  }, []);

  if (!ready || !settings.enabled) return null;

  // Repeat enough times to exceed the widest screen, then double for seamless loop
  const half = Array(12).fill(settings.text).join('');
  const fullText = half + half;

  return (
    <div
      dir="ltr"
      className="w-full overflow-hidden"
      style={{
        backgroundColor: settings.backgroundColor,
        whiteSpace: 'nowrap',
        paddingTop: '0.55rem',
        paddingBottom: '0.55rem',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          color: settings.textColor,
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontWeight: 300,
          animation: 'catchy-ticker 28s linear infinite',
          willChange: 'transform',
        }}
      >
        {fullText}
      </span>
      <style>{`
        @keyframes catchy-ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
