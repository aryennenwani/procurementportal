import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, FileCheck2, Gauge, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiErrorMessage } from '../api/client';
import { Button, Input, Spinner } from '../components/Common';

const HIGHLIGHTS = [
  { icon: FileCheck2, title: 'Sealed competitive bidding', text: 'Bid amounts stay hidden until at least two quotations are in.' },
  { icon: ShieldCheck, title: 'Built-in partiality detection', text: 'Every award decision is screened, justified, and permanently logged.' },
  { icon: Gauge, title: 'SAP-connected purchasing', text: 'Winning bids raise purchase orders straight into your ERP.' },
];

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
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col justify-between w-[46%] relative overflow-hidden px-14 py-12 sidebar-gradient">
        {/* Decorative glows + grid */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#2E6BFF]/25 blur-3xl" />
          <div className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#7EA6FF]/15 blur-3xl" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden="true">
            <defs>
              <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
                <path d="M 42 0 L 0 0 0 42" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative bg-white rounded-xl px-5 py-4 inline-block self-start shadow-xl shadow-black/25">
          <img src="/shivtek-logo.png" alt="Shivtek Spechemi Industries Ltd" className="h-14 object-contain" />
        </div>

        <div className="relative">
          <h2 className="text-white text-[34px] font-bold leading-[1.15] tracking-[-0.02em] max-w-md">
            Procurement made transparent, accountable, and fast.
          </h2>
          <div className="mt-9 space-y-5 max-w-md">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 backdrop-blur">
                  <Icon size={17} className="text-[#9DBCFF]" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{title}</p>
                  <p className="text-blue-200/60 text-[13px] mt-0.5 leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-blue-200/30 text-xs">© {new Date().getFullYear()} Shivtek Spechemi Industries Ltd</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] animate-page-in">
          {/* Mobile brand */}
          <div className="lg:hidden mb-8 text-center">
            <img src="/shivtek-logo.png" alt="Shivtek Spechemi Industries Ltd" className="h-14 object-contain mx-auto" />
          </div>

          <div className="card-surface p-8 sm:p-9">
            <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[#101C3B] mb-1">Sign in</h1>
            <p className="text-sm text-[#64748F] mb-7">Procurement Manager Portal</p>

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
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 animate-fade-in">
                  {error}
                </div>
              )}

              <Button type="submit" variant="gold" className="w-full !py-2.5 mt-1" disabled={loading}>
                {loading ? <Spinner size={16} className="text-white" /> : <>Sign in <ArrowRight size={15} /></>}
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-[#8A97B5] mt-6">
            Secure access for authorised procurement staff only.
          </p>
        </div>
      </div>
    </div>
  );
}
