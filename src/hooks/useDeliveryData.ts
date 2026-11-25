import { useEffect, useState } from 'react';
import { loadDeliveryLocationIndex, type DeliveryLocationIndex } from '../lib/delivery/deliveryAreas';
import { subscribeDeliveryPriceSettings, type DeliveryPriceSettingsInfo } from '../lib/delivery/deliveryPriceService';

/**
 * Live delivery prices while `enabled` (checkout open, cart drawer open). Starts empty
 * each time it is enabled, so a price shown is always one the server just sent.
 */
export function useDeliveryPrices(enabled = true): { settings: DeliveryPriceSettingsInfo | null; error: boolean } {
  const [state, setState] = useState<{ settings: DeliveryPriceSettingsInfo | null; error: boolean }>({ settings: null, error: false });

  useEffect(() => {
    if (!enabled) return undefined;
    setState({ settings: null, error: false });
    const unsubscribe = subscribeDeliveryPriceSettings(
      (settings) => setState({ settings, error: false }),
      (error) => {
        console.warn('Delivery prices could not be loaded:', error);
        setState((prev) => ({ settings: prev.settings, error: true }));
      }
    );
    return unsubscribe;
  }, [enabled]);

  return state;
}

/** The place list (loaded on first use) while `enabled`; `retry` after a failed load. */
export function useDeliveryLocationIndex(enabled = true): {
  index: DeliveryLocationIndex | null;
  error: boolean;
  retry: () => void;
} {
  const [index, setIndex] = useState<DeliveryLocationIndex | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || index) return undefined;
    let alive = true;
    setError(false);
    loadDeliveryLocationIndex()
      .then((loaded) => {
        if (alive) setIndex(loaded);
      })
      .catch((err: unknown) => {
        console.warn('Delivery places could not be loaded:', err);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [enabled, index, attempt]);

  return { index, error, retry: () => setAttempt((n) => n + 1) };
}
