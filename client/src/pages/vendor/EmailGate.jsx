import { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { Button, Input } from '../../components/Common';

export default function EmailGate({ token, onVerified }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post(`/vendor/${token}/verify`, { email });
      onVerified();
    } catch (err) {
      setError(apiErrorMessage(err, 'This link is not associated with that email address.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-7 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <Lock className="text-[#1C1C1E]" size={24} />
      </div>
      <h2 className="text-lg font-semibold text-[#1C1C1E]">Enter your email address to access your portal</h2>
      <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">
        For your security, we verify your identity before showing any requirement details.
      </p>

      <form onSubmit={onSubmit} className="mt-6 text-left max-w-sm mx-auto space-y-4">
        <Input
          label="Email address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoFocus
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}

        <Button type="submit" variant="gold" disabled={submitting} className="w-full justify-center">
          {submitting ? 'Verifying…' : 'Verify & Continue'}
        </Button>
      </form>
    </div>
  );
}
