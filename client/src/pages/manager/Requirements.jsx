import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, ClipboardList } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Card, PageLoader, Button, Input, Textarea, Select, EmptyState, Modal, PageHeader } from '../../components/Common';
import { StatusBadge, RiskBadge } from '../../components/Badges';

const UNITS = ['drums', 'MT', 'litres', 'kg'];

const EMPTY_FORM = {
  title: '', description: '', quantity: '', unit: 'drums', grade: '', deadline: '', notes: '',
};

function CreateRequirementModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.get('/items')
      .then(({ data }) => setItems(data.items))
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load item list.')))
      .finally(() => setLoadingItems(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => {
    const value = e.target.value;
    if (key === 'title') {
      const item = items.find((i) => i.name === value);
      setForm((f) => ({ ...f, title: value, unit: item?.default_unit || f.unit }));
      return;
    }
    setForm((f) => ({ ...f, [key]: value }));
  };

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
    <Modal onClose={onClose} className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-[#1E2B4A] text-lg">New procurement requirement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Select label="Item name" required value={form.title} onChange={set('title')} error={errors.title} disabled={loadingItems}>
            <option value="">{loadingItems ? 'Loading items…' : 'Select an item…'}</option>
            {items.map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
          </Select>
          {!loadingItems && items.length === 0 && (
            <p className="text-xs text-amber-600">No items in the master list yet. Ask an admin to add items under Item Master.</p>
          )}
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
    </Modal>
  );
}

export default function Requirements() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('All');
  const toast = useToast();
  const { isAdmin } = useAuth();

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
      <PageHeader title="Requirements" subtitle="Create and manage procurement requirements.">
        <Button variant="gold" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New requirement
        </Button>
      </PageHeader>

      <div className="flex gap-2 flex-wrap">
        {['All', 'Open', 'Pending', 'Closed'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all duration-150 ${
              filter === s
                ? 'bg-[#1A56D6] text-white border-[#1A56D6] shadow-sm shadow-[#1A56D6]/30'
                : 'border-[#D4DEF0] bg-white text-gray-600 hover:border-[#1A56D6]/60 hover:text-[#1A56D6]'
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {filtered.map((r) => (
            <Link key={r.id} to={`/dashboard/requirements/${r.id}`}>
              <Card hover className="p-5 h-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-[#1E2B4A] leading-snug">{r.title}</h3>
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
                  {isAdmin && r.risk_level !== 'LOW' && <RiskBadge level={r.risk_level} />}
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
