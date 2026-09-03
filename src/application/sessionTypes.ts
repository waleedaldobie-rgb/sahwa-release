import { Dispatch, SetStateAction } from 'react';
import { AppData } from '../types';
import { ToastState } from '../components/ui';
import { DataSliceName } from '../state/appDataStore';
import { SahwaGateway } from './gateway';

export type ShowToast = (
  message: string,
  type?: ToastState['type'],
  action?: { label: string; onClick: () => void }
) => void;

export type ExecuteCrud = <T>(label: string, action: () => Promise<T>) => Promise<T | undefined>;

export interface AppSession {
  data: AppData | null;
  setData: Dispatch<SetStateAction<AppData | null>>;
  showToast: ShowToast;
  executeCrud: ExecuteCrud;
  loadAppData: () => Promise<string[]>;
  persistData: (updatedData: AppData) => Promise<string[]>;
  refreshSlices: (slices: readonly DataSliceName[]) => Promise<string[]>;
  offerDeleteUndo: (before: AppData, message: string) => void;
  gateway: SahwaGateway;
}
