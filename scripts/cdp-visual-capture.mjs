import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.join(process.cwd(), 'acceptance-results', 'visual');
fs.mkdirSync(outputDir, { recursive: true });

const port = process.env.CDP_PORT || '9333';
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('لم يتم العثور على نافذة Electron عبر CDP');

const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolver = pending.get(message.id);
  if (resolver) {
    pending.delete(message.id);
    resolver(message);
  }
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`انتهت مهلة CDP: ${method}`));
    }, 10000);
  });
}

await command('Runtime.enable');
const evaluation = await command('Runtime.evaluate', {
  expression: `({
    title: document.title,
    bodyText: document.body.innerText.slice(0, 2000),
    width: window.innerWidth,
    height: window.innerHeight,
    buttons: Array.from(document.querySelectorAll('button')).slice(0, 30).map((button) => button.innerText.trim()).filter(Boolean),
    visibleText: Boolean(document.body.innerText.trim()),
    hasRoot: Boolean(document.getElementById('root')),
    hasElectronApi: Boolean(window.electronAPI)
  })`,
  returnByValue: true,
  awaitPromise: true
});
const snapshot = evaluation.result?.result?.value || {};
const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
fs.writeFileSync(path.join(outputDir, 'actual-main-homepage.png'), Buffer.from(screenshot.result.data, 'base64'));
fs.writeFileSync(path.join(outputDir, 'actual-main-homepage-dom.json'), JSON.stringify(snapshot, null, 2));
socket.close();
console.log(JSON.stringify(snapshot, null, 2));
