import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, type = 'info') => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), 5000);
  }, [remove]);

  const toast = {
    success: (msg) => push(msg, 'success'),
    error: (msg) => push(msg, 'error'),
    info: (msg) => push(msg, 'info'),
  };

  const STYLES = {
    success: {
      icon: <CheckCircle2 size={16} />,
      chip: 'bg-emerald-100 text-emerald-600',
      accent: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
      progress: 'bg-emerald-500/70',
    },
    error: {
      icon: <XCircle size={16} />,
      chip: 'bg-red-100 text-red-600',
      accent: 'bg-gradient-to-b from-red-400 to-red-600',
      progress: 'bg-red-500/70',
    },
    info: {
      icon: <Info size={16} />,
      chip: 'bg-[#EAF1FF] text-[#1A56D6]',
      accent: 'bg-gradient-to-b from-[#7EA6FF] to-[#1A56D6]',
      progress: 'bg-[#1A56D6]/60',
    },
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5 w-[340px] max-w-[90vw]">
        {toasts.map((t) => {
          const s = STYLES[t.type] || STYLES.info;
          return (
            <div
              key={t.id}
              className="relative flex items-start gap-3 bg-white/95 backdrop-blur border border-[#E3EAF7] shadow-xl shadow-[#0A1A3F]/10 rounded-xl pl-4 pr-3 py-3.5 text-sm text-[#1E2B4A] overflow-hidden animate-toast-in"
            >
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.accent}`} />
              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${s.chip}`}>
                {s.icon}
              </span>
              <p className="flex-1 pt-0.5 font-medium leading-snug">{t.message}</p>
              <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-700 shrink-0 mt-0.5 transition-colors">
                <X size={14} />
              </button>
              <span className={`absolute bottom-0 left-0 h-[2.5px] toast-progress ${s.progress}`} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
