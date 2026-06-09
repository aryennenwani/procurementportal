import { useEffect, useState } from 'react';
import { Plus, X, UserCog, Trash2, Shield, ShieldCheck, Settings2 } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Card, PageLoader, Button, Input, EmptyState } from '../../components/Common';

const EMPTY_FORM = { name: '', email: '', password: '' };

const PERMISSION_LABELS = {
  view_compliance: 'Compliance',
  view_audit: 'Audit Log',
};
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);

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
          <h2 className="font-semibold text-[#1E2B4A] text-lg">Add manager</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Priya Sharma" />
          <Input label="Email address" type="email" required value={form.email} onChange={set('email')} error={errors.email} placeholder="priya@company.com" />
          <Input label="Password" type="password" required value={form.password} onChange={set('password')} error={errors.password} placeholder="Minimum 8 characters" />
          <p className="text-xs text-gray-400">
            New managers cannot view Compliance or Audit Log unless you grant access via the permissions editor.
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

function PermissionsModal({ manager: target, onClose, onUpdated }) {
  const [perms, setPerms] = useState(target.permissions || []);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const toggle = (p) =>
    setPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const onSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/managers/${target.id}/permissions`, { permissions: perms });
      toast.success(`Permissions updated for ${target.name}.`);
      onUpdated(data.manager);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not update permissions.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-[#1E2B4A] text-lg">Access permissions</h2>
            <p className="text-xs text-gray-500 mt-0.5">{target.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-3">
          {ALL_PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center justify-between cursor-pointer select-none">
              <span className="text-sm font-medium text-[#1E2B4A]">{PERMISSION_LABELS[p]}</span>
              <button
                type="button"
                onClick={() => toggle(p)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  perms.includes(p) ? 'bg-[#1A56D6]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    perms.includes(p) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          ))}
          <p className="text-xs text-gray-400 pt-1">
            Admins always have full access. These toggles only apply to non-admin managers.
          </p>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function ManagersList() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [permTarget, setPermTarget] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [togglingAdmin, setTogglingAdmin] = useState(null);
  const toast = useToast();
  const { isPrimaryAdmin, manager: self } = useAuth();

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

  const toggleAdmin = async (m) => {
    const action = m.is_admin ? 'demote' : 'promote';
    if (!window.confirm(`${action === 'promote' ? 'Promote' : 'Demote'} ${m.name} ${action === 'promote' ? 'to admin' : 'to regular manager'}?`)) return;
    setTogglingAdmin(m.id);
    try {
      const { data } = await api.patch(`/managers/${m.id}/toggle-admin`);
      toast.success(`${m.name} ${action === 'promote' ? 'promoted to admin' : 'demoted to manager'}.`);
      setManagers((prev) => prev.map((x) => x.id === m.id ? data.manager : x));
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not ${action} manager.`));
    } finally {
      setTogglingAdmin(null);
    }
  };

  const onPermissionsUpdated = (updated) => {
    setManagers((prev) => prev.map((m) => m.id === updated.id ? updated : m));
  };

  const canDelete = (m) => {
    if (m.id === self?.id) return false;
    if (m.is_primary_admin) return false;
    if (m.is_admin && !isPrimaryAdmin) return false;
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E2B4A]">Team & Access</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage manager accounts and their access to sensitive areas.
          </p>
        </div>
        <Button variant="gold" onClick={() => setShowAddModal(true)}>
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
                <th className="text-left px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {managers.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3.5 font-medium text-[#1E2B4A]">{m.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">{m.email}</td>
                  <td className="px-5 py-3.5">
                    {m.is_primary_admin ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Primary Admin</span>
                    ) : m.is_admin ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1A56D6]/10 text-[#1A56D6]">Admin</span>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Manager</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {m.is_admin ? (
                      <span className="text-xs text-gray-400 italic">Full access</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ALL_PERMISSIONS.map((p) => (
                          <span
                            key={p}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              m.permissions?.includes(p)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {PERMISSION_LABELS[p]}
                          </span>
                        ))}
                        <button
                          onClick={() => setPermTarget(m)}
                          className="ml-1 text-gray-400 hover:text-[#1A56D6] transition-colors"
                          title="Edit permissions"
                        >
                          <Settings2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      {isPrimaryAdmin && !m.is_primary_admin && m.id !== self?.id && (
                        <button
                          onClick={() => toggleAdmin(m)}
                          disabled={togglingAdmin === m.id}
                          className={`transition-colors disabled:opacity-40 ${
                            m.is_admin
                              ? 'text-[#1A56D6] hover:text-amber-600'
                              : 'text-gray-400 hover:text-[#1A56D6]'
                          }`}
                          title={m.is_admin ? 'Demote to manager' : 'Promote to admin'}
                        >
                          {m.is_admin ? <ShieldCheck size={16} /> : <Shield size={16} />}
                        </button>
                      )}
                      {canDelete(m) && (
                        <button
                          onClick={() => removeManager(m)}
                          disabled={deleting === m.id}
                          className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                          title="Remove manager"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddManagerModal
          onClose={() => setShowAddModal(false)}
          onCreated={(m) => { setShowAddModal(false); setManagers((prev) => [...prev, m]); }}
        />
      )}

      {permTarget && (
        <PermissionsModal
          manager={permTarget}
          onClose={() => setPermTarget(null)}
          onUpdated={onPermissionsUpdated}
        />
      )}
    </div>
  );
}
