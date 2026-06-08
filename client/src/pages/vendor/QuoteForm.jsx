import { useMemo, useState } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { Button, Input, Textarea } from '../../components/Common';

const EMPTY_FORM = { per_unit_price: '', lead_time_days: '', validity_period: '', payment_terms: '', remarks: '' };

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
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const totalValue = useMemo(() => {
    const price = Number(form.per_unit_price);
    if (!price || Number.isNaN(price)) return null;
    return price * Number(requirement.quantity);
  }, [form.per_unit_price, requirement.quantity]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setServerError('');
    setSubmitting(true);
    try {
      const endpoint = isRevision ? 'revise' : 'quote';
      const { data } = await api.post(`/vendor/${token}/${endpoint}`, {
        requirement_id: requirement.id,
        per_unit_price: Number(form.per_unit_price),
        lead_time_days: Number(form.lead_time_days),
        validity_period: form.validity_period,
        payment_terms: form.payment_terms,
        remarks: form.remarks,
      });
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onCancel} className="text-gray-400 hover:text-[#1C1C1E]"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-semibold text-[#1C1C1E]">{requirement.title}</h2>
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
          <p className="text-lg font-semibold text-[#1C1C1E] mt-0.5">
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
