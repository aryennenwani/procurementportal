import { useEffect, useState } from 'react';
import { Search, Archive as ArchiveIcon, Lock } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Input, Select, EmptyState } from '../../components/Common';
import { OutcomeBadge } from '../../components/Badges';

const STATUS_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'won', label: 'Won' },
  { value: 'not_selected', label: 'Not selected' },
  { value: 'pending', label: 'Pending decision' },
];

export default function Archive() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ item: '', status: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState({ item: '', status: '', from: '', to: '' });
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

  const statusLabel = (status) => (status === 'Won' ? 'Won' : status === 'Not Selected' ? 'Not Selected' : 'Pending Decision');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1E2B4A] flex items-center gap-2">
          <ArchiveIcon size={22} className="text-[#1A56D6]" /> Proposal Archive
        </h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
          <Lock size={13} /> Read-only and tamper-proof — every quotation ever submitted is permanently retained, including those not selected.
        </p>
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
                <tr key={p.id}>
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
        <p className="text-xs text-gray-400">{proposals.length} proposal{proposals.length !== 1 ? 's' : ''} found. No edit or delete actions exist for archived records.</p>
      )}
    </div>
  );
}
