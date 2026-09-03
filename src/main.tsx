import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppDataProvider } from './application/AppDataProvider';
import { PreferencesProvider } from './application/PreferencesProvider';
import { ToastProvider } from './application/ToastProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDataProvider>
      <PreferencesProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </PreferencesProvider>
    </AppDataProvider>
  </StrictMode>,
);
