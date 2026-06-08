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

  return (
    <AuthContext.Provider value={{ manager, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
