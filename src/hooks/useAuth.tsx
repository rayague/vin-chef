/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, getCurrentUser, setCurrentUser, initializeDemoData } from '@/lib/storage';
import db from '@/lib/db';
import logger from '@/lib/logger';

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
          logger.debug('useAuth: auth.login response', res);
          if (res && res.success) {
            const safeUser: User = { id: res.user.id, username: res.user.username, role: res.user.role, passwordHash: '' } as User;
            setUser(safeUser);
            setCurrentUser(safeUser);
            return true;
          }
          logger.warn('useAuth: auth.login failed for', username);
          return false;
        } catch (err) {
          logger.error('useAuth: auth.login threw', err);
          return false;
        }
      }

      // Normal lookup
      // Use the adapter to look up the user. This ensures we consult Electron IPC or IndexedDB fallback.
      let foundUser = await db.getUserByUsername(username);

      // If not found and we're in DEV, attempt to re-seed demo data once and retry (helps when dev server changed without restart)
      if (!foundUser && import.meta.env.DEV) {
        try {
          logger.debug('useAuth [DEV]: user not found via db, forcing demo seed and retrying');
          // Prefer the db reset which handles IndexedDB + storage fallback
          if (typeof db.resetDemoData === 'function') {
            try { await db.resetDemoData(); } catch (e) { /* ignore */ }
          }
          initializeDemoData(true);
          foundUser = await db.getUserByUsername(username);
        } catch (err) {
          logger.error('useAuth [DEV]: initializeDemoData failed', err);
        }
      }

      if (!foundUser) {
        logger.warn('useAuth: no local user found for', username);
        return false;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const foundUserAny = foundUser as any;
      const hash = foundUserAny?.passwordHash ? String(foundUserAny.passwordHash) : '';

      let isValid = false;
      try {
        if (hash) isValid = await bcrypt.compare(password, hash);
      } catch (err) {
        logger.error('useAuth: bcrypt.compare threw', err);
      }

      if (isValid) {
        const safeUser: User = { id: foundUser.id, username: foundUser.username, role: foundUser.role, passwordHash: hash } as User;
        setUser(safeUser);
        setCurrentUser(safeUser);
        return true;
      }

      // If invalid in DEV, try one more time after forcing demo seed (covers situation where hashes were missing)
      if (import.meta.env.DEV) {
        try {
          logger.debug('useAuth [DEV]: invalid password, forcing demo seed and retrying compare');
          if (typeof db.resetDemoData === 'function') {
            try { await db.resetDemoData(); } catch (e) { /* ignore */ }
          }
          initializeDemoData(true);
          const retryUser = await db.getUserByUsername(username);
          if (retryUser) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const retryUserAny = retryUser as any;
            const retryHash = retryUserAny?.passwordHash ? String(retryUserAny.passwordHash) : '';
            const retryValid = retryHash ? await bcrypt.compare(password, retryHash) : false;
            if (retryValid) {
              const safeRetry: User = { id: retryUserAny.id, username: retryUserAny.username, role: retryUserAny.role, passwordHash: retryHash } as User;
              setUser(safeRetry);
              setCurrentUser(safeRetry);
              return true;
            }
          }
        } catch (err) {
          logger.error('useAuth [DEV]: retry after seed failed', err);
        }
      }

      logger.warn('useAuth: invalid password for', username);
      return false;
    } catch (error) {
      logger.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setCurrentUser(null);
    // Notify other listeners (pages/components) that auth changed and force navigation to login.
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vinchef:auth-changed', { detail: { loggedOut: true } }));
        // Ensure UI resets; navigate to login page to avoid stale state on pages that don't consume auth context properly
        window.location.hash = '#/login';
      }
    } catch (e) {
      // ignore errors during logout navigation
    }
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
