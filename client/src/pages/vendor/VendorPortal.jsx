import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Package, Calendar, CheckCircle2, AlertCircle, History, ChevronDown, ChevronUp } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { Spinner, Button } from '../../components/Common';
import EmailGate from './EmailGate';
import QuoteForm from './QuoteForm';
import ConfirmationScreen from './ConfirmationScreen';

function PortalShell({ children }) {
  return (
    <div className="min-h-screen bg-[#F5F8FF] flex flex-col">
      {/* Top bar */}
      <header className="bg-[#0B2D71] px-6 py-4 flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center overflow-hidden">
          <img src="/shivtek-logo.png" alt="Shivtek Spechemi" className="w-6 h-6 object-contain" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">Shivtek Spechemi</p>
          <p className="text-blue-200/60 text-xs">Vendor Quotation Portal</p>
        </div>
      </header>
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}

function RevisionHistory({ history, unit }) {
  const [open, setOpen] = useState(false);
  if (!history || history.length < 2) return null;

  const sorted = [...history].sort((a, b) => b.revision_number - a.revision_number);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#1E2B4A] transition-colors"
      >
        <History size={13} />
        Revision history ({history.length})
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {sorted.map((q) => (
            <div key={q.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
              <div>
                <span className="font-medium text-[#1E2B4A]">
                  {q.revision_number === 0 ? 'Original submission' : `Revision ${q.revision_number}`}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">{q.submitted_at_ist}</p>
              </div>
              <span className="font-medium text-[#1E2B4A]">₹{q.per_unit_price.toLocaleString('en-IN')} / {unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementCard({ requirement, onSelect, onRevise }) {
  const deadlinePassed = new Date(requirement.deadline) < new Date();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#1E2B4A]">{requirement.title}</h3>
          <p className="text-sm text-gray-500 mt-1">{requirement.description || 'No description provided.'}</p>
        </div>
        <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{requirement.status}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 flex items-center gap-1"><Package size={12} /> Quantity</p>
          <p className="font-medium text-[#1E2B4A] mt-0.5">{requirement.quantity} {requirement.unit}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Grade / Spec</p>
          <p className="font-medium text-[#1E2B4A] mt-0.5">{requirement.grade || '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <p className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={12} /> Deadline</p>
          <p className={`font-medium mt-0.5 ${deadlinePassed ? 'text-red-600' : 'text-[#1E2B4A]'}`}>{requirement.deadline_ist}</p>
        </div>
      </div>

      {requirement.already_submitted && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={16} /> Your current offer: ₹{requirement.quotation.per_unit_price.toLocaleString('en-IN')} / {requirement.unit}
            </span>
            <span className="text-xs text-gray-400">Revisions used: {requirement.revisions_used} of {requirement.max_revisions}</span>
          </div>
          <RevisionHistory history={requirement.revision_history} unit={requirement.unit} />
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
        {!requirement.already_submitted && (
          deadlinePassed ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
              <AlertCircle size={16} /> Submission deadline has passed
            </span>
          ) : (
            <span className="text-sm text-gray-400">No quotation submitted yet</span>
          )
        )}

        {requirement.already_submitted && !requirement.can_revise && (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
            <AlertCircle size={14} /> {requirement.revision_closed_reason || 'Revision period closed.'}
          </span>
        )}

        <div className="ml-auto flex gap-2">
          {!requirement.already_submitted && !deadlinePassed && (
            <Button variant="gold" onClick={() => onSelect(requirement)}>Submit quotation</Button>
          )}
          {requirement.already_submitted && requirement.can_revise && (
            <Button variant="outline" onClick={() => onRevise(requirement)}>Revise Offer</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VendorPortal() {
  const { token } = useParams();
  const [vendor, setVendor] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState('');
  const [activeRequirement, setActiveRequirement] = useState(null);
  const [reviseRequirement, setReviseRequirement] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    setNeedsVerification(false);
    try {
      const { data } = await api.get(`/vendor/${token}`);
      setVendor(data.vendor);
      setRequirements(data.requirements);
    } catch (err) {
      if (err.response?.status === 401) {
        setNeedsVerification(true);
      } else {
        setError(apiErrorMessage(err, 'This vendor portal link could not be found.'));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);

  if (loading) {
    return (
      <PortalShell>
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      </PortalShell>
    );
  }

  if (needsVerification) {
    return (
      <PortalShell>
        <EmailGate token={token} onVerified={load} />
      </PortalShell>
    );
  }

  if (error) {
    return (
      <PortalShell>
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
          <AlertCircle className="mx-auto text-red-500 mb-3" size={32} />
          <p className="font-medium text-[#1E2B4A]">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Please check the link you were given, or contact your procurement manager.</p>
        </div>
      </PortalShell>
    );
  }

  if (submitted) {
    return (
      <PortalShell>
        <ConfirmationScreen submission={submitted} onBack={() => { setSubmitted(null); load(); }} />
      </PortalShell>
    );
  }

  if (activeRequirement) {
    return (
      <PortalShell>
        <QuoteForm
          token={token}
          requirement={activeRequirement}
          mode="submit"
          onCancel={() => setActiveRequirement(null)}
          onSubmitted={(result) => { setActiveRequirement(null); setSubmitted(result); }}
        />
      </PortalShell>
    );
  }

  if (reviseRequirement) {
    return (
      <PortalShell>
        <QuoteForm
          token={token}
          requirement={reviseRequirement}
          mode="revise"
          onCancel={() => setReviseRequirement(null)}
          onSubmitted={(result) => { setReviseRequirement(null); setSubmitted(result); }}
        />
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <div className="bg-white border border-[#1A56D6]/20 rounded-xl px-5 py-4 mb-6 text-left shadow-sm">
        <p className="text-[#1E2B4A] font-semibold">{vendor.company_name}</p>
        <p className="text-gray-500 text-sm mt-0.5">{vendor.contact_person} • {vendor.category}</p>
      </div>

      <h2 className="font-semibold text-[#1E2B4A] mb-3">Your assigned requirements ({requirements.length})</h2>
      {requirements.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
          No requirements have been assigned to you yet. Please check back later.
        </div>
      ) : (
        <div className="space-y-4">
          {requirements.map((r) => (
            <RequirementCard key={r.id} requirement={r} onSelect={setActiveRequirement} onRevise={setReviseRequirement} />
          ))}
        </div>
      )}
    </PortalShell>
  );
}
