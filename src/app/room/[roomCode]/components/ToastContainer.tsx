import type { Toast } from '../types';

const positionClasses: Record<string, string> = {
  left: 'fixed bottom-6 left-4 z-50 flex flex-col gap-2 pointer-events-none items-start',
  right: 'fixed bottom-6 right-4 z-50 flex flex-col gap-2 pointer-events-none items-end',
  center: 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none items-center',
};

export default function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  const grouped = { left: [] as Toast[], right: [] as Toast[], center: [] as Toast[] };
  for (const toast of toasts) {
    grouped[toast.position || 'center'].push(toast);
  }

  return (
    <>
      {(['left', 'center', 'right'] as const).map((pos) =>
        grouped[pos].length > 0 ? (
          <div key={pos} className={positionClasses[pos]}>
            {grouped[pos].map((toast) => (
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
        ) : null,
      )}
    </>
  );
}
