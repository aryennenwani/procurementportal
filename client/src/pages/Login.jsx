import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiErrorMessage } from '../api/client';
import { Button, Input, Spinner } from '../components/Common';

export default function Login() {
  const [email, setEmail] = useState('');
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
      toast.success('Welcome back!');
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid email or password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F5F8FF]">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-[#0B2D71] px-14 py-12">
        <div>
          <p className="text-white font-bold text-xl tracking-tight">Shivtek Spechemi</p>
          <p className="text-blue-200/60 text-sm mt-0.5">Industries Ltd</p>
        </div>
        <div>
          <h2 className="text-white text-3xl font-bold leading-snug max-w-xs">
            Procurement made transparent, accountable, and fast.
          </h2>
          <p className="text-blue-200/60 text-sm mt-4 max-w-xs leading-relaxed">
            Manage vendor quotations, track compliance, and ensure fair selection — all in one place.
          </p>
        </div>
        <p className="text-blue-200/30 text-xs">© {new Date().getFullYear()} Shivtek Spechemi Industries Ltd</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden mb-8 text-center">
            <p className="text-[#0B2D71] font-bold text-xl">Shivtek Spechemi</p>
            <p className="text-gray-500 text-sm">Industries Ltd</p>
          </div>

          <h1 className="text-2xl font-bold text-[#1E2B4A] mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-7">Procurement Manager Portal</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              autoFocus
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
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                {error}
              </div>
            )}

            <Button type="submit" variant="gold" className="w-full py-2.5" disabled={loading}>
              {loading ? <Spinner size={16} className="text-white" /> : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
