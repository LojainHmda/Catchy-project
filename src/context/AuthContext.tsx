import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, doc, getDoc, setDoc, auth, db } from '../firebase';

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
      if (currentUser) {
        setUser(currentUser);
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const fetchedRole = userDoc.data().role;
          const assignedRole = currentUser.email === 'marei.eyad@gmail.com' ? 'admin' : fetchedRole;
          console.log('User doc exists. Fetched role:', fetchedRole, 'Assigned role:', assignedRole, 'Email:', currentUser.email);
          setRole(assignedRole);
        } else {
          // Default role for new users
          const isDefaultAdmin = currentUser.email === 'marei.eyad@gmail.com';
          const newRole = isDefaultAdmin ? 'admin' : 'customer';
          console.log('User doc does not exist. Creating with role:', newRole, 'Email:', currentUser.email);
          await setDoc(doc(db, 'users', currentUser.uid), {
            email: currentUser.email,
            role: newRole,
            displayName: currentUser.displayName,
          });
          setRole(newRole);
        }
      } else {
        // Check for mock session
        const mockUser = localStorage.getItem('mockUser');
        if (mockUser) {
          const parsed = JSON.parse(mockUser);
          setUser(parsed);
          setRole(parsed.role);
        } else {
          setUser(null);
          setRole(null);
        }
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
    if (email === 'admin' && pass === 'admin') {
      const mockUser = {
        uid: 'mock-admin-id',
        email: 'admin@catchy.com',
        displayName: 'Admin Hub',
        role: 'admin'
      };
      localStorage.setItem('mockUser', JSON.stringify(mockUser));
      setUser(mockUser as any);
      setRole('admin');
    } else {
      throw new Error('Invalid credentials');
    }
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
