import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiErrorMessage } from '../api/client';
import { Button, Input, Spinner } from '../components/Common';

export default function Login() {
  const [email, setEmail] = useState('admin@company.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back! You are now signed in.');
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to sign in. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#1C1C1E] flex items-center justify-center mb-3">
            <ShieldCheck className="text-[#B8962E]" size={24} />
          </div>
          <h1 className="text-2xl font-semibold text-[#1C1C1E]">Procurement Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Purchase Manager sign-in</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-7 space-y-4">
          <Input
            label="Email address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <Button type="submit" variant="gold" className="w-full" disabled={loading}>
            {loading ? <Spinner size={16} className="text-white" /> : 'Sign in'}
          </Button>
          <p className="text-xs text-gray-400 text-center pt-1">
            Default credentials: <span className="font-mono">admin@company.com</span> / <span className="font-mono">admin123</span>
          </p>
        </form>
      </div>
    </div>
  );
}
