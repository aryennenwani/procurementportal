import { useEffect, useState } from 'react';
import { Plus, X, Users, History, Boxes } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Card, PageLoader, Button, Input, EmptyState, CopyButton, Modal, PageHeader } from '../../components/Common';

const EMPTY_FORM = { company_name: '', contact_person: '', email: '', phone: '', category: '', sap_supplier_code: '' };

// Small editor for the SAP vendor-master code — needed before POs can sync to SAP.
function SapCodeModal({ vendor, onClose, onSaved }) {
  const [code, setCode] = useState(vendor.sap_supplier_code || '');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(`/vendors/${vendor.id}/sap-code`, { sap_supplier_code: code });
      toast.success('SAP supplier code saved.');
      onSaved(data.vendor);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save the SAP supplier code.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-[#1E2B4A] text-lg">SAP supplier code</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
      </div>
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <Input
          label={`SAP vendor-master code for ${vendor.company_name}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. 0000100234"
          maxLength={20}
        />
        <p className="text-xs text-gray-400">Purchase orders for this vendor can only sync to SAP once this code is set.</p>
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={saving}>{saving ? 'Saving…' : 'Save code'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateVendorModal({ onClose, onCreated }) {
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
      const { data } = await api.post('/vendors', form);
      toast.success(`${data.vendor.company_name} added with a unique portal link.`);
      onCreated(data.vendor);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.details) {
        const fieldErrors = {};
        err.response.data.details.forEach((d) => { fieldErrors[d.path] = d.msg; });
        setErrors(fieldErrors);
      }
      toast.error(apiErrorMessage(err, 'Could not add vendor.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-[#1E2B4A] text-lg">Add a vendor</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <Input label="Company name" required value={form.company_name} onChange={set('company_name')} error={errors.company_name} placeholder="e.g. Shree Petrochem Industries" />
          <Input label="Contact person" required value={form.contact_person} onChange={set('contact_person')} error={errors.contact_person} placeholder="e.g. Ramesh Iyer" />
          <Input label="Email address" type="email" required value={form.email} onChange={set('email')} error={errors.email} placeholder="contact@vendor.com" />
          <Input label="Phone number" required value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98xxxxxxx" />
          <Input label="Category" required value={form.category} onChange={set('category')} error={errors.category} placeholder="e.g. Chemicals, Packaging, Lubricants…" />
          <Input label="SAP supplier code (optional)" value={form.sap_supplier_code} onChange={set('sap_supplier_code')} error={errors.sap_supplier_code} placeholder="e.g. 0000100234" maxLength={20} />
          <p className="text-xs text-gray-400">A unique portal link will be generated automatically — no login required for the vendor to view requirements and submit quotations. The SAP code links this vendor to your ERP vendor master for purchase orders.</p>
          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="gold" disabled={submitting}>{submitting ? 'Adding…' : 'Add vendor'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ActivityModal({ vendor, onClose }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/vendors/${vendor.id}/activity`).then(({ data }) => setActivity(data.activity)).finally(() => setLoading(false));
  }, [vendor.id]);

  const ACTION_LABELS = { LINK_OPENED: 'Opened portal link', QUOTATION_SUBMITTED: 'Submitted quotation' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-[#1E2B4A] text-lg">Activity log — {vendor.company_name}</h2>
            <p className="text-sm text-gray-500">Every link open and submission, timestamped.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-6">
          {loading ? <PageLoader /> : activity.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-[#1A56D6] mt-1.5 shrink-0" />
                  <div>
                    <p className="text-[#1E2B4A] font-medium">{ACTION_LABELS[a.action] || a.action}{a.requirement_title ? ` — ${a.requirement_title}` : ''}</p>
                    <p className="text-xs text-gray-400">{a.timestamp_ist} • IP {a.ip_address}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activityFor, setActivityFor] = useState(null);
  const [sapCodeFor, setSapCodeFor] = useState(null);
  const toast = useToast();

  const load = async () => {
    try {
      const { data } = await api.get('/vendors');
      setVendors(data.vendors);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load vendors.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const portalOrigin = window.location.origin;

  return (
    <div className="space-y-6">
      <PageHeader title="Vendors" subtitle="Manage vendors, portal links, and SAP vendor-master codes.">
        <Button variant="gold" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add vendor
        </Button>
      </PageHeader>

      {loading ? (
        <PageLoader />
      ) : vendors.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={32} className="text-gray-300" />} title="No vendors added yet." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {vendors.map((v) => (
            <Card key={v.id} hover className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-[#1E2B4A] truncate">{v.company_name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{v.category}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1A56D6]/10 text-[#1A56D6]">
                  {v.win_rate}% win rate
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                <p>{v.contact_person} • {v.phone}</p>
                <p className="truncate">{v.email}</p>
                <p>{v.total_bids} bid{v.total_bids !== 1 ? 's' : ''} • {v.wins} won • assigned to {v.assigned_count} requirement{v.assigned_count !== 1 ? 's' : ''}</p>
                {v.last_activity_ist && <p>Last active: {v.last_activity_ist}</p>}
                <button
                  onClick={() => setSapCodeFor(v)}
                  className={`inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                    v.sap_supplier_code
                      ? 'border-[#D4DEF0] text-[#1E2B4A] hover:border-[#1A56D6]/50'
                      : 'border-dashed border-amber-300 text-amber-700 bg-amber-50/60 hover:border-amber-400'
                  }`}
                  title="Set SAP vendor-master supplier code"
                >
                  <Boxes size={12} />
                  {v.sap_supplier_code ? `SAP ${v.sap_supplier_code}` : 'Add SAP supplier code'}
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                <code className="text-xs text-gray-500 truncate max-w-[140px]" title={`${portalOrigin}${v.portal_url}`}>
                  {v.portal_url}
                </code>
                <div className="flex items-center gap-2 shrink-0">
                  <CopyButton text={`${portalOrigin}${v.portal_url}`} label="Copy link" />
                  <button
                    onClick={() => setActivityFor(v)}
                    className="text-gray-400 hover:text-[#1E2B4A] transition-colors"
                    title="View activity log"
                  >
                    <History size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <CreateVendorModal onClose={() => setShowModal(false)} onCreated={(v) => { setShowModal(false); setVendors((prev) => [v, ...prev]); }} />
      )}
      {activityFor && <ActivityModal vendor={activityFor} onClose={() => setActivityFor(null)} />}
      {sapCodeFor && (
        <SapCodeModal
          vendor={sapCodeFor}
          onClose={() => setSapCodeFor(null)}
          onSaved={(updated) => {
            setSapCodeFor(null);
            setVendors((prev) => prev.map((v) => (v.id === updated.id ? { ...v, sap_supplier_code: updated.sap_supplier_code } : v)));
          }}
        />
      )}
    </div>
  );
}
