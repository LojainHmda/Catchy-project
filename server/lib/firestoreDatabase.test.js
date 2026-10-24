import { describe, it, expect, beforeEach, vi } from 'vitest';

const getFirestore = vi.fn((...args) => ({ args }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));

import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  resolveFirestoreDatabaseId,
  getAdminFirestore,
} from './firestoreDatabase.js';

describe('resolveFirestoreDatabaseId (server)', () => {
  it('falls back to (default) when unset, blank, or not a string', () => {
    expect(resolveFirestoreDatabaseId(undefined)).toBe(DEFAULT_FIRESTORE_DATABASE_ID);
    expect(resolveFirestoreDatabaseId(null)).toBe('(default)');
    expect(resolveFirestoreDatabaseId('')).toBe('(default)');
    expect(resolveFirestoreDatabaseId('   ')).toBe('(default)');
  });

  it('returns the trimmed named database id', () => {
    expect(resolveFirestoreDatabaseId('catchy')).toBe('catchy');
    expect(resolveFirestoreDatabaseId('  catchy\n')).toBe('catchy');
  });
});

describe('getAdminFirestore', () => {
  const app = { name: 'test-app' };
  beforeEach(() => getFirestore.mockClear());

  it('uses the plain (default) call when FIRESTORE_DATABASE_ID is unset (catchy-496207)', async () => {
    await getAdminFirestore(app, {});
    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledWith(app);
  });

  it('treats an explicit "(default)" like unset', async () => {
    await getAdminFirestore(app, { FIRESTORE_DATABASE_ID: '(default)' });
    expect(getFirestore).toHaveBeenCalledWith(app);
  });

  it('selects the named database when FIRESTORE_DATABASE_ID=catchy (kartacagenai)', async () => {
    await getAdminFirestore(app, { FIRESTORE_DATABASE_ID: 'catchy' });
    expect(getFirestore).toHaveBeenCalledWith(app, 'catchy');
  });

  it('ignores the client-only VITE_FIRESTORE_DATABASE_ID', async () => {
    await getAdminFirestore(app, { VITE_FIRESTORE_DATABASE_ID: 'catchy' });
    expect(getFirestore).toHaveBeenCalledWith(app);
  });
});
