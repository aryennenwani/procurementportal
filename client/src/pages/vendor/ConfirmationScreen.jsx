import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/Common';

export default function ConfirmationScreen({ submission, onBack }) {
  const rows = [
    ['Requirement', submission.requirement_title],
    ['Per-unit price', `₹${submission.per_unit_price.toLocaleString('en-IN')} / ${submission.unit}`],
    ['Total value', `₹${submission.total_value.toLocaleString('en-IN')}`],
    ['Lead time', `${submission.lead_time_days} days`],
    ['Validity period', submission.validity_period],
    ['Payment terms', submission.payment_terms],
    ['Remarks', submission.remarks || '—'],
    ['Submitted at', submission.submitted_at_ist],
  ];

  const heading = submission.revised ? 'Revised offer submitted' : 'Quotation submitted successfully';
  const message = submission.message
    || (submission.revised
      ? 'Revised offer submitted. Manager has been notified.'
      : 'Your quotation has been permanently recorded and cannot be edited or withdrawn. Thank you for your submission.');

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-7 text-center">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="text-emerald-600" size={28} />
      </div>
      <h2 className="text-lg font-semibold text-[#1E2B4A]">{heading}</h2>
      <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">{message}</p>

      <div className="mt-6 text-left rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-5 py-3 text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-[#1E2B4A] text-right">{value}</span>
          </div>
        ))}
      </div>

      <Button variant="outline" className="mt-6" onClick={onBack}>
        <ArrowLeft size={15} /> Back to your requirements
      </Button>
    </div>
  );
}
