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

  const ICONS = {
    success: <CheckCircle2 size={18} className="text-emerald-600" />,
    error: <XCircle size={18} className="text-red-600" />,
    info: <Info size={18} className="text-gray-500" />,
  };
  const BORDERS = {
    success: 'border-emerald-300',
    error: 'border-red-300',
    info: 'border-gray-300',
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 bg-white border ${BORDERS[t.type]} shadow-lg rounded-lg px-4 py-3 text-sm text-[#1E2B4A] animate-in fade-in slide-in-from-bottom-2`}
          >
            {ICONS[t.type]}
            <p className="flex-1">{t.message}</p>
            <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-700">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
