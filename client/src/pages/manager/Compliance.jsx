import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert, Download, FileText, Trophy, Search, X, Banknote, Grid3x3, TrendingUp, AlertOctagon,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Dot,
} from 'recharts';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Button, Select, EmptyState } from '../../components/Common';
import { RiskBadge } from '../../components/Badges';

const RISK_GAUGE_COLOR = (score) => (score >= 75 ? '#1f7a1f' : score >= 50 ? '#1A56D6' : '#a33');
const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function InvestigateModal({ flag, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.get(`/requirements/${flag.requirement_id}/quotations`)
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load quotation history.')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag.requirement_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-[#1E2B4A] text-lg">Investigate — {flag.requirement_title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Complete quotation history for this requirement.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {loading ? <PageLoader /> : data && (
            <>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                {data.partiality.flags.map((f) => (
                  <div key={f.id} className="flex items-start gap-2.5 text-sm">
                    <RiskBadge level={f.risk_level} />
                    <p className="text-gray-600">{f.description}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {data.quotations.map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100">
                    <div>
                      <p className="font-medium text-[#1E2B4A] text-sm">{q.company_name}</p>
                      <p className="text-xs text-gray-500">₹{q.per_unit_price.toLocaleString('en-IN')} • Submitted {q.submitted_at_ist}</p>
                      {q.outcome === 'won' && q.justification && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1.5 max-w-md">
                          <strong>Justification for non-lowest award:</strong> {q.justification}
                        </p>
                      )}
                    </div>
                    {q.outcome && (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${q.outcome === 'won' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {q.outcome === 'won' ? 'Won' : 'Not selected'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <Link to={`/dashboard/requirements/${flag.requirement_id}`} className="inline-block text-sm text-[#1A56D6] hover:underline">
                Open full requirement →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ExposureCard({ exposure }) {
  return (
    <Card className="p-6">
      <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
        <Banknote size={16} className="text-[#1A56D6]" /> Estimated financial exposure
      </p>
      <p className="text-3xl font-semibold text-[#1E2B4A] mt-2">{INR(exposure?.total_exposure)}</p>
      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
        Sum of (winning bid − lowest bid) × quantity across all {exposure?.requirement_count || 0} HIGH-risk
        requirement{exposure?.requirement_count === 1 ? '' : 's'} — the amount potentially overpaid versus
        simply awarding to the cheapest bidder.
      </p>
    </Card>
  );
}

function CollusionMatrix({ matrix }) {
  if (!matrix || matrix.managers.length === 0 || matrix.vendors.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No award decisions recorded yet.</p>;
  }
  const cellFor = (managerId, vendorId) => matrix.cells.find((c) => c.manager_id === managerId && c.vendor_id === vendorId);

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">Manager \ Vendor</th>
            {matrix.vendors.map((v) => (
              <th key={v.id} className="px-3 py-2 text-xs font-medium text-gray-500 text-center max-w-[120px]">
                <span className="block truncate" title={v.name}>{v.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.managers.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 font-medium text-[#1E2B4A] whitespace-nowrap">{m.name}</td>
              {matrix.vendors.map((v) => {
                const cell = cellFor(m.id, v.id);
                if (!cell) return <td key={v.id} className="px-3 py-2 text-center text-gray-300">—</td>;
                const intensity = Math.min(1, cell.win_share / 100);
                const bg = cell.flagged
                  ? `rgba(220, 38, 38, ${0.15 + intensity * 0.45})`
                  : `rgba(184, 150, 46, ${0.08 + intensity * 0.32})`;
                return (
                  <td key={v.id} className="px-3 py-2 text-center">
                    <div
                      className={`rounded-lg px-2 py-1.5 ${cell.flagged ? 'text-red-800 font-semibold' : 'text-[#1E2B4A]'}`}
                      style={{ backgroundColor: bg }}
                      title={`${cell.wins} win(s) • ${cell.win_share}% of this manager's awards`}
                    >
                      <span className="block text-sm">{cell.wins}</span>
                      <span className="block text-[10px] opacity-70">{cell.win_share}%</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-3">
        Cells highlighted in red mark a vendor winning more than 50% of a manager's awarded requirements
        (with at least 3 decided) — the threshold the Repeat Winner Anomaly signal flags as possible collusion.
      </p>
    </div>
  );
}

function AnomalyDot(props) {
  const { cx, cy, payload } = props;
  if (!payload.is_anomaly) return <Dot cx={cx} cy={cy} r={3} fill="#1A56D6" stroke="#1A56D6" />;
  return <Dot cx={cx} cy={cy} r={5} fill="#dc2626" stroke="#dc2626" />;
}

function PriceHistoryChart({ items }) {
  const [selected, setSelected] = useState(0);
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No winning bids recorded yet — price history will appear here once requirements are decided.</p>;
  }
  const item = items[selected] || items[0];
  const chartData = item.history.map((h, idx) => ({
    name: `#${idx + 1}`,
    price: h.price,
    is_anomaly: h.is_anomaly,
    decided_at_ist: h.decided_at_ist,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <p className="font-medium text-[#1E2B4A] text-sm">{item.item}</p>
          <p className="text-xs text-gray-400 mt-0.5">Average winning price: {INR(item.average_price)} • {item.history.length} decision{item.history.length !== 1 ? 's' : ''}</p>
        </div>
        {items.length > 1 && (
          <Select value={selected} onChange={(e) => setSelected(Number(e.target.value))} className="!py-1.5 !text-xs w-auto">
            {items.map((i, idx) => <option key={i.item} value={idx}>{i.item}</option>)}
          </Select>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCE8FF" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={64}
            tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
          <Tooltip
            formatter={(value) => [INR(value), 'Winning price']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.decided_at_ist || ''}
            contentStyle={{ borderRadius: 10, borderColor: '#e5e7eb', fontSize: 12 }}
          />
          <Line type="monotone" dataKey="price" stroke="#1A56D6" strokeWidth={2} dot={({ key, ...dotProps }) => <AnomalyDot key={key ?? `${dotProps.cx}-${dotProps.cy}`} {...dotProps} />} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-red-600" /> Red points are &gt;15% above this item's historical average — flagged as Historical Price Drift.
      </p>
    </div>
  );
}

function SuspiciousTransactions({ transactions, onInvestigate }) {
  if (transactions.length === 0) {
    return <Card><EmptyState icon={<AlertOctagon size={32} className="text-gray-300" />} title="No suspicious transactions" subtitle="No HIGH-risk flags are currently active. This view will populate the moment a high-risk pattern is detected." /></Card>;
  }
  return (
    <div className="space-y-3">
      {transactions.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <RiskBadge level={t.risk_level} />
              <div className="min-w-0">
                <p className="font-medium text-[#1E2B4A] text-sm">{t.requirement_title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>
                <p className="text-xs text-gray-400 mt-1">{t.flag_type.replace(/_/g, ' ')} • Detected {t.detected_at_ist}</p>
              </div>
            </div>
            <Button variant="outline" className="!py-1.5 !px-3 text-xs shrink-0" onClick={() => onInvestigate(t)}>
              <Search size={13} /> Investigate
            </Button>
          </div>
          {t.financial_exposure && t.financial_exposure.total_exposure > 0 && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex flex-wrap items-center gap-x-2">
              <Banknote size={14} className="shrink-0" />
              <span>
                (₹{t.financial_exposure.winning_price.toLocaleString('en-IN')} − ₹{t.financial_exposure.lowest_price.toLocaleString('en-IN')})
                {' × '}{t.financial_exposure.quantity} {t.financial_exposure.unit} ={' '}
                <strong>{INR(t.financial_exposure.total_exposure)} potential loss</strong>
                {' '}({t.financial_exposure.winning_vendor} awarded over {t.financial_exposure.lowest_vendor})
              </span>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function Compliance() {
  const [score, setScore] = useState(null);
  const [flags, setFlags] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [exposure, setExposure] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [suspicious, setSuspicious] = useState([]);
  const [loading, setLoading] = useState(true);
  const [investigating, setInvestigating] = useState(null);
  const [riskFilter, setRiskFilter] = useState('All');
  const [view, setView] = useState('flags');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/compliance/score'),
      api.get('/compliance/flags'),
      api.get('/compliance/leaderboard'),
      api.get('/compliance/financial-exposure'),
      api.get('/compliance/collusion-matrix'),
      api.get('/compliance/price-history'),
      api.get('/compliance/suspicious-transactions'),
    ]).then(([s, f, l, e, m, p, st]) => {
      if (cancelled) return;
      setScore(s.data);
      setFlags(f.data.flags);
      setLeaderboard(l.data.leaderboard);
      setExposure(e.data);
      setMatrix(m.data);
      setPriceHistory(p.data.items);
      setSuspicious(st.data.transactions);
    }).catch((err) => toast.error(apiErrorMessage(err, 'Could not load compliance data.')))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [toast]);

  const downloadReport = async (format) => {
    try {
      const res = await api.get(`/compliance/report/${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `procurement-audit-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Audit report (${format.toUpperCase()}) downloaded.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not generate audit report.'));
    }
  };

  const filteredFlags = useMemo(
    () => (riskFilter === 'All' ? flags : flags.filter((f) => f.risk_level === riskFilter)),
    [flags, riskFilter]
  );

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E2B4A] flex items-center gap-2">
            <ShieldAlert size={22} className="text-[#1A56D6]" /> Compliance Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">Anti-corruption, partiality & embezzlement detection overview.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadReport('csv')}><Download size={15} /> CSV report</Button>
          <Button variant="outline" onClick={() => downloadReport('pdf')}><FileText size={15} /> PDF report</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="p-6 flex flex-col items-center justify-center">
          <p className="text-sm font-medium text-gray-500 mb-3">Procurement health score</p>
          <div className="relative w-40 h-40">
            <svg viewBox="0 0 120 120" className="w-40 h-40 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#DCE8FF" strokeWidth="13" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke={RISK_GAUGE_COLOR(score?.score)}
                strokeWidth="13" strokeLinecap="round"
                strokeDasharray={`${(score?.score / 100) * 327} 327`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-semibold text-[#1E2B4A]">{score?.score}</span>
              <span className="text-xs text-gray-500">out of 100</span>
            </div>
          </div>
          <p className="mt-3 font-medium text-[#1E2B4A]">{score?.label}</p>
        </Card>

        <ExposureCard exposure={exposure} />

        <Card className="p-6">
          <p className="font-medium text-[#1E2B4A] mb-4 flex items-center gap-2">
            <Trophy size={17} className="text-[#1A56D6]" /> Vendor win-rate leaderboard
          </p>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No quotations recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {leaderboard.slice(0, 5).map((v, idx) => (
                <div key={v.id} className="flex items-center gap-3">
                  <span className="w-6 text-sm font-medium text-gray-400">#{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-[#1E2B4A] truncate">{v.company_name}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{v.win_rate}% ({v.wins}/{v.total_bids})</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${v.win_rate > 60 ? 'bg-red-400' : 'bg-[#1A56D6]'}`}
                        style={{ width: `${v.win_rate}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-6">
          <p className="font-medium text-[#1E2B4A] mb-4 flex items-center gap-2">
            <Grid3x3 size={17} className="text-[#1A56D6]" /> Manager–vendor collusion matrix
          </p>
          <CollusionMatrix matrix={matrix} />
        </Card>

        <Card className="p-6">
          <p className="font-medium text-[#1E2B4A] mb-4 flex items-center gap-2">
            <TrendingUp size={17} className="text-[#1A56D6]" /> Item price history
          </p>
          <PriceHistoryChart items={priceHistory} />
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setView('flags')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                view === 'flags' ? 'bg-[#1A56D6] text-white border-[#1A56D6]' : 'border-gray-300 text-gray-600 hover:border-[#1A56D6]'
              }`}
            >
              Flagged requirements ({flags.length})
            </button>
            <button
              onClick={() => setView('suspicious')}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                view === 'suspicious' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:border-red-400'
              }`}
            >
              <AlertOctagon size={14} /> Suspicious transactions ({suspicious.length})
            </button>
          </div>
          {view === 'flags' && (
            <div className="flex gap-2">
              {['All', 'HIGH', 'MEDIUM', 'LOW'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskFilter(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    riskFilter === r ? 'bg-[#1A56D6] text-white border-[#1A56D6]' : 'border-gray-300 text-gray-600 hover:border-[#1A56D6]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'flags' ? (
          filteredFlags.length === 0 ? (
            <Card><EmptyState
              icon={<ShieldAlert size={32} className="text-gray-300" />}
              title={flags.length === 0 ? 'No flags detected. Procurement health is clean.' : 'No flags found'}
              subtitle={flags.length === 0 ? null : 'No partiality concerns have been detected for this filter.'}
            /></Card>
          ) : (
            <div className="space-y-3">
              {filteredFlags.map((f) => (
                <Card key={f.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <RiskBadge level={f.risk_level} />
                    <div className="min-w-0">
                      <p className="font-medium text-[#1E2B4A] text-sm">{f.requirement_title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{f.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{f.flag_type.replace(/_/g, ' ')} • Detected {f.detected_at_ist}</p>
                    </div>
                  </div>
                  <Button variant="outline" className="!py-1.5 !px-3 text-xs shrink-0" onClick={() => setInvestigating(f)}>
                    <Search size={13} /> Investigate
                  </Button>
                </Card>
              ))}
            </div>
          )
        ) : (
          <SuspiciousTransactions transactions={suspicious} onInvestigate={setInvestigating} />
        )}
        <p className="text-xs text-gray-400 mt-3">All HIGH risk flags are permanently logged and cannot be dismissed or deleted.</p>
      </div>

      {investigating && <InvestigateModal flag={investigating} onClose={() => setInvestigating(null)} />}
    </div>
  );
}
