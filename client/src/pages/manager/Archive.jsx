import { useEffect, useState } from 'react';
import { Search, Archive as ArchiveIcon, Lock, Download, X } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Button, Input, Select, EmptyState } from '../../components/Common';
import { OutcomeBadge } from '../../components/Badges';

const STATUS_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'won', label: 'Won' },
  { value: 'not_selected', label: 'Not selected' },
  { value: 'pending', label: 'Pending decision' },
];

function ProposalDetailModal({ proposal, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.get(`/requirements/${proposal.requirement_id}/quotations`)
      .then(({ data }) => setData(data))
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load requirement details.')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.requirement_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-[#1E2B4A] text-lg">{proposal.requirement_title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Requirement summary, vendors and competing bids.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {loading ? <PageLoader /> : data && (
            <>
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Quantity</p><p className="font-medium text-[#1E2B4A]">{data.requirement.quantity} {data.requirement.unit}</p></div>
                <div><p className="text-xs text-gray-400">Grade</p><p className="font-medium text-[#1E2B4A]">{data.requirement.grade || '—'}</p></div>
                <div><p className="text-xs text-gray-400">Status</p><p className="font-medium text-[#1E2B4A]">{data.requirement.status}</p></div>
                <div><p className="text-xs text-gray-400">Raised by</p><p className="font-medium text-[#1E2B4A]">{data.requirement.created_by_name}</p></div>
                <div><p className="text-xs text-gray-400">Deadline</p><p className="font-medium text-[#1E2B4A]">{new Date(data.requirement.deadline).toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs text-gray-400">Created</p><p className="font-medium text-[#1E2B4A]">{data.requirement.created_at_ist}</p></div>
              </div>

              {data.assigned_vendors?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Assigned vendors</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.assigned_vendors.map((v) => (
                      <span key={v.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{v.company_name}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Quotations received</p>
                <div className="space-y-2">
                  {data.quotations.map((q) => (
                    <div key={q.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${q.vendor_id === proposal.vendor_id ? 'border-[#1A56D6]/40 bg-[#1A56D6]/5' : 'border-gray-100'}`}>
                      <div>
                        <p className="font-medium text-[#1E2B4A] text-sm">{q.company_name}</p>
                        <p className="text-xs text-gray-500">
                          {q.per_unit_price !== null ? `₹${q.per_unit_price.toLocaleString('en-IN')} / ${data.requirement.unit}` : 'Hidden'} • Submitted {q.submitted_at_ist}
                        </p>
                        {q.outcome === 'won' && q.justification && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mt-1.5 max-w-md">
                            <strong>Justification for non-lowest award:</strong> {q.justification}
                          </p>
                        )}
                        {q.rejection_reason && (
                          <p className="text-xs text-gray-400 mt-1 max-w-md">{q.rejection_reason}</p>
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
                {data.bids_hidden && (
                  <p className="text-xs text-gray-400 mt-2">Prices are hidden until at least 2 bids are received (or the deadline is within 6 hours with a single bid).</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Archive() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ item: '', status: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState({ item: '', status: '', from: '', to: '' });
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const load = async (f = filters) => {
    setLoading(true);
    setAppliedFilters(f);
    try {
      const params = {};
      if (f.item) params.item = f.item;
      if (f.status) params.status = f.status;
      if (f.from) params.from = f.from;
      if (f.to) params.to = f.to;
      const { data } = await api.get('/archive', { params });
      setProposals(data.proposals);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load the proposal archive.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load({ item: '', status: '', from: '', to: '' }); /* eslint-disable-next-line */ }, []);

  const onFilterChange = (key) => (e) => {
    const next = { ...filters, [key]: e.target.value };
    setFilters(next);
  };

  const onApply = (e) => {
    e.preventDefault();
    load(filters);
  };

  const downloadPdf = async () => {
    setExporting(true);
    try {
      const params = {};
      if (appliedFilters.item) params.item = appliedFilters.item;
      if (appliedFilters.status) params.status = appliedFilters.status;
      if (appliedFilters.from) params.from = appliedFilters.from;
      if (appliedFilters.to) params.to = appliedFilters.to;
      const res = await api.get('/archive/export/pdf', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proposal-archive.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Proposal archive (PDF) downloaded.');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not generate PDF export.'));
    } finally {
      setExporting(false);
    }
  };

  const statusLabel = (status) => (status === 'Won' ? 'Won' : status === 'Not Selected' ? 'Not Selected' : 'Pending Decision');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E2B4A] flex items-center gap-2">
            <ArchiveIcon size={22} className="text-[#1A56D6]" /> Proposal Archive
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <Lock size={13} /> Read-only and tamper-proof — every quotation ever submitted is permanently retained, including those not selected.
          </p>
        </div>
        <Button variant="outline" onClick={downloadPdf} disabled={exporting}>
          <Download size={15} /> {exporting ? 'Generating…' : 'PDF export'}
        </Button>
      </div>

      <Card className="p-5">
        <form onSubmit={onApply} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <Input
            label="Search by item"
            placeholder="e.g. Lubricant Oil"
            value={filters.item}
            onChange={onFilterChange('item')}
            className="!py-2"
          />
          <Select label="Outcome" value={filters.status} onChange={onFilterChange('status')} className="!py-2">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Input label="From date" type="date" value={filters.from} onChange={onFilterChange('from')} className="!py-2" />
          <Input label="To date" type="date" value={filters.to} onChange={onFilterChange('to')} className="!py-2" />
          <button type="submit" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#0B2D71] text-white hover:bg-black transition-colors">
            <Search size={15} /> Search
          </button>
        </form>
      </Card>

      {loading ? (
        <PageLoader />
      ) : proposals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArchiveIcon size={32} className="text-gray-300" />}
            title={Object.values(appliedFilters).some(Boolean) ? 'No proposals match your filters' : 'No proposals archived yet.'}
            subtitle={Object.values(appliedFilters).some(Boolean) ? 'Try adjusting your search criteria, or wait for vendors to submit quotations.' : null}
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Vendor</th>
                <th className="text-left px-4 py-3 font-medium">Requirement</th>
                <th className="text-right px-4 py-3 font-medium">Per-unit price</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
                <th className="text-left px-4 py-3 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {proposals.map((p) => (
                <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-[#1E2B4A]">{p.vendor_name}</p>
                    <p className="text-xs text-gray-500">{p.vendor_category}</p>
                  </td>
                  <td className="px-4 py-3.5 text-[#1E2B4A]">{p.requirement_title}</td>
                  <td className="px-4 py-3.5 text-right text-[#1E2B4A] font-medium">
                    {p.per_unit_price !== null ? `₹${p.per_unit_price.toLocaleString('en-IN')} / ${p.unit}` : <span className="text-gray-400 italic text-xs">Hidden</span>}
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{p.submitted_at_ist}</td>
                  <td className="px-4 py-3.5">
                    <OutcomeBadge outcome={statusLabel(p.status)} />
                    {p.rejection_reason && <p className="text-xs text-gray-400 mt-1 max-w-[220px]">{p.rejection_reason}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {!loading && proposals.length > 0 && (
        <p className="text-xs text-gray-400">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''} found. No edit or delete actions exist for archived records. Click a row for details.</p>
      )}

      {selected && <ProposalDetailModal proposal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
