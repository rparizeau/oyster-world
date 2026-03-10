import { useState, useCallback, useRef } from 'react';
import type { Toast } from '../types';

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', position?: Toast['position']) => {
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev.slice(-2), { id, message, type, position }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, addToast };
}
