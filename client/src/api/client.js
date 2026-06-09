import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vqp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // For vendor portal routes, inject the session token as a header so it works
  // on mobile browsers that block third-party cookies (iOS Safari ITP, etc.).
  const vendorMatch = config.url?.match(/^\/vendor\/([^/]+)/);
  if (vendorMatch) {
    const sessionToken = localStorage.getItem(`vqp_vs_${vendorMatch[1]}`);
    if (sessionToken) config.headers['X-Vendor-Session'] = sessionToken;
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname.startsWith('/dashboard')) {
      localStorage.removeItem('vqp_token');
      localStorage.removeItem('vqp_manager');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  return err?.response?.data?.error || err?.message || fallback;
}

export default api;
