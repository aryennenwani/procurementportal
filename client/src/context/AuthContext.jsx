import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [manager, setManager] = useState(() => {
    const raw = localStorage.getItem('vqp_manager');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('vqp_token'));

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('vqp_token', data.token);
    localStorage.setItem('vqp_manager', JSON.stringify(data.manager));
    setToken(data.token);
    setManager(data.manager);
    return data.manager;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('vqp_token');
    localStorage.removeItem('vqp_manager');
    setToken(null);
    setManager(null);
  }, []);

  // Re-fetches the manager from the server and syncs localStorage.
  // Call this after an admin changes another user's permissions or role.
  const refreshManager = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      localStorage.setItem('vqp_manager', JSON.stringify(data.manager));
      setManager(data.manager);
    } catch {
      // silently ignore — stale data is better than crashing
    }
  }, []);

  const hasPermission = useCallback(
    (permission) => {
      if (!manager) return false;
      if (manager.is_admin) return true;
      return Array.isArray(manager.permissions) && manager.permissions.includes(permission);
    },
    [manager]
  );

  return (
    <AuthContext.Provider
      value={{
        manager,
        token,
        login,
        logout,
        refreshManager,
        hasPermission,
        isAuthenticated: !!token,
        isAdmin: !!(manager?.is_admin),
        isPrimaryAdmin: !!(manager?.is_primary_admin),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
