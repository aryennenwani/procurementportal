import { useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-[#B8962E] ${className}`} />;
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
    primary: 'bg-[#1C1C1E] text-white hover:bg-black disabled:bg-gray-400',
    gold: 'bg-[#B8962E] text-white hover:bg-[#a3831f] disabled:bg-gray-400',
    outline: 'border border-gray-300 text-[#1C1C1E] hover:bg-gray-50 disabled:text-gray-400',
    ghost: 'text-[#1C1C1E] hover:bg-gray-100 disabled:text-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400',
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
      {label && <span className="block mb-1.5 font-medium text-[#1C1C1E]">{label}</span>}
      <input
        className={`w-full px-3.5 py-2.5 rounded-lg border ${error ? 'border-red-400' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#B8962E]/40 focus:border-[#B8962E] text-[#1C1C1E] placeholder:text-gray-400 ${className}`}
        {...props}
      />
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1C1C1E]">{label}</span>}
      <textarea
        className={`w-full px-3.5 py-2.5 rounded-lg border ${error ? 'border-red-400' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#B8962E]/40 focus:border-[#B8962E] text-[#1C1C1E] placeholder:text-gray-400 ${className}`}
        {...props}
      />
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1C1C1E]">{label}</span>}
      <select
        className={`w-full px-3.5 py-2.5 rounded-lg border ${error ? 'border-red-400' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#B8962E]/40 focus:border-[#B8962E] text-[#1C1C1E] bg-white ${className}`}
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
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B8962E] hover:text-[#8f7322] border border-[#B8962E]/40 hover:border-[#B8962E] rounded-md px-2.5 py-1.5 transition-colors"
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
      <p className="mt-3 font-medium text-[#1C1C1E]">{title}</p>
      {subtitle && <p className="mt-1 text-sm max-w-sm">{subtitle}</p>}
    </div>
  );
}
