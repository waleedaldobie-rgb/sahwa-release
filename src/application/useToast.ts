import { useCallback, useRef, useState } from 'react';
import { ToastState } from '../components/ui';
import { formatIpcErrorMessage } from '../utils/ipcError';
import { ExecuteCrud, ShowToast } from './sessionTypes';

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
  const [crudProgress, setCrudProgress] = useState<{ isExecuting: boolean; label: string }>({
    isExecuting: false,
    label: '',
  });
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast: ShowToast = useCallback((message, type = 'info', action) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setToast({
      show: true,
      message,
      type,
      actionLabel: action?.label,
      onAction: action?.onClick,
    });
    undoTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false, actionLabel: undefined, onAction: undefined }));
    }, action ? 5000 : 4000);
  }, []);

  const executeCrud: ExecuteCrud = useCallback(async (label, action) => {
    setCrudProgress({ isExecuting: true, label });
    try {
      return await action();
    } catch (err: unknown) {
      showToast(formatIpcErrorMessage(err), 'danger');
      return undefined;
    } finally {
      setCrudProgress({ isExecuting: false, label: '' });
    }
  }, [showToast]);

  const handleCloseToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  return { toast, showToast, executeCrud, crudProgress, undoTimerRef, handleCloseToast };
}
