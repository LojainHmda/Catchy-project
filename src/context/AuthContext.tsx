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
} from '../firebase';

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

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: 'admin' | 'customer';
}

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'customer' | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithCredentials: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'customer' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUser({
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName,
      });

      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists) {
        const data = userDoc.data() as { role?: string };
        const fetchedRole = data.role;
        const assignedRole = isOwnerEmail(currentUser.email) ? 'admin' : fetchedRole;
        setRole(assignedRole === 'admin' || assignedRole === 'customer' ? assignedRole : 'customer');
      } else {
        const isDefaultAdmin = isOwnerEmail(currentUser.email);
        const newRole = isDefaultAdmin ? 'admin' : 'customer';
        await setDoc(
          doc(db, 'users', currentUser.uid),
          {
            email: currentUser.email,
            role: newRole,
            displayName: currentUser.displayName,
          },
          { merge: true }
        );
        setRole(newRole);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loginWithCredentials = async (email: string, pass: string) => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
    const adminPass = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;
    if (email.trim().toLowerCase() === 'admin' && pass === 'admin' && adminEmail && adminPass) {
      await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      return;
    }
    await signInWithEmailAndPassword(auth, email.trim(), pass);
  };

  const logout = async () => {
    localStorage.removeItem('mockUser');
    await signOut(auth);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, loginWithCredentials, logout }}>
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
