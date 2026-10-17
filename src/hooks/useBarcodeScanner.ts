import { useEffect, useRef } from 'react';
import { usCharForCode } from '../lib/pos/usKeyboardLayout';

// Standard USB/Bluetooth "HID keyboard-wedge" scanners type each character in a
// tight burst (roughly 1–15ms apart) and finish with Enter. Human typing is
// consistently slower (60ms+ between keys), so timing alone reliably tells the
// two apart without needing a dedicated input to be focused.
const MAX_INTERVAL_MS = 40;
const MIN_CODE_LENGTH = 3;

/**
 * Global scan listener for the POS terminal. Call with `enabled: false` when
 * the terminal isn't the active screen (e.g. a modal is open) to avoid
 * misfiring on unrelated fast typing elsewhere.
 */
export function useBarcodeScanner(onScan: (code: string) => void, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = performance.now();
      const elapsedSincePrev = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = bufferRef.current;
        bufferRef.current = '';
        if (code.length >= MIN_CODE_LENGTH && elapsedSincePrev <= MAX_INTERVAL_MS) {
          onScanRef.current(code);
        }
        return;
      }

      // Scanners send raw USB keycodes as if from a US keyboard. `.code` is the physical
      // key (layout-independent); `.key` is whatever the OS's *active* input language
      // maps it to, which garbles the scan if that language isn't English. Prefer the
      // layout-independent character and only fall back to `.key` for keys we don't map.
      const ch = usCharForCode(e.code, e.shiftKey) ?? (e.key.length === 1 ? e.key : null);
      if (ch) {
        // A slow gap means this keystroke starts a fresh (likely human) run, not a continuation.
        bufferRef.current = elapsedSincePrev > MAX_INTERVAL_MS ? ch : bufferRef.current + ch;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
}
