import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  doc,
  getDoc,
  setDoc,
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from '../firebase';
import { ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD } from '../constants';

/** Always-admin emails. Defaults include both project owners; VITE_OWNER_EMAILS adds more (comma-separated), never removes these. */
const DEFAULT_OWNER_EMAILS = ['lojain2077@gmail.com', 'marei.eyad@gmail.com'] as const;

const OWNER_EMAILS = (() => {
  const extras = import.meta.env.VITE_OWNER_EMAILS?.trim()
    ? import.meta.env.VITE_OWNER_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  return new Set([...DEFAULT_OWNER_EMAILS.map((e) => e.toLowerCase()), ...extras]);
})();

function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OWNER_EMAILS.has(email.trim().toLowerCase());
}

/** Firebase Auth requires an email with @. When VITE_ADMIN_EMAIL has no @, we sign in as `{user}-{projectId}@example.com`. */
function isSyntheticAdminFirebaseEmail(email: string | null | undefined): boolean {
  const pid = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!email || !pid) return false;
  return email.toLowerCase().endsWith(`-${pid.toLowerCase()}@example.com`);
}

function isDemoAdminFirebaseEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === ADMIN_DEMO_EMAIL.toLowerCase();
}

/** Firebase requires ≥6 characters; user can still type short passwords on the form (e.g. `admin`). */
function firebasePasswordMin6(plain: string): string {
  if (plain.length >= 6) return plain;
  return plain.padEnd(6, '0');
}

function firebaseAuthCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
}

function missingUserOrBadCredential(code: string): boolean {
  return (
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  );
}

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: 'admin' | 'customer';
}

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'customer' | null;
  /** True until the first `onAuthStateChanged` callback has finished (including Firestore profile work when signed in). */
  loading: boolean;
  /** True only while syncing an already-signed-in Firebase user to app state (not “logging in” from this page). */
  sessionResolving: boolean;
  login: () => Promise<void>;
  loginWithCredentials: (email: string, pass: string) => Promise<void>;
  signUpWithCredentials: (email: string, pass: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'customer' | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionResolving, setSessionResolving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setSessionResolving(false);
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setSessionResolving(true);
      setLoading(true);
      const u: User = {
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName,
      };

      const treatAsAdmin =
        isOwnerEmail(currentUser.email) ||
        isSyntheticAdminFirebaseEmail(currentUser.email) ||
        isDemoAdminFirebaseEmail(currentUser.email);

      const profileRef = doc(db, 'users', currentUser.uid);
      const profileDeadlineMs = 12_000;

      try {
        const userDoc = await Promise.race([
          getDoc(profileRef),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('firestore-profile-timeout')), profileDeadlineMs);
          }),
        ]);
        if (userDoc.exists) {
          const data = userDoc.data() as { role?: string };
          const fetchedRole = data.role;
          const assignedRole = treatAsAdmin ? 'admin' : fetchedRole;
          if (treatAsAdmin && fetchedRole !== 'admin') {
            await setDoc(doc(db, 'users', currentUser.uid), { role: 'admin' }, { merge: true });
          }
          const r = assignedRole === 'admin' || assignedRole === 'customer' ? assignedRole : 'customer';
          setUser(u);
          setRole(r);
        } else {
          const newRole = treatAsAdmin ? 'admin' : 'customer';
          await setDoc(
            doc(db, 'users', currentUser.uid),
            {
              email: currentUser.email,
              role: newRole,
              displayName: currentUser.displayName,
            },
            { merge: true }
          );
          setUser(u);
          setRole(newRole);
        }
      } catch {
        // Firestore blocked or offline — still set session from Auth email so admin@gmail.com can reach /admin.
        setUser(u);
        setRole(treatAsAdmin ? 'admin' : 'customer');
      } finally {
        setSessionResolving(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loginWithCredentials = async (email: string, pass: string) => {
    if (email.trim().toLowerCase() === ADMIN_DEMO_EMAIL.toLowerCase() && pass.trim() === ADMIN_DEMO_PASSWORD) {
      try {
        await signInWithEmailAndPassword(auth, ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD);
        return;
      } catch (e: unknown) {
        const code = firebaseAuthCode(e);
        if (code === 'auth/wrong-password') throw e;
        if (missingUserOrBadCredential(code)) {
          try {
            await createUserWithEmailAndPassword(auth, ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD);
            return;
          } catch (ce: unknown) {
            const c2 = firebaseAuthCode(ce);
            if (c2 === 'auth/email-already-in-use' || c2 === 'auth/email-exists') {
              const wrap = new Error('Wrong password for this admin account.');
              (wrap as { code?: string }).code = 'auth/wrong-password';
              throw wrap;
            }
            throw ce;
          }
        }
        throw e;
      }
    }

    await signInWithEmailAndPassword(auth, email.trim(), pass);
  };

  const signUpWithCredentials = async (email: string, pass: string, displayName?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    const name = displayName?.trim();
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
  };

  const logout = async () => {
    localStorage.removeItem('mockUser');
    await signOut(auth);
    setUser(null);
    setRole(null);
    window.location.replace('/');
  };

  return (
    <AuthContext.Provider
      value={{ user, role, loading, sessionResolving, login, loginWithCredentials, signUpWithCredentials, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
