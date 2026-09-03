import React, { createContext, useContext } from 'react';
import { useToast } from './useToast';

type ToastContextValue = ReturnType<typeof useToast>;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const value = useToast();
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToastContext(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToastContext يجب استخدامه داخل ToastProvider');
  return value;
}
