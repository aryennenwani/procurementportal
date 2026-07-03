import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-[#1A56D6] ${className}`} />;
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 animate-fade-in">
      <span className="loader-ring w-10 h-10" />
      <p className="text-sm font-medium text-[#8A97B5] animate-pulse">{label}…</p>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

// Skeleton placeholders that mirror the real layouts while data loads.
export function SkeletonStatRow({ count = 4 }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-surface p-5 flex items-center gap-4">
          <Skeleton className="w-11 h-11 !rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-surface p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-6 w-16 !rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <div className="pt-3 flex justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div className="table-shell p-0 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#E9EFFA] flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-4 border-b border-[#F0F4FC] last:border-0 flex gap-6 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-[140px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Eased count-up for stat values — makes numbers feel alive on load.
export function AnimatedNumber({ value, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    if (target === 0) { setDisplay(0); return undefined; }
    let frame;
    const step = (ts) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); startRef.current = null; };
  }, [value, duration]);

  return <>{display.toLocaleString('en-IN')}</>;
}

export function Card({ children, className = '', hover = false }) {
  return (
    <div className={`card-surface ${hover ? 'card-hover' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', disabled, ...props }) {
  const variants = {
    primary: 'btn-shine bg-[#1E2B4A] text-white hover:bg-[#0F1F3D] shadow-sm shadow-[#1E2B4A]/20 disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none',
    gold:    'btn-shine bg-gradient-to-b from-[#2563EB] to-[#1A56D6] text-white hover:from-[#1D5AE0] hover:to-[#1548C2] shadow-md shadow-[#1A56D6]/30 hover:shadow-lg hover:shadow-[#1A56D6]/40 disabled:from-gray-300 disabled:to-gray-300 disabled:text-gray-500 disabled:shadow-none',
    outline: 'border border-[#D4DEF0] bg-white text-[#1E2B4A] hover:bg-[#F5F8FF] hover:border-[#1A56D6]/50 disabled:text-gray-400 disabled:hover:bg-white',
    ghost:   'text-[#1E2B4A] hover:bg-[#EDF2FC] disabled:text-gray-400',
    danger:  'bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-sm shadow-red-600/25 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none',
  };
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A56D6]/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const fieldClasses = (error, extra = '') =>
  `w-full px-3.5 py-2.5 rounded-lg border bg-white text-[#1E2B4A] placeholder:text-gray-400 transition-shadow duration-150 ${
    error ? 'border-red-400' : 'border-[#D4DEF0] hover:border-[#B7C7E8]'
  } focus:outline-none focus:ring-[3px] focus:ring-[#1A56D6]/25 focus:border-[#1A56D6] ${extra}`;

export function Input({ label, error, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1E2B4A]">{label}</span>}
      <input className={fieldClasses(error, className)} {...props} />
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1E2B4A]">{label}</span>}
      <textarea className={fieldClasses(error, className)} {...props} />
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <label className="block text-sm">
      {label && <span className="block mb-1.5 font-medium text-[#1E2B4A]">{label}</span>}
      <select className={fieldClasses(error, className)} {...props}>
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
      className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 border transition-all duration-150 ${
        copied
          ? 'text-emerald-700 border-emerald-300 bg-emerald-50'
          : 'text-[#1A56D6] hover:text-[#1245B0] border-[#1A56D6]/40 hover:border-[#1A56D6] hover:bg-[#1A56D6]/5'
      }`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

export function EmptyState({ title, subtitle, icon }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-gray-500">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#EEF3FE] to-[#E3EBFB] border border-[#DCE6F8] flex items-center justify-center">
          {icon}
        </div>
      )}
      <p className="mt-4 font-semibold text-[#1E2B4A]">{title}</p>
      {subtitle && <p className="mt-1 text-sm max-w-sm">{subtitle}</p>}
    </div>
  );
}

// Standard page heading: title + subtitle on the left, actions on the right.
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-[#101C3B]">{title}</h1>
        {subtitle && <p className="text-sm text-[#64748F] mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-col sm:flex-row gap-2 shrink-0">{children}</div>}
    </div>
  );
}

// Shared modal shell — dims + blurs the page behind and animates the panel in.
export function Modal({ onClose, className = '', children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0A1A3F]/50 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl shadow-[#0A1A3F]/25 animate-modal-in ${className}`}>
        {children}
      </div>
    </div>
  );
}
