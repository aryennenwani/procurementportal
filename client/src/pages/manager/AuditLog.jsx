import { Fragment, useEffect, useState } from 'react';
import { ScrollText, Search, Lock } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Input, EmptyState } from '../../components/Common';

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action_type: '', performed_by: '' });
  const [appliedFilters, setAppliedFilters] = useState({ action_type: '', performed_by: '' });
  const [expanded, setExpanded] = useState(null);
  const toast = useToast();

  const load = async (f = filters) => {
    setLoading(true);
    setAppliedFilters(f);
    try {
      const params = {};
      if (f.action_type) params.action_type = f.action_type;
      if (f.performed_by) params.performed_by = f.performed_by;
      const { data } = await api.get('/audit-log', { params });
      setEntries(data.entries);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load the audit log.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load({ action_type: '', performed_by: '' }); /* eslint-disable-next-line */ }, []);

  const onApply = (e) => {
    e.preventDefault();
    load(filters);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1C1C1E] flex items-center gap-2">
          <ScrollText size={22} className="text-[#B8962E]" /> Audit Log
        </h1>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
          <Lock size={13} /> Read-only — every action in the system is recorded with timestamp, actor, and IP address. Nothing here can be edited or deleted.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={onApply} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
          <Input
            label="Filter by action type"
            placeholder="e.g. REQUIREMENT_CREATED"
            value={filters.action_type}
            onChange={(e) => setFilters((f) => ({ ...f, action_type: e.target.value }))}
            className="!py-2"
          />
          <Input
            label="Filter by performer"
            placeholder="e.g. manager, vendor, admin@company.com"
            value={filters.performed_by}
            onChange={(e) => setFilters((f) => ({ ...f, performed_by: e.target.value }))}
            className="!py-2"
          />
          <button type="submit" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#1C1C1E] text-white hover:bg-black transition-colors">
            <Search size={15} /> Search
          </button>
        </form>
      </Card>

      {loading ? (
        <PageLoader />
      ) : entries.length === 0 ? (
        <Card><EmptyState
          icon={<ScrollText size={32} className="text-gray-300" />}
          title={Object.values(appliedFilters).some(Boolean) ? 'No matching entries' : 'No activity logged yet.'}
          subtitle={Object.values(appliedFilters).some(Boolean) ? 'Try a different filter.' : null}
        /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Performed by</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-left px-4 py-3 font-medium">Timestamp (IST)</th>
                <th className="text-left px-4 py-3 font-medium">IP address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <Fragment key={e.id}>
                  <tr
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[#1C1C1E] whitespace-nowrap">{e.action_type}</td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-[220px]">{e.performed_by}</td>
                    <td className="px-4 py-3 text-gray-500">{e.target_type ? `${e.target_type}${e.target_id ? ` #${e.target_id}` : ''}` : '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{e.timestamp_ist}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{e.ip_address || '—'}</td>
                  </tr>
                  {expanded === e.id && e.details && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{JSON.stringify(e.details, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {!loading && entries.length > 0 && (
        <p className="text-xs text-gray-400">Showing {entries.length} most recent entries. Click a row to view full details.</p>
      )}
    </div>
  );
}
