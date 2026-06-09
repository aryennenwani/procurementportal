import { useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-[#1A56D6] ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size={28} />
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', disabled, ...props }) {
  const variants = {
    primary: 'bg-[#1E2B4A] text-white hover:bg-[#0F1F3D] disabled:bg-gray-300 disabled:text-gray-500',
    gold:    'bg-[#1A56D6] text-white hover:bg-[#1548C2] disabled:bg-gray-300 disabled:text-gray-500',
    outline: 'border border-gray-300 text-[#1E2B4A] hover:bg-gray-50 hover:border-gray-400 disabled:text-gray-400',
    ghost:   'text-[#1E2B4A] hover:bg-gray-100 disabled:text-gray-400',
    danger:  'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300',
  };
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1E2B4A]">{label}</span>}
      <input
        className={`w-full px-3.5 py-2.5 rounded-lg border ${error ? 'border-red-400' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#1A56D6]/40 focus:border-[#1A56D6] text-[#1E2B4A] placeholder:text-gray-400 ${className}`}
        {...props}
      />
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1E2B4A]">{label}</span>}
      <textarea
        className={`w-full px-3.5 py-2.5 rounded-lg border ${error ? 'border-red-400' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#1A56D6]/40 focus:border-[#1A56D6] text-[#1E2B4A] placeholder:text-gray-400 ${className}`}
        {...props}
      />
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1E2B4A]">{label}</span>}
      <select
        className={`w-full px-3.5 py-2.5 rounded-lg border ${error ? 'border-red-400' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#1A56D6]/40 focus:border-[#1A56D6] text-[#1E2B4A] bg-white ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function CopyButton({ text, label = 'Copy link' }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      onClick={onCopy}
      type="button"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1A56D6] hover:text-[#1245B0] border border-[#1A56D6]/40 hover:border-[#1A56D6] rounded-md px-2.5 py-1.5 transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

export function EmptyState({ title, subtitle, icon }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
      {icon}
      <p className="mt-3 font-medium text-[#1E2B4A]">{title}</p>
      {subtitle && <p className="mt-1 text-sm max-w-sm">{subtitle}</p>}
    </div>
  );
}
