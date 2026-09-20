import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const executablePath = process.env.SAHWA_EXE;
const evidenceDir = process.env.SAHWA_REAL_PRINT_EVIDENCE || path.join(process.cwd(), 'test-results', 'windows-real-print');
const dataDir = process.env.SAHWA_REAL_PRINT_DATA || path.join(process.cwd(), 'windows-real-print-data');
const dialogScript = path.resolve(process.cwd(), 'scripts', 'windows-print-dialog.ps1');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
if (!executablePath || !fs.existsSync(executablePath)) throw new Error(`Installed executable not found: ${executablePath}`);

const results = [];
let app;
let page;

function result(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`REAL_PRINT_${status}=${id} ${detail}`);
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function ps(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8' }).trim();
}
function waitForMonitor(outputPath, printerName, expectedText) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', dialogScript, '-PrinterName', printerName, '-OutputPath', outputPath, '-TimeoutSeconds', '75'];
    for (const text of expectedText) args.push('-ExpectedText', text);
    const child = spawn('powershell.exe', args, { windowsHide: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      let evidence;
      try { evidence = JSON.parse(lines.at(-1)); } catch { evidence = { status: 'FAIL', parseError: true, stdout, stderr, exitCode: code }; }
      if (code !== 0 && evidence.status !== 'NOT_TESTABLE') reject(new Error(`Print dialog monitor failed: ${JSON.stringify(evidence)}`));
      else resolve(evidence);
    });
  });
}

function discoverPrinter() {
  const raw = ps(`$items = @(Get-Printer | Select-Object Name,DriverName,PrinterStatus,Default,PortName); $items | ConvertTo-Json -Depth 4 -Compress`);
  const parsed = raw ? JSON.parse(raw) : [];
  const printers = Array.isArray(parsed) ? parsed : [parsed];
  const preferred = printers.find((item) => /Microsoft Print to PDF/i.test(item.Name || ''))
    || printers.find((item) => /pdf|xps|onenote|virtual/i.test(`${item.Name} ${item.DriverName}`));
  fs.writeFileSync(path.join(evidenceDir, 'printer-inventory.json'), JSON.stringify({ printers, selected: preferred || null }, null, 2));
  assert(preferred, `No Microsoft Print to PDF or other virtual printer found. Installed printers: ${JSON.stringify(printers)}`);
  return preferred;
}

async function waitReady(pageRef) {
  await pageRef.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await pageRef.waitForFunction(() => Boolean(window.electronAPI), undefined, { timeout: 30_000 });
  await expect(pageRef.getByRole('main').getByText('لوحة التحكم', { exact: true })).toBeVisible({ timeout: 30_000 });
}
async function openOrders(pageRef) {
  await pageRef.getByRole('button', { name: 'إدارة الطلبات', exact: true }).click();
  await expect(pageRef.getByRole('main').getByRole('heading', { name: 'إدارة طلبات الخياطة', exact: true })).toBeVisible({ timeout: 20_000 });
}
async function createFixture(pageRef) {
  await pageRef.getByRole('button', { name: 'المخزون والأصناف', exact: true }).click();
  await expect(pageRef.getByRole('main').getByRole('heading', { name: 'المخزون والأصناف', exact: true })).toBeVisible();
  await pageRef.getByRole('button', { name: 'إضافة قماش جديد', exact: true }).click();
  await pageRef.getByLabel('اسم القماش *', { exact: true }).fill('طباعة اختبار قماش');
  await pageRef.getByLabel('اللون', { exact: true }).fill('أزرق');
  await pageRef.getByLabel('المخزون الحالي (متر)', { exact: true }).fill('100');
  await pageRef.getByRole('button', { name: 'حفظ البيانات', exact: true }).click();
  await expect(pageRef.getByRole('row', { name: /طباعة اختبار قماش/ })).toBeVisible();
  await pageRef.getByRole('button', { name: 'العملاء والمقاسات', exact: true }).click();
  await expect(pageRef.getByRole('main').getByRole('heading', { name: 'إدارة العملاء والمقاسات', exact: true })).toBeVisible();
  await pageRef.getByTestId('customers-add').click();
  await pageRef.getByTestId('customer-name').fill('عميل اختبار الطباعة');
  await pageRef.getByTestId('customer-phone').fill('0500000999');
  await pageRef.getByTestId('customer-measurement-frontLength').fill('25');
  await pageRef.getByTestId('save-customer-measurements').click();
  await expect(pageRef.getByRole('row', { name: /عميل اختبار الطباعة/ })).toBeVisible();
  await openOrders(pageRef);
  await pageRef.getByTestId('orders-add').click();
  await pageRef.getByTestId('order-customer-select').selectOption({ label: /عميل اختبار الطباعة/ });
  const data = await pageRef.evaluate(() => window.electronAPI.getData());
  const fabric = data.fabrics.find((item) => item.name === 'طباعة اختبار قماش');
  const thobe = data.thobeTypes.find((item) => Number(item.defaultPrice) > 0) || data.thobeTypes[0];
  await pageRef.getByLabel('نوع الثوب *', { exact: true }).selectOption({ label: `${thobe.name} (${thobe.defaultPrice} ر.س)` });
  await pageRef.getByLabel('القماش واللون *', { exact: true }).selectOption({ label: `${fabric.name} - ${fabric.color} (${fabric.quantityMeters} متر)` });
  await pageRef.getByLabel('السعر الكلي (ر.س) *', { exact: true }).fill('275');
  await pageRef.getByLabel('المبلغ المدفوع (عربون) *', { exact: true }).fill('275');
  await pageRef.getByTestId('order-measurement-frontLength').fill('25');
  await pageRef.getByTestId('order-save').click();
  await expect(pageRef.getByRole('dialog')).toBeHidden({ timeout: 20_000 });
  const after = await pageRef.evaluate(() => window.electronAPI.getData());
  const shortOrder = after.orders.find((item) => item.customerName === 'عميل اختبار الطباعة');
  assert(shortOrder, 'Short invoice fixture was not created.');
  const longOrder = await pageRef.evaluate(async (source) => window.electronAPI.createOrder({
    ...source,
    id: `PRINT-LONG-${Date.now()}`,
    totalAmount: 880,
    paidAmount: 0,
    remainingAmount: 880,
    notes: Array.from({ length: 130 }, (_, index) => `ملاحظة اختبار طباعة طويلة ${index + 1}: التحقق من تقسيم الصفحة دون قص أو تداخل.`).join('\n')
  }), shortOrder);
  assert(longOrder?.id, 'Long invoice fixture was not created.');
  return { shortOrder, longOrder };
}

