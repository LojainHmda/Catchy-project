import { describe, it, expect, vi } from 'vitest';
import { resolveProductCreatedAt } from './resolveProductCreatedAt';

describe('resolveProductCreatedAt', () => {
  it('generates a fresh timestamp for a brand new product (no existing product)', () => {
    const createTimestamp = vi.fn(() => 'FRESH_TIMESTAMP');
    const result = resolveProductCreatedAt(null, createTimestamp);

    expect(result).toBe('FRESH_TIMESTAMP');
    expect(createTimestamp).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: editing an existing product preserves its original createdAt — it must not appear newer after a save', () => {
    const createTimestamp = vi.fn(() => 'SHOULD_NOT_BE_USED');
    const existing = { createdAt: 'ORIGINAL_TIMESTAMP', name: 'Old Product' };

    const result = resolveProductCreatedAt(existing, createTimestamp);

    expect(result).toBe('ORIGINAL_TIMESTAMP');
    expect(createTimestamp).not.toHaveBeenCalled();
  });

  it('LEGACY: an existing product missing createdAt gets one assigned on edit, instead of writing undefined', () => {
    const createTimestamp = vi.fn(() => 'BACKFILLED_TIMESTAMP');
    const legacyProduct: { name: string; createdAt?: string } = { name: 'Old Product With No Timestamp' }; // createdAt absent entirely

    const result = resolveProductCreatedAt(legacyProduct, createTimestamp);

    expect(result).toBe('BACKFILLED_TIMESTAMP');
    expect(createTimestamp).toHaveBeenCalledTimes(1);
  });

  it('treats an explicit null createdAt the same as missing (legacy data safety)', () => {
    const createTimestamp = vi.fn(() => 'BACKFILLED_TIMESTAMP');
    const result = resolveProductCreatedAt({ createdAt: null }, createTimestamp);

    expect(result).toBe('BACKFILLED_TIMESTAMP');
  });
});
