import { useEffect, useState } from 'react';
import { Plus, X, UserCog, Trash2 } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Button, Input, EmptyState } from '../../components/Common';

const EMPTY_FORM = { name: '', email: '', password: '' };

function AddManagerModal({ onClose, onCreated }) {
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
      const { data } = await api.post('/managers', form);
      toast.success(`${data.manager.name} added as a procurement manager.`);
      onCreated(data.manager);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.details) {
        const fieldErrors = {};
        err.response.data.details.forEach((d) => { fieldErrors[d.path] = d.msg; });
        setErrors(fieldErrors);
      }
      toast.error(apiErrorMessage(err, 'Could not add manager.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-[#1E2B4A] text-lg">Add procurement manager</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Priya Sharma" />
          <Input label="Email address" type="email" required value={form.email} onChange={set('email')} error={errors.email} placeholder="priya@company.com" />
          <Input label="Password" type="password" required value={form.password} onChange={set('password')} error={errors.password} placeholder="Minimum 8 characters" />
          <p className="text-xs text-gray-400">
            Procurement managers can raise requirements and assign vendors. They cannot add or remove other managers.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="gold" disabled={submitting}>{submitting ? 'Adding…' : 'Add manager'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ManagersList() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();

  const load = async () => {
    try {
      const { data } = await api.get('/managers');
      setManagers(data.managers);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load managers.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const removeManager = async (m) => {
    if (!window.confirm(`Remove ${m.name} (${m.email})? They will lose portal access immediately.`)) return;
    setDeleting(m.id);
    try {
      await api.delete(`/managers/${m.id}`);
      toast.success(`${m.name} removed.`);
      setManagers((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not remove manager.'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E2B4A]">Procurement Managers</h1>
          <p className="text-sm text-gray-500 mt-1">Add or remove manager accounts. Only admins can manage this list.</p>
        </div>
        <Button variant="gold" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add manager
        </Button>
      </div>

      {loading ? (
        <PageLoader />
      ) : managers.length === 0 ? (
        <Card>
          <EmptyState icon={<UserCog size={32} className="text-gray-300" />} title="No managers yet." />
        </Card>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {managers.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3.5 font-medium text-[#1E2B4A]">{m.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">{m.email}</td>
                  <td className="px-5 py-3.5">
                    {m.is_admin ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1A56D6]/10 text-[#1A56D6]">Admin</span>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Manager</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!m.is_admin && (
                      <button
                        onClick={() => removeManager(m)}
                        disabled={deleting === m.id}
                        className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                        title="Remove manager"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddManagerModal
          onClose={() => setShowModal(false)}
          onCreated={(m) => { setShowModal(false); setManagers((prev) => [...prev, m]); }}
        />
      )}
    </div>
  );
}
