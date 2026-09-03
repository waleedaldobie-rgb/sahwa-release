import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.join(process.cwd(), 'acceptance-results', 'visual', 'flow');
fs.mkdirSync(outputDir, { recursive: true });
const port = process.env.CDP_PORT || '9333';
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find((item) => item.type === 'page' && item.url !== 'about:blank');
if (!target?.webSocketDebuggerUrl) throw new Error('لم يتم العثور على صفحة التطبيق');

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
await command('Page.enable');

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.result?.value;
}

async function capture(name, action) {
  const state = await evaluate(`({
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1800),
    buttons: Array.from(document.querySelectorAll('button')).map((button) => button.innerText.trim()).filter(Boolean).slice(0, 40),
    inputs: Array.from(document.querySelectorAll('input,select,textarea')).map((element) => ({ tag: element.tagName, type: element.type || '', placeholder: element.placeholder || '', label: element.getAttribute('aria-label') || '' })).slice(0, 40),
    dialogs: Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).length,
    visibleText: Boolean(document.body.innerText.trim()),
    viewport: { width: window.innerWidth, height: window.innerHeight }
  })`);
  state.action = action;
  fs.writeFileSync(path.join(outputDir, `${name}.json`), JSON.stringify(state, null, 2));
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.result.data, 'base64'));
  return state;
}

async function clickText(text) {
  const result = await evaluate(`(() => {
    const element = Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim() === ${JSON.stringify(text)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!result) throw new Error(`لم يتم العثور على الزر: ${text}`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

const results = [];
await clickText('لوحة التحكم');
results.push(await capture('01-dashboard', 'initial dashboard'));
for (const [index, item] of ['إدارة الطلبات', 'العملاء والمقاسات', 'الفواتير والحسابات', 'المخزون والأصناف', 'المحاسبة والمشتريات', 'التقارير والإحصائيات', 'الإعدادات'].entries()) {
  await clickText(item);
  results.push(await capture(`${String(index + 2).padStart(2, '0')}-${index + 2}`, item));
}
await clickText('لوحة التحكم');
await clickText('تسجيل طلب جديد');
results.push(await capture('09-new-order-modal', 'open new order modal'));
await evaluate(`(() => { const heading = Array.from(document.querySelectorAll('h3')).find((element) => element.innerText.includes('جدول القياسات والرسومات')); if (heading) heading.scrollIntoView({ block: 'start' }); })()`);
await new Promise((resolve) => setTimeout(resolve, 500));
results.push(await capture('09-order-measurements', 'new order measurements section'));
await evaluate(`(() => { const element = Array.from(document.querySelectorAll('button')).find((button) => /إلغاء|إغلاق/.test(button.innerText)); if (element) element.click(); })()`);
await new Promise((resolve) => setTimeout(resolve, 500));
await clickText('نسخة احتياطية (استيراد/تصدير)');
results.push(await capture('10-backup-modal', 'open backup modal'));
await evaluate(`(() => { const element = Array.from(document.querySelectorAll('button')).find((button) => /إغلاق/.test(button.innerText)); if (element) element.click(); })()`);
await new Promise((resolve) => setTimeout(resolve, 500));
await clickText('العملاء والمقاسات');
await clickText('إضافة عميل جديد');
results.push(await capture('11-new-customer-form', 'open new customer form'));
fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(results, null, 2));
socket.close();
console.log(JSON.stringify(results.map((result) => ({ action: result.action, visibleText: result.visibleText, buttons: result.buttons.length, dialogs: result.dialogs })), null, 2));
