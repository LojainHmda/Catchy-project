import { describe, it, expect } from 'vitest';
import { isSyntheticAdminEmail } from './adminIdentity.js';

describe('isSyntheticAdminEmail', () => {
  it('accepts {name}-{project}@example.com for the active project only', () => {
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.com', 'kartacagenai')).toBe(true);
    expect(isSyntheticAdminEmail('ops-catchy-496207@example.com', 'catchy-496207')).toBe(true);
    expect(isSyntheticAdminEmail('OPS-KARTACAGENAI@EXAMPLE.COM', 'kartacagenai')).toBe(true);
  });

  it("rejects another project's synthetic address", () => {
    expect(isSyntheticAdminEmail('ops-catchy-496207@example.com', 'kartacagenai')).toBe(false);
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.com', 'catchy-496207')).toBe(false);
  });

  it('rejects when the project is unknown, so a missing aud never grants admin', () => {
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.com', undefined)).toBe(false);
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.com', '')).toBe(false);
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.com', '  ')).toBe(false);
  });

  it('rejects look-alikes', () => {
    expect(isSyntheticAdminEmail('-kartacagenai@example.com', 'kartacagenai')).toBe(false); // empty name
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.com.evil.io', 'kartacagenai')).toBe(false);
    expect(isSyntheticAdminEmail('ops-kartacagenai@example.org', 'kartacagenai')).toBe(false);
    expect(isSyntheticAdminEmail('opskartacagenai@example.com', 'kartacagenai')).toBe(false); // no dash
    expect(isSyntheticAdminEmail('a@b-kartacagenai@example.com', 'kartacagenai')).toBe(false);
    expect(isSyntheticAdminEmail('ops-xkartacagenai@example.com', 'kartacagenai')).toBe(false);
    expect(isSyntheticAdminEmail(null, 'kartacagenai')).toBe(false);
  });
});
