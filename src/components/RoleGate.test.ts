import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Exercises the real AuthProvider + RoleGate as on a page refresh / direct link to
// /admin or /pos: Firebase Auth restores the session, then the role arrives from the
// Firestore profile. Only the Firebase SDK surface is stubbed.
type FakeUser = { uid: string; email: string; displayName: string | null };
type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

const fb = vi.hoisted(() => ({
  authCallback: null as null | ((u: FakeUser | null) => void),
  auth: { currentUser: null as FakeUser | null },
  pendingProfiles: new Map<string, Deferred>(),
}));

vi.mock('../firebase', () => ({
  auth: fb.auth,
  db: {},
  onAuthStateChanged: (_auth: unknown, cb: (u: FakeUser | null) => void) => {
    fb.authCallback = cb;
    return () => {};
  },
  doc: (_db: unknown, _col: string, uid: string) => ({ uid }),
  getDoc: (ref: { uid: string }) =>
    new Promise((resolve, reject) => fb.pendingProfiles.set(ref.uid, { resolve, reject })),
  setDoc: vi.fn(async () => {}),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

import { AuthProvider } from '../context/AuthContext';
import RoleGate from './RoleGate';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderAt(path: string) {
  const app = h(
    AuthProvider,
    null,
    h(
      MemoryRouter,
      { initialEntries: [path] },
      h(
        Routes,
        null,
        h(Route, { path: '/admin', element: h(RoleGate, { allow: ['admin'], pending: 'PENDING' }, 'ADMIN PAGE') }),
        h(Route, {
          path: '/pos',
          element: h(RoleGate, { allow: ['admin', 'cashier'], pending: 'PENDING' }, 'POS PAGE'),
        }),
        h(Route, { path: '/login', element: 'LOGIN PAGE' })
      )
    )
  );
  act(() => root.render(app));
}

const screen = () => container.textContent;

async function signIn(uid: string, email: string) {
  const user = { uid, email, displayName: null };
  fb.auth.currentUser = user;
  await act(async () => fb.authCallback!(user));
}

async function resolveProfile(uid: string, role: string | null) {
  const pending = fb.pendingProfiles.get(uid)!;
  await act(async () => pending.resolve({ exists: () => role !== null, data: () => ({ role }) }));
}

beforeEach(() => {
  fb.authCallback = null;
  fb.auth.currentUser = null;
  fb.pendingProfiles.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RoleGate on refresh / direct link', () => {
  it('waits while the auth session is restoring', () => {
    renderAt('/admin');
    expect(screen()).toBe('PENDING');
  });

  it('cashier opening /pos waits for the profile role instead of bouncing to /login', async () => {
    renderAt('/pos');
    await signIn('cashier1', 'till@gmail.com');
    expect(screen()).toBe('PENDING'); // provisional 'customer' must not redirect
    await resolveProfile('cashier1', 'cashier');
    expect(screen()).toBe('POS PAGE');
  });

  it('profile admin opening /admin waits for the profile role, then sees the page', async () => {
    renderAt('/admin');
    await signIn('admin1', 'manager@gmail.com');
    expect(screen()).toBe('PENDING');
    await resolveProfile('admin1', 'admin');
    expect(screen()).toBe('ADMIN PAGE');
  });

  it('profile admin can also open /pos', async () => {
    renderAt('/pos');
    await signIn('admin1', 'manager@gmail.com');
    await resolveProfile('admin1', 'admin');
    expect(screen()).toBe('POS PAGE');
  });

  it('owner-email admin gets /admin immediately without waiting on Firestore', async () => {
    renderAt('/admin');
    await signIn('owner', 'lojain2077@gmail.com');
    expect(screen()).toBe('ADMIN PAGE');
  });

  it('cashier opening /admin is sent to /login once the role is known', async () => {
    renderAt('/admin');
    await signIn('cashier1', 'till@gmail.com');
    expect(screen()).toBe('PENDING');
    await resolveProfile('cashier1', 'cashier');
    expect(screen()).toBe('LOGIN PAGE');
  });

  it('customer opening /pos is sent to /login once the role is known', async () => {
    renderAt('/pos');
    await signIn('shopper', 'shopper@gmail.com');
    await resolveProfile('shopper', 'customer');
    expect(screen()).toBe('LOGIN PAGE');
  });

  it('new user with no profile yet is sent to /login', async () => {
    renderAt('/pos');
    await signIn('fresh', 'new@gmail.com');
    await resolveProfile('fresh', null);
    expect(screen()).toBe('LOGIN PAGE');
  });

  it('signed-out visitor is sent to /login', async () => {
    renderAt('/pos');
    await act(async () => fb.authCallback!(null));
    expect(screen()).toBe('LOGIN PAGE');
  });

  it('a failed profile read stops waiting (no endless spinner) and keeps the safe role', async () => {
    renderAt('/pos');
    await signIn('cashier1', 'till@gmail.com');
    await act(async () => fb.pendingProfiles.get('cashier1')!.reject(new Error('offline')));
    expect(screen()).toBe('LOGIN PAGE');
  });

  it("ignores a stale profile result from a previous user's session", async () => {
    renderAt('/pos');
    await signIn('cashier1', 'till@gmail.com');
    await signIn('shopper', 'shopper@gmail.com'); // account switch before cashier1's read returns
    await resolveProfile('cashier1', 'cashier');
    expect(screen()).toBe('PENDING'); // still waiting on shopper's own role
    await resolveProfile('shopper', 'customer');
    expect(screen()).toBe('LOGIN PAGE');
  });
});
