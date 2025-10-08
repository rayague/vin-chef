/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, getCurrentUser, setCurrentUser, getUserByUsername, initializeDemoData } from '@/lib/storage';

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
      let foundUser = getUserByUsername(username);

      // If not found and we're in DEV, attempt to re-seed demo data once and retry (helps when dev server changed without restart)
      if (!foundUser && import.meta.env.DEV) {
        try {
          console.debug('useAuth [DEV]: user not found, forcing demo seed and retrying');
          initializeDemoData(true);
          foundUser = getUserByUsername(username);
        } catch (err) {
          console.error('useAuth [DEV]: initializeDemoData failed', err);
        }
      }

      if (!foundUser) {
        console.warn('useAuth: no local user found for', username);
        return false;
      }

      // Developer-friendly debug: in dev show the stored hash and attempt compare so we can see why it fails
      if (import.meta.env.DEV) {
        console.debug('useAuth [DEV]: foundUser', { username: foundUser.username, passwordHash: foundUser.passwordHash });
      }

      let isValid = false;
      try {
        isValid = await bcrypt.compare(password, foundUser.passwordHash);
      } catch (err) {
        console.error('useAuth: bcrypt.compare threw', err);
      }

      console.debug('useAuth: bcrypt.compare result for', username, isValid);
      if (isValid) {
        setUser(foundUser);
        setCurrentUser(foundUser);
        return true;
      }

      // If invalid in DEV, try one more time after forcing demo seed (covers situation where hashes were missing)
      if (import.meta.env.DEV) {
        try {
          console.debug('useAuth [DEV]: invalid password, forcing demo seed and retrying compare');
          initializeDemoData(true);
          const retryUser = getUserByUsername(username);
          if (retryUser) {
            const retryValid = await bcrypt.compare(password, retryUser.passwordHash);
            console.debug('useAuth [DEV]: retry bcrypt.compare result for', username, retryValid);
            if (retryValid) {
              setUser(retryUser);
              setCurrentUser(retryUser);
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
