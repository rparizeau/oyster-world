import type { Toast } from '../types';

export default function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm pointer-events-auto ${
            toast.type === 'success'
              ? 'bg-success/90 text-white'
              : toast.type === 'warning'
                ? 'bg-warning/90 text-black'
                : 'bg-surface-light/90 text-foreground border border-border'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
