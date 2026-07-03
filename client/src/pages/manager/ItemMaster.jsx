import { useEffect, useRef, useState } from 'react';
import { Plus, X, Package, Trash2, Pencil, Upload } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, SkeletonTable, Button, Input, Select, EmptyState } from '../../components/Common';

const UNITS = ['drums', 'MT', 'litres', 'kg'];

const EMPTY_FORM = { name: '', category: '', default_unit: '' };

function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { name: item.name, category: item.category || '', default_unit: item.default_unit || '' } : EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setSubmitting(true);
    try {
      const payload = { ...form, default_unit: form.default_unit || undefined };
      const { data } = item
        ? await api.put(`/items/${item.id}`, payload)
        : await api.post('/items', payload);
      toast.success(item ? 'Item updated.' : 'Item added.');
      onSaved(data.item);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.details) {
        const fieldErrors = {};
        err.response.data.details.forEach((d) => { fieldErrors[d.path] = d.msg; });
        setErrors(fieldErrors);
      }
      toast.error(apiErrorMessage(err, 'Could not save item.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-[#1E2B4A] text-lg">{item ? 'Edit item' : 'Add item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Input label="Item name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Industrial Grade Lubricant Oil" />
          <Input label="Category" value={form.category} onChange={set('category')} error={errors.category} placeholder="e.g. Lubricants (optional)" />
          <Select label="Default unit" value={form.default_unit} onChange={set('default_unit')} error={errors.default_unit}>
            <option value="">— None —</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="gold" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ItemMaster() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  const load = async () => {
    try {
      const { data } = await api.get('/items');
      setItems(data.items);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load items.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onSaved = (item) => {
    setShowModal(false);
    setEditing(null);
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      const next = exists ? prev.map((i) => i.id === item.id ? item : i) : [...prev, item];
      return [...next].sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from the item master?`)) return;
    setDeleting(item.id);
    try {
      await api.delete(`/items/${item.id}`);
      toast.success(`${item.name} deleted.`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not delete item.'));
    } finally {
      setDeleting(null);
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/items/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${data.added} item(s) added${data.skipped ? `, ${data.skipped} skipped (already exist or invalid)` : ''}.`);
      setItems(data.items);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not import items.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E2B4A]">Item Master</h1>
          <p className="text-sm text-gray-500 mt-1">
            The canonical list of items. Requirements can only be raised against items listed here —
            this keeps item names consistent across requirements, price history and reports.
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload Excel'}
          </Button>
          <Button variant="gold" onClick={() => { setEditing(null); setShowModal(true); }}>
            <Plus size={16} /> Add item
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-400 -mt-2">
        Excel upload expects a header row with a "Name" column (and optional "Category" / "Default Unit" columns).
        Items that already exist (matched case-insensitively) are skipped.
      </p>

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Package size={32} className="text-gray-300" />} title="No items yet." subtitle="Add items individually or upload an Excel sheet to get started." />
        </Card>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-left px-5 py-3 font-medium">Default unit</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3.5 font-medium text-[#1E2B4A]">{item.name}</td>
                  <td className="px-5 py-3.5 text-gray-600">{item.category || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{item.default_unit || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditing(item); setShowModal(true); }}
                        className="text-gray-400 hover:text-[#1A56D6] transition-colors"
                        title="Edit item"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => removeItem(item)}
                        disabled={deleting === item.id}
                        className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                        title="Delete item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ItemModal
          item={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
