import React, { createContext, Dispatch, SetStateAction, useContext, useMemo, useState } from 'react';
import { UserPreferences } from '../types';

interface PreferencesContextValue {
  prefs: UserPreferences;
  setPrefs: Dispatch<SetStateAction<UserPreferences>>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>({ activeTab: 'dashboard', invoicePrintMode: 'detailed' });
  const value = useMemo(() => ({ prefs, setPrefs }), [prefs]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferencesContext(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferencesContext يجب استخدامه داخل PreferencesProvider');
  return value;
}
