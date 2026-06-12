import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Users, TrendingUp, ArrowRight } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader } from '../../components/Common';
import { StatusBadge, RiskBadge } from '../../components/Badges';

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-semibold text-[#1E2B4A]">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </Card>
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

  if (loading) return <PageLoader />;

  const openCount = requirements.filter((r) => r.status === 'Open').length;
  const pendingCount = requirements.filter((r) => r.status === 'Pending').length;
  const totalQuotations = requirements.reduce((sum, r) => sum + r.quotation_count, 0);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold text-[#1E2B4A]">Welcome back, {manager?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500 mt-1">Here's what's happening across your procurement pipeline.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Open requirements"   value={openCount}       accent="bg-[#EEF4FF] text-[#1A56D6]" />
        <StatCard icon={ClipboardList} label="Pending decisions"   value={pendingCount}    accent="bg-amber-50 text-amber-600" />
        <StatCard icon={Users}         label="Registered vendors"  value={vendors.length}  accent="bg-emerald-50 text-emerald-600" />
        <StatCard icon={TrendingUp}    label="Quotations received" value={totalQuotations} accent="bg-violet-50 text-violet-600" />
      </div>

      <div className={`grid grid-cols-1 ${canViewCompliance ? 'lg:grid-cols-3' : ''} gap-5`}>
        <Card className={`${canViewCompliance ? 'lg:col-span-2' : ''} p-6`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#1E2B4A]">Recent requirements</h2>
            <Link to="/dashboard/requirements" className="text-sm text-[#1A56D6] hover:underline flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-2">
            {requirements.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                to={`/dashboard/requirements/${r.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 hover:border-[#1A56D6]/40 hover:bg-[#1A56D6]/5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#1E2B4A] truncate">{r.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.quantity} {r.unit} • {r.quotation_count} quotation{r.quotation_count !== 1 ? 's' : ''} • {r.vendor_count} vendor{r.vendor_count !== 1 ? 's' : ''}</p>
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
            <h2 className="font-semibold text-[#1E2B4A]">Procurement health</h2>
            <Link to="/dashboard/compliance" className="text-sm text-[#1A56D6] hover:underline flex items-center gap-1">
              Details <ArrowRight size={14} />
            </Link>
          </div>
          <div className="flex flex-col items-center py-2">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#DCE8FF" strokeWidth="12" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={score?.score >= 75 ? '#1f7a1f' : score?.score >= 50 ? '#1A56D6' : '#a33'}
                  strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${(score?.score / 100) * 327} 327`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold text-[#1E2B4A]">{score?.score}</span>
                <span className="text-xs text-gray-500">/ 100</span>
              </div>
            </div>
            <p className="mt-3 text-sm font-medium text-[#1E2B4A]">{score?.label}</p>
          </div>
        </Card>
        )}
      </div>
    </div>
  );
}
