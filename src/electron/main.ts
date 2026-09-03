import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { SahwaDatabaseManager } from './db';
import { registerIpcHandlers } from './ipcHandlers';
import { assertTrustedSender, setTrustedWindow } from './security/ipcGuard';
import { isAllowedExternalUrl, isSameOriginNavigation } from './security/navigationPolicy';

let mainWindow: BrowserWindow | null = null;
let dbManager: SahwaDatabaseManager | null = null;
let isClosing = false;

async function closeResourcesOnce(): Promise<void> {
  if (isClosing) return;
  isClosing = true;
  if (dbManager) {
    try {
      await dbManager.close();
    } catch (error) {
      console.error('Error during database close:', error);
    }
  }
}

function registerAutomationDiagnostics(databaseDir: string, backupDir: string): void {
  if (process.env.SAHWA_UI_AUTOMATION !== '1') return;

  ipcMain.handle('automation:storageInfo', (event) => {
    assertTrustedSender(event, 'automation:storageInfo');
    return {
      userDataPath: app.getPath('userData'),
      databasePath: path.join(databaseDir, 'sahwa_tailoring.db'),
      backupDir,
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged
    };
  });

  ipcMain.handle('automation:printToPDF', async (event, options: Electron.PrintToPDFOptions = {}) => {
    assertTrustedSender(event, 'automation:printToPDF');
    const window = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!window) throw new Error('نافذة الطباعة غير متاحة');
    const pdf = await window.webContents.printToPDF({
      ...options,
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    return Buffer.from(pdf).toString('base64');
  });
}

function createWindow() {
  app.setAppUserModelId('com.sahwa.tailoring');
  const userDataDir = app.getPath('userData');
  const databaseDir = path.join(userDataDir, 'database');
  const backupDir = path.join(userDataDir, 'backups');
  const legacyDataDir = path.join(process.cwd(), 'data');

  dbManager = new SahwaDatabaseManager(databaseDir, legacyDataDir, backupDir);
  const initResult = dbManager.initDatabase();

  if (!initResult.success) {
    throw new Error(initResult.error || 'تعذر تهيئة قاعدة بيانات صهوة');
  }
  if (initResult.corruptedRecoveryMessage) {
    console.warn('DB Recovery Notice:', initResult.corruptedRecoveryMessage);
  }

  registerIpcHandlers(dbManager);
  registerAutomationDiagnostics(databaseDir, backupDir);

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1360,
    minHeight: 800,
    center: true,
    title: 'صهوة للخياطة الرجالية - إدارة المحل والمأخوذات',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.maximize();

  // ===== Phase 1 hardening: trusted window + navigation policy =====
  setTrustedWindow(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || '';
    if (!isSameOriginNavigation(currentUrl, url)) event.preventDefault();
  });
  // ==================================================================

  if (process.env.NODE_ENV === 'development') {
    void mainWindow.loadURL('http://localhost:3000');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    setTrustedWindow(null);
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  void (async () => {
    await closeResourcesOnce();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  })();
});

app.on('before-quit', (event) => {
  if (isClosing) return;
  event.preventDefault();
  void closeResourcesOnce().then(() => app.exit(0));
});
