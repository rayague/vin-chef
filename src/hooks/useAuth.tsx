/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, getCurrentUser, setCurrentUser, initializeDemoData } from '@/lib/storage';
import db from '@/lib/db';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isCommercial: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // If running inside Electron, use the secure auth handler in main
      // (preload exposes window.electronAPI.auth.login)
      // Fallback to localStorage-based users when not under Electron.
      if (typeof window !== 'undefined' && window.electronAPI?.auth?.login) {
        try {
          const res = await window.electronAPI.auth.login(username, password);
          console.debug('useAuth: auth.login response', res);
          if (res && res.success) {
            const safeUser: User = { id: res.user.id, username: res.user.username, role: res.user.role, passwordHash: '' } as User;
            setUser(safeUser);
            setCurrentUser(safeUser);
            return true;
          }
          console.warn('useAuth: auth.login failed for', username);
          return false;
        } catch (err) {
          console.error('useAuth: auth.login threw', err);
          return false;
        }
      }

      // Normal lookup
      // Use the adapter to look up the user. This ensures we consult Electron IPC or IndexedDB fallback.
      let foundUser = await db.getUserByUsername(username);

      // If not found and we're in DEV, attempt to re-seed demo data once and retry (helps when dev server changed without restart)
      if (!foundUser && import.meta.env.DEV) {
        try {
          console.debug('useAuth [DEV]: user not found via db, forcing demo seed and retrying');
          // Prefer the db reset which handles IndexedDB + storage fallback
          if (typeof db.resetDemoData === 'function') {
            try { await db.resetDemoData(); } catch (e) { /* ignore */ }
          }
          initializeDemoData(true);
          foundUser = await db.getUserByUsername(username);
        } catch (err) {
          console.error('useAuth [DEV]: initializeDemoData failed', err);
        }
      }

      if (!foundUser) {
        console.warn('useAuth: no local user found for', username);
        return false;
      }

      // Normalize the returned user object (db adapter may return a lightweight UserInfo
      // when running under Electron). We need a `passwordHash` to verify the password.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foundUserAny = foundUser as any;
      // Developer-friendly debug: in dev show the stored hash and attempt compare so we can see why it fails
      if (import.meta.env.DEV) {
        console.debug('useAuth [DEV]: foundUser', { username: foundUserAny?.username, passwordHash: foundUserAny?.passwordHash });
      }

      let isValid = false;
      try {
        const hash = foundUserAny?.passwordHash;
        if (hash) isValid = await bcrypt.compare(password, hash);
      } catch (err) {
        console.error('useAuth: bcrypt.compare threw', err);
      }

      console.debug('useAuth: bcrypt.compare result for', username, isValid);
      if (isValid) {
        // Create a safe user object that matches the `User` shape expected by the app
        const safeUser: User = { id: foundUserAny.id, username: foundUserAny.username, role: foundUserAny.role, passwordHash: foundUserAny.passwordHash || '' } as User;
        setUser(safeUser);
        setCurrentUser(safeUser);
        return true;
      }

      // If invalid in DEV, try one more time after forcing demo seed (covers situation where hashes were missing)
      if (import.meta.env.DEV) {
        try {
          console.debug('useAuth [DEV]: invalid password, forcing demo seed and retrying compare');
          initializeDemoData(true);
          const retryUser = await db.getUserByUsername(username);
          if (retryUser) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const retryUserAny = retryUser as any;
            const retryValid = retryUserAny?.passwordHash ? await bcrypt.compare(password, retryUserAny.passwordHash) : false;
            console.debug('useAuth [DEV]: retry bcrypt.compare result for', username, retryValid);
            if (retryValid) {
              const safeRetry: User = { id: retryUserAny.id, username: retryUserAny.username, role: retryUserAny.role, passwordHash: retryUserAny.passwordHash || '' } as User;
              setUser(safeRetry);
              setCurrentUser(safeRetry);
              return true;
            }
          }
        } catch (err) {
          console.error('useAuth [DEV]: retry after seed failed', err);
        }
      }

      console.warn('useAuth: invalid password for', username);
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setCurrentUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isCommercial = user?.role === 'commercial';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isCommercial }}>
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
