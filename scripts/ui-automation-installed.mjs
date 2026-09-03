import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const executablePath = process.env.SAHWA_EXE;
const testData = process.env.SAHWA_TEST_DATA || path.join(process.cwd(), 'ui-automation-data');
const evidenceDir = process.env.SAHWA_EVIDENCE_DIR || path.join(process.cwd(), 'test-results', 'ui-automation');

if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(`Installed Electron executable not found: ${executablePath}`);
}

fs.mkdirSync(testData, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const automationEnv = {
  ...process.env,
  APPDATA: path.join(testData, 'AppData', 'Roaming'),
  LOCALAPPDATA: path.join(testData, 'AppData', 'Local'),
  SAHWA_UI_AUTOMATION: '1',
};

async function launchApp() {
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox'],
    env: automationEnv,
  });
  const page = await app.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`[renderer:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => console.error(`[renderer:pageerror] ${error.message}`));
  return { app, page };
}

async function waitForDashboard(page) {
  await expect(page.getByText('لوحة التحكم', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
}

async function openCustomers(page) {
  await page.getByRole('button', { name: 'العملاء والمقاسات' }).click();
  await expect(page.getByText('إدارة العملاء والمقاسات', { exact: true })).toBeVisible();
}

async function openOrders(page) {
  await page.getByRole('button', { name: 'إدارة الطلبات' }).click();
  await expect(page.getByText('إدارة طلبات الخياطة', { exact: true }).first()).toBeVisible();
}

let app;
let page;

try {
  ({ app, page } = await launchApp());
  await waitForDashboard(page);
  await page.screenshot({ path: path.join(evidenceDir, '01-dashboard.png'), fullPage: true });

  // Customer + measurements: save through the installed application.
  await openCustomers(page);
  await page.getByTestId('customers-add').click();
  await expect(page.getByText('تسجيل عميل جديد', { exact: true })).toBeVisible();
  await page.getByTestId('customer-name').fill('عميل UI Automation');
  await page.getByTestId('customer-phone').fill('0500000099');
  await page.getByTestId('customer-measurement-frontLength').fill('25.5');
  await page.getByTestId('customer-measurement-sleeveLength').fill('24');
  await page.screenshot({ path: path.join(evidenceDir, '02-customer-measurements.png'), fullPage: true });
  await page.getByTestId('save-customer-measurements').click();
  await expect(page.getByRole('status').filter({ hasText: 'تم حفظ بيانات العميل بنجاح' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('عميل UI Automation', { exact: true })).toBeVisible({ timeout: 15_000 });

  // New order + original order measurements layout.
  await openOrders(page);
  await page.getByTestId('orders-add').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('جدول القياسات والرسومات', { exact: true })).toBeVisible();
  await page.getByTestId('order-customer-select').selectOption({ label: 'عميل UI Automation - (0500000099)' });
  await expect(page.getByTestId('order-customer-select')).toHaveValue(/.+/);
  await page.waitForTimeout(300);
  await page.getByTestId('order-measurement-frontLength').fill('25.5');
  await page.getByTestId('order-measurement-backLength').fill('25');
  await page.getByTestId('order-measurement-shoulderWidth').fill('18');
  await page.getByTestId('order-measurement-sleeveLength').fill('24');
  await page.screenshot({ path: path.join(evidenceDir, '03-order-measurements.png'), fullPage: true });
  await page.getByTestId('order-save').click();
  await expect(page.getByRole('status').filter({ hasText: 'تم تسجيل الطلب الجديد رقم' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('عميل UI Automation', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(evidenceDir, '04-orders-after-save.png'), fullPage: true });

  // Reopen the application and prove the installed app reads the persisted data.
  await app.close();
  ({ app, page } = await launchApp());
  await waitForDashboard(page);
  await openCustomers(page);
  await expect(page.getByText('عميل UI Automation', { exact: true })).toBeVisible({ timeout: 15_000 });
  const persistedCustomerRow = page.getByRole('row', { name: /عميل UI Automation/ });
  await persistedCustomerRow.getByRole('button', { name: 'عرض التفاصيل' }).click();
  await expect(page.getByTestId('customer-measurement-frontLength')).toHaveValue('25.5');
  await page.screenshot({ path: path.join(evidenceDir, '05-customer-after-reopen.png'), fullPage: true });

  await openOrders(page);
  await expect(page.getByText('عميل UI Automation', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(evidenceDir, '06-orders-after-reopen.png'), fullPage: true });

  console.log('UI_AUTOMATION=PASS');
} finally {
  if (app) await app.close().catch(() => {});
}
