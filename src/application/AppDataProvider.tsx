import React, { createContext, Dispatch, SetStateAction, useContext, useMemo, useState } from 'react';
import { AppData } from '../types';
import { DataRevision, INITIAL_DATA_REVISION } from '../state/appDataStore';
import { SahwaGateway } from './gateway';
import { resolveSahwaGateway } from './resolveGateway';

interface AppDataContextValue {
  data: AppData | null;
  setData: Dispatch<SetStateAction<AppData | null>>;
  dataRevision: DataRevision;
  setDataRevision: Dispatch<SetStateAction<DataRevision>>;
  lastUpdatedAt: number | null;
  setLastUpdatedAt: Dispatch<SetStateAction<number | null>>;
  gateway: SahwaGateway;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [dataRevision, setDataRevision] = useState(INITIAL_DATA_REVISION);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const gateway = useMemo(() => resolveSahwaGateway(), []);
  const value = useMemo(
    () => ({ data, setData, dataRevision, setDataRevision, lastUpdatedAt, setLastUpdatedAt, gateway }),
    [data, dataRevision, lastUpdatedAt, gateway]
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppDataContext(): AppDataContextValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppDataContext يجب استخدامه داخل AppDataProvider');
  return value;
}
