const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const outputDir = path.join(process.cwd(), 'acceptance-results', 'visual');
  fs.mkdirSync(outputDir, { recursive: true });
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#f7f3ea',
    webPreferences: {
      preload: path.join(process.cwd(), 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const consoleMessages = [];
  const failures = [];
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    consoleMessages.push({ level, message, line, sourceId });
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    failures.push({ errorCode, errorDescription, validatedURL });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    failures.push({ renderProcessGone: details });
  });
  const url = `file://${path.join(process.cwd(), 'dist', 'index.html')}`;
  await window.loadURL(url);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const domSnapshot = await window.webContents.executeJavaScript(`({
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1200),
    html: document.documentElement.outerHTML.slice(0, 4000),
    width: window.innerWidth,
    height: window.innerHeight,
    buttons: Array.from(document.querySelectorAll('button')).slice(0, 20).map((button) => button.innerText.trim()).filter(Boolean),
    visibleText: Boolean(document.body.innerText.trim()),
    hasRoot: Boolean(document.getElementById('root')),
    hasElectronApi: Boolean(window.electronAPI),
    resources: performance.getEntriesByType('resource').map((entry) => entry.name).slice(-40)
  })`);
  domSnapshot.consoleMessages = consoleMessages;
  domSnapshot.failures = failures;
  fs.writeFileSync(path.join(outputDir, 'homepage-dom.json'), JSON.stringify(domSnapshot, null, 2));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, 'homepage.png'), image.toPNG());
  await app.quit();
});

app.on('window-all-closed', () => app.quit());
