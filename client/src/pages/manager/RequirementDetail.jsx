import { useEffect, useState, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Download, FileText, Users, AlertTriangle, Trophy, Ban, Plus, History, ChevronDown, ChevronUp,
  FileCheck2, RefreshCw, Paperclip,
} from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Card, PageLoader, Button, EmptyState, Modal, Skeleton, SkeletonTable } from '../../components/Common';
import { StatusBadge, RiskBadge, OutcomeBadge, SapStatusBadge } from '../../components/Badges';

// Purchase order raised for this requirement's winning bid — with SAP sync state,
// document download, and a retry path when the ERP push failed.
function PurchaseOrderCard({ requirementId }) {
  const [po, setPo] = useState(null);
  const [sapConfigured, setSapConfigured] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    api.get(`/purchase-orders/requirement/${requirementId}`)
      .then(({ data }) => {
        if (cancelled) return;
        setPo(data.purchase_order);
        setSapConfigured(data.sap_configured);
      })
      .catch(() => { /* no PO for this requirement */ });
    return () => { cancelled = true; };
  }, [requirementId]);

  if (!po) return null;

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/purchase-orders/${po.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${po.po_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not download the PO document.'));
    }
  };

  const retrySync = async () => {
    setRetrying(true);
    try {
      const { data } = await api.post(`/purchase-orders/${po.id}/retry`);
      setPo(data.purchase_order);
      if (data.purchase_order.sap_status === 'synced') {
        toast.success(`Synced to SAP as ${data.purchase_order.sap_po_number}.`);
      } else {
        toast.error(data.purchase_order.sap_error || 'SAP sync failed again.');
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not retry the SAP sync.'));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card className="p-5 !border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <FileCheck2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="font-bold text-[#101C3B]">{po.po_number}</p>
              <SapStatusBadge status={po.sap_status} />
            </div>
            <p className="text-sm text-[#64748F] mt-1">
              Purchase order for <strong className="text-[#1E2B4A]">{po.vendor_name}</strong> — ₹{po.total_amount.toLocaleString('en-IN')}
              {po.sap_po_number && <> • SAP PO <strong className="text-[#1E2B4A]">{po.sap_po_number}</strong></>}
            </p>
            {po.sap_status === 'failed' && po.sap_error && (
              <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {po.sap_error}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {(po.sap_status === 'failed' || (po.sap_status === 'local' && sapConfigured)) && (
            <Button variant="outline" className="!py-1.5 !px-3 text-xs" disabled={retrying} onClick={retrySync}>
              <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} />
              {retrying ? 'Syncing…' : 'Retry SAP sync'}
            </Button>
          )}
          <Button variant="outline" className="!py-1.5 !px-3 text-xs" onClick={downloadPdf}>
            <Download size={13} /> Download PO
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AssignVendorsModal({ requirementId, assignedIds, onClose, onAssigned }) {
  const [vendors, setVendors] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.get('/vendors').then(({ data }) => setVendors(data.vendors)).finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onSubmit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await api.post(`/requirements/${requirementId}/assign`, { vendor_ids: selected });
      toast.success('Vendors assigned to this requirement.');
      onAssigned();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not assign vendors.'));
    } finally {
      setSubmitting(false);
    }
  };

  const available = vendors.filter((v) => !assignedIds.includes(v.id));

  return (
    <Modal onClose={onClose} className="w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-semibold text-[#1E2B4A] text-lg">Assign vendors</h2>
          <p className="text-sm text-gray-500 mt-0.5">Select one or more vendors to invite for this requirement.</p>
        </div>
        <div className="p-6 space-y-2">
          {loading ? (
            <PageLoader />
          ) : available.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">All vendors are already assigned to this requirement.</p>
          ) : (
            available.map((v) => (
              <label key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-[#1A56D6]/50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selected.includes(v.id)}
                  onChange={() => toggle(v.id)}
                  className="w-4 h-4 accent-[#1A56D6]"
                />
                <div className="min-w-0">
                  <p className="font-medium text-[#1E2B4A] text-sm truncate">{v.company_name}</p>
                  <p className="text-xs text-gray-500 truncate">{v.category} • {v.contact_person}</p>
                </div>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="gold" disabled={selected.length === 0 || submitting} onClick={onSubmit}>
            {submitting ? 'Assigning…' : `Assign ${selected.length || ''}`.trim()}
          </Button>
        </div>
    </Modal>
  );
}

const MIN_JUSTIFICATION_LENGTH = 50;

function OutcomeModal({ quotation, requirementTitle, lowestQuotation, totalQuotations, onClose, onDecided }) {
  const [outcome, setOutcome] = useState('won');
  const [reason, setReason] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const requiresJustification = outcome === 'won' && !quotation.is_lowest;
  const justificationOk = justification.trim().length >= MIN_JUSTIFICATION_LENGTH;
  const blockedByMinBids = outcome === 'won' && totalQuotations < 2;

  const onSubmit = async () => {
    if (blockedByMinBids || (requiresJustification && !justificationOk)) return;
    setSubmitting(true);
    try {
      await api.post(`/quotations/${quotation.id}/outcome`, {
        outcome,
        rejection_reason: outcome === 'not_selected' ? reason : undefined,
        justification: requiresJustification ? justification : undefined,
      });
      toast.success(`Outcome recorded for ${quotation.company_name}.`);
      onDecided();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not record outcome.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} className="w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-[#1E2B4A] text-lg">Record outcome — {quotation.company_name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">For: {requirementTitle}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => setOutcome('won')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
                outcome === 'won' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Trophy size={16} /> Mark as won
            </button>
            <button
              onClick={() => setOutcome('not_selected')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
                outcome === 'not_selected' ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Ban size={16} /> Not selected
            </button>
          </div>
          {outcome === 'not_selected' && (
            <label className="block text-sm">
              <span className="block mb-1.5 font-medium text-[#1E2B4A]">Reason for rejection (optional)</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Higher price than competitive bids, longer lead time…"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1A56D6]/40 focus:border-[#1A56D6] text-[#1E2B4A]"
              />
            </label>
          )}

          {blockedByMinBids && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                At least 2 quotations are required before a winner can be selected for this requirement
                (currently {totalQuotations}).
              </p>
            </div>
          )}

          {requiresJustification && !blockedByMinBids && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3.5 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  You are selecting a bid that is not the lowest
                  {lowestQuotation && <> — {lowestQuotation.company_name} quoted ₹{lowestQuotation.per_unit_price.toLocaleString('en-IN')} vs ₹{quotation.per_unit_price.toLocaleString('en-IN')} here</>}.
                  This action will be permanently logged. Please provide written justification for this decision.
                </p>
              </div>
              <label className="block text-sm">
                <span className="block mb-1.5 font-medium text-[#1E2B4A]">Written justification (required)</span>
                <textarea
                  rows={4}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain in detail why this vendor was selected over the lower bid (e.g. quality concerns, delivery reliability, prior performance issues with the cheaper vendor)…"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-red-300 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 text-[#1E2B4A]"
                />
                <span className={`block mt-1 text-xs ${justificationOk ? 'text-emerald-600' : 'text-red-500'}`}>
                  {justification.trim().length}/{MIN_JUSTIFICATION_LENGTH} characters minimum
                </span>
              </label>
            </div>
          )}

          <p className="text-xs text-gray-400">This decision is permanent and cannot be edited or removed once recorded.</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={outcome === 'won' ? 'gold' : 'danger'}
            disabled={submitting || blockedByMinBids || (requiresJustification && !justificationOk)}
            onClick={onSubmit}
          >
            {submitting ? 'Saving…' : 'Confirm decision'}
          </Button>
        </div>
    </Modal>
  );
}

// Downloadable chips for the files a vendor attached to their quotation.
function AttachmentChips({ quotation }) {
  const toast = useToast();
  if (!quotation.attachments || quotation.attachments.length === 0) return null;

  const download = async (att) => {
    try {
      const res = await api.get(`/quotations/${quotation.id}/attachments/${att.id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = att.original_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not download the attachment.'));
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {quotation.attachments.map((att) => (
        <button
          key={att.id}
          onClick={() => download(att)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1A56D6]/[0.07] border border-[#1A56D6]/25 text-[11px] font-medium text-[#1A56D6] hover:bg-[#1A56D6]/[0.14] transition-colors max-w-[180px]"
          title={`Download ${att.original_name}`}
        >
          <Paperclip size={11} className="shrink-0" />
          <span className="truncate">{att.original_name}</span>
        </button>
      ))}
    </div>
  );
}

function RevisionHistoryRow({ quotation, colSpan }) {
  const [open, setOpen] = useState(false);
  if (!quotation.revision_history || quotation.revision_history.length < 2) return null;

  const sorted = [...quotation.revision_history].sort((a, b) => b.revision_number - a.revision_number);

  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pb-3.5 pt-0">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#1E2B4A] transition-colors"
        >
          <History size={13} />
          Revision history ({quotation.revision_history.length})
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {open && (
          <div className="mt-2 rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden max-w-xl">
            {sorted.map((rev, idx) => {
              const next = sorted[idx + 1];
              const diff = next ? rev.per_unit_price - next.per_unit_price : null;
              return (
                <div key={rev.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-[#1E2B4A]">
                      {rev.revision_number === 0 ? 'Original submission' : `Revision ${rev.revision_number}`}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">{rev.submitted_at_ist}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-[#1E2B4A]">₹{rev.per_unit_price.toLocaleString('en-IN')}</span>
                    {diff !== null && diff !== 0 && (
                      <span className={`block text-[10px] font-semibold uppercase tracking-wide ${diff < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {diff < 0 ? '▼' : '▲'} ₹{Math.abs(diff).toLocaleString('en-IN')} vs previous
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function RequirementDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState(null);
  const toast = useToast();
  const { isFactoryManager, isAdmin } = useAuth();

  const load = async () => {
    try {
      const { data } = await api.get(`/requirements/${id}/quotations`);
      setData(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load requirement details.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const downloadExport = async (format) => {
    try {
      const res = await api.get(`/export/${id}/${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotations-${id}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} export downloaded.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, `Could not export ${format.toUpperCase()}.`));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-20 w-full !rounded-2xl" />
        <SkeletonTable rows={4} cols={7} />
      </div>
    );
  }
  if (!data) return null;

  const { requirement, assigned_vendors, quotations, bids_hidden, partiality } = data;
  const assignedIds = assigned_vendors.map((v) => v.id);

  return (
    <div className="space-y-6">
      <Link to="/dashboard/requirements" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1E2B4A]">
        <ArrowLeft size={15} /> Back to requirements
      </Link>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-[#1E2B4A]">{requirement.title}</h1>
            <StatusBadge status={requirement.status} />
            {isAdmin && partiality.risk_level !== 'LOW' && <RiskBadge level={partiality.risk_level} />}
          </div>
          <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">{requirement.description || 'No description provided.'}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500 mt-3">
            <span><strong className="text-[#1E2B4A] font-medium">Quantity:</strong> {requirement.quantity} {requirement.unit}</span>
            {requirement.grade && <span><strong className="text-[#1E2B4A] font-medium">Grade:</strong> {requirement.grade}</span>}
            <span><strong className="text-[#1E2B4A] font-medium">Deadline:</strong> {requirement.deadline_ist}</span>
            <span><strong className="text-[#1E2B4A] font-medium">Created:</strong> {requirement.created_at_ist}</span>
            <span><strong className="text-[#1E2B4A] font-medium">Raised by:</strong> {requirement.created_by_name}</span>
          </div>
          {requirement.notes && <p className="text-sm text-gray-500 mt-2"><strong className="text-[#1E2B4A] font-medium">Notes:</strong> {requirement.notes}</p>}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Button variant="outline" onClick={() => downloadExport('csv')}>
            <Download size={15} /> CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExport('pdf')}>
            <FileText size={15} /> PDF
          </Button>
        </div>
      </div>

      {requirement.status === 'Closed' && !isFactoryManager && (
        <PurchaseOrderCard requirementId={requirement.id} />
      )}

      {isAdmin && partiality.risk_level === 'HIGH' && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-red-700">⚠️ Partiality Risk Detected — Review flagged concerns before proceeding</p>
            <ul className="mt-2 space-y-1 text-sm text-red-700">
              {partiality.flags.filter((f) => f.risk_level === 'HIGH').map((f) => (
                <li key={f.id}>• {f.description}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {isAdmin && partiality.flags.some((f) => f.risk_level !== 'HIGH') && (
        <Card className="p-5">
          <p className="font-medium text-[#1E2B4A] text-sm mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Other detection signals
          </p>
          <div className="space-y-2">
            {partiality.flags.filter((f) => f.risk_level !== 'HIGH').map((f) => (
              <div key={f.id} className="flex items-start gap-2.5 text-sm">
                <RiskBadge level={f.risk_level} />
                <p className="text-gray-600">{f.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!isFactoryManager && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-[#1E2B4A] text-sm flex items-center gap-2">
              <Users size={16} className="text-gray-400" /> Assigned vendors ({assigned_vendors.length})
            </p>
            <Button variant="outline" onClick={() => setShowAssign(true)} className="!py-1.5 !px-3 text-xs">
              <Plus size={14} /> Assign vendors
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {assigned_vendors.map((v) => (
              <span key={v.id} className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 font-medium">{v.company_name}</span>
            ))}
            {assigned_vendors.length === 0 && <p className="text-sm text-gray-400">No vendors assigned yet.</p>}
          </div>
        </Card>
      )}

      <div>
        <h2 className="font-semibold text-[#1E2B4A] mb-3">Quotations received ({quotations.length})</h2>
        {bids_hidden && quotations.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              <strong>Bid amounts are hidden.</strong> Prices will be revealed once at least 2 quotations have been received.
              This ensures fair and unbiased competitive bidding.
            </p>
          </div>
        )}
        {!bids_hidden && quotations.length === 1 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">At least 2 quotations must be received before a winner can be selected for this requirement.</p>
          </div>
        )}
        {quotations.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText size={32} className="text-gray-300" />}
              title="No quotations submitted yet"
              subtitle="Once assigned vendors submit their quotations, they will appear here for side-by-side comparison."
            />
          </Card>
        ) : (
          <div className="table-shell overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Vendor</th>
                  <th className="text-right px-4 py-3 font-medium">Per-unit price</th>
                  <th className="text-right px-4 py-3 font-medium">Total value</th>
                  <th className="text-right px-4 py-3 font-medium">Lead time</th>
                  <th className="text-left px-4 py-3 font-medium">Validity</th>
                  <th className="text-left px-4 py-3 font-medium">Payment terms</th>
                  <th className="text-left px-4 py-3 font-medium">Submitted</th>
                  <th className="text-left px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotations.map((q) => (
                  <Fragment key={q.id}>
                  <tr className={q.is_lowest ? 'bg-emerald-50/60' : ''}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#1E2B4A]">{q.company_name}</p>
                        {q.revision_number > 0 && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1A56D6] bg-[#1A56D6]/10 px-1.5 py-0.5 rounded">
                            Revised ×{q.revision_number}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{q.contact_person}</p>
                      <AttachmentChips quotation={q} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {q.per_unit_price !== null ? (
                        <>
                          <span className={`font-semibold ${q.is_lowest ? 'text-emerald-700' : 'text-[#1E2B4A]'}`}>
                            ₹{q.per_unit_price.toLocaleString('en-IN')}
                          </span>
                          {q.is_lowest && <span className="block text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Lowest quote</span>}
                        </>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right text-[#1E2B4A]">
                      {q.total_value !== null ? `₹${q.total_value.toLocaleString('en-IN')}` : <span className="text-gray-400 italic text-xs">Hidden</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right text-gray-600">{q.lead_time_days} days</td>
                    <td className="px-4 py-3.5 text-gray-600">{q.validity_period}</td>
                    <td className="px-4 py-3.5 text-gray-600">{q.payment_terms}</td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{q.submitted_at_ist}</td>
                    <td className="px-4 py-3.5">
                      {q.outcome ? (
                        <div>
                          <OutcomeBadge outcome={q.outcome === 'won' ? 'Won' : 'Not Selected'} />
                          {q.rejection_reason && <p className="text-xs text-gray-400 mt-1 max-w-[180px]">{q.rejection_reason}</p>}
                          {q.decided_by_name && <p className="text-xs text-gray-400 mt-1">Decided by: {q.decided_by_name}</p>}
                        </div>
                      ) : (
                        <OutcomeBadge outcome="Pending Decision" />
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {!q.outcome && !isFactoryManager && (
                        <Button variant="outline" className="!py-1.5 !px-3 text-xs" onClick={() => setOutcomeFor(q)}>
                          Decide
                        </Button>
                      )}
                    </td>
                  </tr>
                  <RevisionHistoryRow quotation={q} colSpan={9} />
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {quotations.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">{quotations.length} quotation{quotations.length !== 1 ? 's are' : ' is'} permanently archived — including any not selected.</p>
        )}
      </div>

      {showAssign && (
        <AssignVendorsModal
          requirementId={id}
          assignedIds={assignedIds}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); load(); }}
        />
      )}
      {outcomeFor && (
        <OutcomeModal
          quotation={outcomeFor}
          requirementTitle={requirement.title}
          lowestQuotation={quotations[0]}
          totalQuotations={quotations.length}
          onClose={() => setOutcomeFor(null)}
          onDecided={() => { setOutcomeFor(null); load(); }}
        />
      )}
    </div>
  );
}
