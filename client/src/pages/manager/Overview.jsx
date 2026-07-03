import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Users, TrendingUp, ArrowRight, Hourglass, Sparkles } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, Skeleton, SkeletonStatRow, AnimatedNumber } from '../../components/Common';
import { StatusBadge, RiskBadge } from '../../components/Badges';

function StatCard({ icon: Icon, label, value, chip, bar, glow }) {
  return (
    <Card hover className="p-5 relative overflow-hidden group">
      <span className={`absolute inset-x-0 top-0 h-[3px] ${bar}`} />
      <div className={`absolute -right-8 -top-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-2xl ${glow}`} />
      <div className="flex items-center gap-4 relative">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${chip}`}>
          <Icon size={21} />
        </div>
        <div>
          <p className="text-[28px] leading-none font-bold tracking-[-0.02em] text-[#101C3B]">
            <AnimatedNumber value={value} />
          </p>
          <p className="text-[13px] text-[#64748F] mt-1.5 font-medium">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-7">
      <Skeleton className="h-[120px] w-full !rounded-2xl" />
      <SkeletonStatRow />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card-surface p-6 space-y-3">
          <Skeleton className="h-5 w-44 mb-4" />
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full !rounded-xl" />)}
        </div>
        <div className="card-surface p-6 flex flex-col items-center">
          <Skeleton className="h-5 w-40 mb-6 self-start" />
          <Skeleton className="w-36 h-36 !rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function Overview() {
  const [requirements, setRequirements] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const { manager, hasPermission } = useAuth();
  const toast = useToast();
  const canViewCompliance = hasPermission('view_compliance');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const calls = [api.get('/requirements'), api.get('/vendors')];
        if (canViewCompliance) {
          calls.push(api.get('/compliance/score'));
        }
        const [reqRes, vendorRes, scoreRes] = await Promise.all(calls);
        if (cancelled) return;
        setRequirements(reqRes.data.requirements);
        setVendors(vendorRes.data.vendors);
        if (canViewCompliance) {
          setScore(scoreRes.data);
        }
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Could not load dashboard data.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [toast, canViewCompliance]);

  if (loading) return <OverviewSkeleton />;

  const openCount = requirements.filter((r) => r.status === 'Open').length;
  const pendingCount = requirements.filter((r) => r.status === 'Pending').length;
  const totalQuotations = requirements.reduce((sum, r) => sum + r.quotation_count, 0);
  const gaugeColor = score?.score >= 75 ? '#059669' : score?.score >= 50 ? '#1A56D6' : '#DC2626';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-7">
      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-7 sm:px-9 py-7 sm:py-8 relative overflow-hidden shadow-xl shadow-[#0B2D71]/20">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl animate-float-a pointer-events-none" />
        <div className="absolute -bottom-20 right-32 w-44 h-44 rounded-full bg-[#7EA6FF]/20 blur-2xl animate-float-b pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-blue-200/70 text-xs font-semibold tracking-[0.14em] uppercase flex items-center gap-1.5">
              <Sparkles size={13} /> {today}
            </p>
            <h1 className="text-white text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] mt-1.5">
              Welcome back, {manager?.name?.split(' ')[0]}
            </h1>
            <p className="text-blue-100/70 text-sm mt-1">Here's what's happening across your procurement pipeline.</p>
          </div>
          <Link
            to="/dashboard/requirements"
            className="btn-shine self-start sm:self-center inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-white/[0.12] hover:bg-white/[0.2] border border-white/20 text-white text-sm font-semibold backdrop-blur transition-all duration-200 hover:gap-3"
          >
            View requirements <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <StatCard icon={ClipboardList} label="Open requirements"   value={openCount}       chip="bg-gradient-to-br from-[#EAF1FF] to-[#D8E6FF] text-[#1A56D6]"     bar="bg-gradient-to-r from-[#1A56D6] to-[#7EA6FF]"       glow="bg-[#1A56D6]/20" />
        <StatCard icon={Hourglass}     label="Pending decisions"   value={pendingCount}    chip="bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600"      bar="bg-gradient-to-r from-amber-500 to-amber-300"       glow="bg-amber-400/25" />
        <StatCard icon={Users}         label="Registered vendors"  value={vendors.length}  chip="bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600" bar="bg-gradient-to-r from-emerald-500 to-emerald-300"  glow="bg-emerald-400/25" />
        <StatCard icon={TrendingUp}    label="Quotations received" value={totalQuotations} chip="bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600"   bar="bg-gradient-to-r from-violet-500 to-violet-300"     glow="bg-violet-400/25" />
      </div>

      <div className={`grid grid-cols-1 ${canViewCompliance ? 'lg:grid-cols-3' : ''} gap-5`}>
        <Card className={`${canViewCompliance ? 'lg:col-span-2' : ''} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#101C3B]">Recent requirements</h2>
            <Link to="/dashboard/requirements" className="group text-sm font-medium text-[#1A56D6] hover:underline flex items-center gap-1">
              View all <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="space-y-2 stagger-children">
            {requirements.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                to={`/dashboard/requirements/${r.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#EBF0FA] hover:border-[#1A56D6]/40 hover:bg-[#1A56D6]/[0.04] hover:shadow-md hover:shadow-[#1A56D6]/5 hover:-translate-y-px transition-all duration-200"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-[#1E2B4A] truncate">{r.title}</p>
                  <p className="text-xs text-[#8A97B5] mt-0.5">{r.quantity} {r.unit} • {r.quotation_count} quotation{r.quotation_count !== 1 ? 's' : ''} • {r.vendor_count} vendor{r.vendor_count !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.risk_level !== 'LOW' && <RiskBadge level={r.risk_level} />}
                  <StatusBadge status={r.status} />
                </div>
              </Link>
            ))}
            {requirements.length === 0 && <p className="text-sm text-gray-500 py-6 text-center">No requirements created yet.</p>}
          </div>
        </Card>

        {canViewCompliance && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#101C3B]">Procurement health</h2>
            <Link to="/dashboard/compliance" className="group text-sm font-medium text-[#1A56D6] hover:underline flex items-center gap-1">
              Details <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="flex flex-col items-center py-2">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90" style={{ filter: `drop-shadow(0 4px 10px ${gaugeColor}33)` }}>
                <circle cx="60" cy="60" r="52" fill="none" stroke="#E5EDFC" strokeWidth="11" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={gaugeColor}
                  strokeWidth="11" strokeLinecap="round"
                  strokeDasharray="327"
                  strokeDashoffset={327 - (score?.score / 100) * 327}
                  className="animate-gauge"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[34px] font-bold tracking-[-0.02em] text-[#101C3B]">
                  <AnimatedNumber value={score?.score} duration={1200} />
                </span>
                <span className="text-xs text-[#8A97B5] font-medium">/ 100</span>
              </div>
            </div>
            <p className="mt-3 text-sm font-semibold" style={{ color: gaugeColor }}>{score?.label}</p>
          </div>
        </Card>
        )}
      </div>
    </div>
  );
}
