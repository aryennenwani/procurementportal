import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, ClipboardList } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Button, Input, Textarea, Select, EmptyState } from '../../components/Common';
import { StatusBadge, RiskBadge } from '../../components/Badges';

const UNITS = ['drums', 'MT', 'litres', 'kg'];

const EMPTY_FORM = {
  title: '', description: '', quantity: '', unit: 'drums', grade: '', deadline: '', notes: '',
};

function CreateRequirementModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      const { data } = await api.post('/requirements', {
        ...form,
        quantity: Number(form.quantity),
        deadline: new Date(form.deadline).toISOString(),
      });
      toast.success('Requirement created successfully.');
      onCreated(data.requirement);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.details) {
        const fieldErrors = {};
        err.response.data.details.forEach((d) => { fieldErrors[d.path] = d.msg; });
        setErrors(fieldErrors);
      }
      toast.error(apiErrorMessage(err, 'Could not create requirement.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-[#1C1C1E] text-lg">New procurement requirement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Input label="Item name" required value={form.title} onChange={set('title')} error={errors.title} placeholder="e.g. Industrial Grade Lubricant Oil" />
          <Textarea label="Description" rows={3} value={form.description} onChange={set('description')} error={errors.description} placeholder="Describe the requirement..." />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Quantity" type="number" step="any" min="0" required value={form.quantity} onChange={set('quantity')} error={errors.quantity} placeholder="e.g. 500" />
            <Select label="Unit" required value={form.unit} onChange={set('unit')} error={errors.unit}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <Input label="Grade / Specification" value={form.grade} onChange={set('grade')} error={errors.grade} placeholder="e.g. ISO VG 68" />
          <Input label="Deadline" type="datetime-local" required value={form.deadline} onChange={set('deadline')} error={errors.deadline} />
          <Textarea label="Notes" rows={2} value={form.notes} onChange={set('notes')} error={errors.notes} placeholder="Internal notes (optional)" />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="gold" disabled={submitting}>{submitting ? 'Creating…' : 'Create requirement'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Requirements() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('All');
  const toast = useToast();

  const load = async () => {
    try {
      const { data } = await api.get('/requirements');
      setRequirements(data.requirements);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load requirements.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'All' ? requirements : requirements.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1C1E]">Requirements</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage procurement requirements.</p>
        </div>
        <Button variant="gold" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New requirement
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['All', 'Open', 'Pending', 'Closed'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === s ? 'bg-[#1C1C1E] text-white border-[#1C1C1E]' : 'border-gray-300 text-gray-600 hover:border-[#1C1C1E]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={32} className="text-gray-300" />}
            title={requirements.length === 0 ? 'No requirements yet. Create your first to get started.' : 'No requirements found'}
            subtitle={requirements.length === 0 ? null : (filter === 'All' ? 'Create your first procurement requirement to get started.' : `No requirements with status "${filter}".`)}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Link key={r.id} to={`/dashboard/requirements/${r.id}`}>
              <Card className="p-5 h-full hover:border-[#B8962E]/50 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-[#1C1C1E] leading-snug">{r.title}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{r.description || 'No description provided.'}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
                  <span>{r.quantity} {r.unit}</span>
                  {r.grade && <span>• {r.grade}</span>}
                  <span>• Deadline {new Date(r.deadline).toLocaleDateString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-500">{r.vendor_count} vendor{r.vendor_count !== 1 ? 's' : ''} • {r.quotation_count} quote{r.quotation_count !== 1 ? 's' : ''}</span>
                  {r.risk_level !== 'LOW' && <RiskBadge level={r.risk_level} />}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <CreateRequirementModal
          onClose={() => setShowModal(false)}
          onCreated={(req) => { setShowModal(false); setRequirements((prev) => [req, ...prev]); }}
        />
      )}
    </div>
  );
}