async function printOrder(pageRef, orderNumber, kind, printer) {
  await openOrders(pageRef);
  const row = pageRef.getByRole('row').filter({ hasText: String(orderNumber) }).last();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const menu = row.locator('details.sahwa-actions-menu');
  await menu.locator('summary').click();
  const button = menu.getByRole('button', { name: `طباعة الطلب ${orderNumber}`, exact: true });
  await expect(button).toBeVisible();
  const outputPath = path.join(evidenceDir, `${kind}-${String(orderNumber).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
  const monitor = waitForMonitor(outputPath, printer.Name, [String(orderNumber), 'عميل اختبار الطباعة', kind === 'short' ? '275' : '880']);
  await button.click();
  const printEvidence = await monitor;
  fs.writeFileSync(path.join(evidenceDir, `${kind}-print-job.json`), JSON.stringify(printEvidence, null, 2));
  if (printEvidence.status === 'NOT_TESTABLE') {
    result(`${kind}.print-pipeline`, 'NOT_TESTABLE', printEvidence.detail || 'Native Print Dialog automation unavailable.');
    return;
  }
  assert(printEvidence.printButtonClicked, 'Windows Print dialog was not confirmed as submitted.');
  assert(printEvidence.outputFileExists && printEvidence.outputFileBytes > 0, 'Virtual printer output file was not created or is empty.');
  const textStatus = printEvidence.textToolAvailable ? (printEvidence.expectedTextPresent ? 'PASS' : 'FAIL') : 'NOT_TESTABLE';
  const pageStatus = printEvidence.pdfInfoAvailable ? (printEvidence.pageSizePass && printEvidence.pageCount > 0 ? 'PASS' : 'FAIL') : 'NOT_TESTABLE';
  result(`${kind}.output-text`, textStatus, printEvidence.textDetail || 'PDF text extraction result unavailable.');
  result(`${kind}.pdf-metrics`, pageStatus, `page_size=${printEvidence.pageSize || 'unavailable'}; pages=${printEvidence.pageCount ?? 'unavailable'}`);
  const pipelineStatus = textStatus === 'FAIL' || pageStatus === 'FAIL' ? 'FAIL' : textStatus === 'NOT_TESTABLE' || pageStatus === 'NOT_TESTABLE' ? 'NOT_TESTABLE' : 'PASS';
  result(`${kind}.print-pipeline`, pipelineStatus, `printer=${printer.Name}; output=${outputPath}; bytes=${printEvidence.outputFileBytes}; job_seen=${printEvidence.printJobSeen}; job_ids=${JSON.stringify(printEvidence.jobIds || [])}`);
}

try {
  const printer = discoverPrinter();
  app = await electron.launch({ executablePath, args: ['--no-sandbox', `--user-data-dir=${path.join(dataDir, 'user-data')}`], env: { ...process.env, SAHWA_UI_AUTOMATION: '1', APPDATA: path.join(dataDir, 'AppData'), LOCALAPPDATA: path.join(dataDir, 'LocalAppData') } });
  page = await app.firstWindow();
  await waitReady(page);
  const fixtures = await createFixture(page);
  result('short.invoice-creation', 'PASS', `order=${fixtures.shortOrder.orderNumber}; invoice=INV-${fixtures.shortOrder.orderNumber}`);
  result('long.invoice-creation', 'PASS', `order=${fixtures.longOrder.orderNumber}; invoice=INV-${fixtures.longOrder.orderNumber}`);
  await printOrder(page, fixtures.shortOrder.orderNumber, 'short', printer);
  await printOrder(page, fixtures.longOrder.orderNumber, 'long', printer);
} catch (error) {
  result('real-print-harness', 'FAIL', error instanceof Error ? error.stack || error.message : String(error));
} finally {
  await app?.close().catch(() => {});
}

const nonPass = results.filter((item) => item.status === 'FAIL');
fs.writeFileSync(path.join(evidenceDir, 'real-print-summary.json'), JSON.stringify({
  conclusion: nonPass.length ? 'FAIL — Print Job was not successfully sent/completed' : results.some((item) => item.status === 'NOT_TESTABLE') ? 'PARTIAL — Print pipeline verified only up to native dialog automation' : 'PASS — Real Windows Print Job verified',
  executablePath,
  results
}, null, 2));
if (nonPass.length) process.exitCode = 1;
