import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, AlertTriangle, Paperclip, X, FileText } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { Button, Input, Textarea } from '../../components/Common';

const EMPTY_FORM = { per_unit_price: '', lead_time_days: '', validity_period: '', payment_terms: '', remarks: '' };

const MAX_FILES = 3;
const MAX_FILE_MB = 5;
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx';

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function QuoteForm({ token, requirement, mode = 'submit', onCancel, onSubmitted }) {
  const isRevision = mode === 'revise';
  const [form, setForm] = useState(() => {
    if (isRevision && requirement.quotation) {
      const q = requirement.quotation;
      return {
        per_unit_price: q.per_unit_price ?? '',
        lead_time_days: q.lead_time_days ?? '',
        validity_period: q.validity_period ?? '',
        payment_terms: q.payment_terms ?? '',
        remarks: q.remarks ?? '',
      };
    }
    return EMPTY_FORM;
  });
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const fileInputRef = useRef(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const totalValue = useMemo(() => {
    const price = Number(form.per_unit_price);
    if (!price || Number.isNaN(price)) return null;
    return price * Number(requirement.quantity);
  }, [form.per_unit_price, requirement.quantity]);

  const addFiles = (list) => {
    setFileError('');
    const incoming = Array.from(list || []);
    const next = [...files];
    for (const f of incoming) {
      if (next.length >= MAX_FILES) {
        setFileError(`You can attach at most ${MAX_FILES} files.`);
        break;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setFileError(`"${f.name}" is larger than ${MAX_FILE_MB} MB.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setFileError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setServerError('');
    setSubmitting(true);
    try {
      const endpoint = isRevision ? 'revise' : 'quote';
      const fd = new FormData();
      fd.append('requirement_id', requirement.id);
      fd.append('per_unit_price', Number(form.per_unit_price));
      fd.append('lead_time_days', Number(form.lead_time_days));
      fd.append('validity_period', form.validity_period);
      fd.append('payment_terms', form.payment_terms);
      fd.append('remarks', form.remarks);
      files.forEach((f) => fd.append('attachments', f));
      const { data } = await api.post(`/vendor/${token}/${endpoint}`, fd);
      onSubmitted({ ...data.quotation, message: data.message, revised: isRevision });
    } catch (err) {
      if (err.response?.status === 400 && err.response.data?.details) {
        const fieldErrors = {};
        err.response.data.details.forEach((d) => { fieldErrors[d.path] = d.msg; });
        setErrors(fieldErrors);
      }
      setServerError(apiErrorMessage(err, isRevision ? 'Could not submit your revised offer. Please try again.' : 'Could not submit your quotation. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onCancel} className="text-gray-400 hover:text-[#1E2B4A]"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-semibold text-[#1E2B4A]">{requirement.title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{requirement.quantity} {requirement.unit} • Deadline {requirement.deadline_ist}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            {isRevision
              ? `This will be recorded as revision ${(requirement.quotation?.revision_number ?? 0) + 1} of ${requirement.max_revisions}. Revisions are permanent and cannot be edited once submitted.`
              : 'Submissions are final and cannot be edited once submitted. Please review your quotation carefully before submitting.'}
          </p>
        </div>

        <Input
          label={`Per-unit price (₹ per ${requirement.unit})`}
          type="number" step="any" min="0" required
          value={form.per_unit_price}
          onChange={set('per_unit_price')}
          error={errors.per_unit_price}
          placeholder="e.g. 198"
        />

        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500">Total value (auto-calculated)</p>
          <p className="text-lg font-semibold text-[#1E2B4A] mt-0.5">
            {totalValue !== null ? `₹${totalValue.toLocaleString('en-IN')}` : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{requirement.quantity} {requirement.unit} × per-unit price</p>
        </div>

        <Input
          label="Lead time (in days)"
          type="number" min="1" step="1" required
          value={form.lead_time_days}
          onChange={set('lead_time_days')}
          error={errors.lead_time_days}
          placeholder="e.g. 14"
        />
        <Input
          label="Validity period of quotation"
          required
          value={form.validity_period}
          onChange={set('validity_period')}
          error={errors.validity_period}
          placeholder="e.g. 30 days from submission"
        />
        <Input
          label="Payment terms"
          required
          value={form.payment_terms}
          onChange={set('payment_terms')}
          error={errors.payment_terms}
          placeholder="e.g. 50% advance, 50% on delivery"
        />
        <Textarea
          label="Remarks (optional)"
          rows={3}
          value={form.remarks}
          onChange={set('remarks')}
          error={errors.remarks}
          placeholder="Any additional information for the procurement manager…"
        />

        {/* Attachments — spec sheets, COAs, datasheets */}
        <div className="text-sm">
          <span className="block mb-1.5 font-medium text-[#1E2B4A]">Attachments (optional)</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-[#C9D6EF] text-[#1A56D6] text-sm font-medium hover:border-[#1A56D6]/60 hover:bg-[#1A56D6]/[0.04] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Paperclip size={15} />
            Attach spec sheets / COAs — up to {MAX_FILES} files, {MAX_FILE_MB} MB each
          </button>
          {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}
          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((f, idx) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#F5F8FF] border border-[#E3EAF7] text-sm">
                  <FileText size={15} className="text-[#1A56D6] shrink-0" />
                  <span className="truncate text-[#1E2B4A] font-medium flex-1">{f.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatSize(f.size)}</span>
                  <button type="button" onClick={() => removeFile(idx)} className="text-gray-400 hover:text-red-600 shrink-0" title="Remove file">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-gray-400">PDF, image, Word, or Excel. Attachments become a permanent part of your quotation.</p>
        </div>

        {serverError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{serverError}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={submitting}>
            {submitting ? 'Submitting…' : isRevision ? 'Submit revised offer' : 'Submit quotation'}
          </Button>
        </div>
      </form>
    </div>
  );
}
