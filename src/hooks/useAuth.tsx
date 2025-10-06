import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import bcrypt from 'bcryptjs';
import { User, getCurrentUser, setCurrentUser, getUserByUsername } from '@/lib/storage';

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
      const foundUser = getUserByUsername(username);
      
      if (!foundUser) {
        return false;
      }

      // Compare password (for demo, we'll use a simple comparison)
      // In production with bcrypt, use: await bcrypt.compare(password, foundUser.passwordHash)
      const isValid = await bcrypt.compare(password, foundUser.passwordHash);
      
      if (isValid) {
        setUser(foundUser);
        setCurrentUser(foundUser);
        return true;
      }
      
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
