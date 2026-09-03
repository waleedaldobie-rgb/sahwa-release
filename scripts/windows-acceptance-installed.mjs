import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const executablePath = process.env.SAHWA_EXE;
const testData = process.env.SAHWA_TEST_DATA || path.join(process.cwd(), 'windows-acceptance-data');
const evidenceDir = process.env.SAHWA_EVIDENCE_DIR || path.join(process.cwd(), 'test-results', 'windows-acceptance');
const acceptanceRunId = process.env.GITHUB_RUN_ID || `local-${process.pid}-${Date.now()}`;
let offlineAdapters = [];

if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error(`Installed Electron executable not found: ${executablePath}`);
}

fs.mkdirSync(testData, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const results = [];
const runtimeErrors = [];
const childProcessOutput = [];
let app;
let page;
let offlineEnabled = false;
let backupPath;
let excelPath;
let orderNumber;

function readPackageVersion() {
  const packagePath = path.join(process.cwd(), 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageJson.version ? `v${packageJson.version}` : null;
  } catch {
    return null;
  }
}

function readExactGitTag() {
  try {
    return execFileSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || null;
  } catch {
    return null;
  }
}

function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || null;
  } catch {
    return null;
  }
}

const acceptanceVersion =
  process.env.SAHWA_EXPECTED_VERSION ||
  readExactGitTag() ||
  readPackageVersion() ||
  'unknown';

const acceptanceCommit =
  process.env.SAHWA_EXPECTED_COMMIT ||
  readGitCommit() ||
  'unknown';

function pass(id, detail) {
  results.push({ id, status: 'PASS', detail });
  console.log(`ACCEPTANCE_PASS=${id} ${detail}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fail(id, error) {
  const detail = error instanceof Error ? error.message : String(error);
  results.push({ id, status: 'FAIL', detail });
  console.error(`ACCEPTANCE_FAIL=${id} ${detail}`);
}

function notTestable(id, detail) {
  results.push({ id, status: 'NOT_TESTABLE', detail });
  console.warn(`ACCEPTANCE_NOT_TESTABLE=${id} ${detail}`);
}

async function runScenario(id, fn) {
  try {
    const detail = await fn();
    pass(id, detail || 'scenario passed');
  } catch (error) {
    fail(id, error);
  }
}

function assertNoAcceptanceFailures() {
  const nonPass = results.filter((item) => item.status !== 'PASS');
  if (nonPass.length > 0) {
    throw new Error(`Acceptance contains non-PASS results: ${nonPass.map((item) => item.id).join(', ')}`);
  }
}

async function waitForToast(pageRef, pattern, type = 'success') {
  const toast = pageRef.getByRole(type === 'danger' ? 'alert' : 'status').filter({ hasText: pattern });
  try {
    await expect(toast).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    const bodyText = (await pageRef.locator('body').innerText()).slice(-4000);
    await pageRef.screenshot({ path: path.join(evidenceDir, `toast-failure-${Date.now()}.png`), fullPage: true }).catch(() => {});
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nVisible body tail:\n${bodyText}`);
  }
}

async function waitForAppReady(pageRef) {
  await pageRef.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await pageRef.waitForFunction(() => Boolean(window.electronAPI), undefined, { timeout: 30_000 });
  await getDataSnapshot(pageRef);
}

async function waitForDashboard(pageRef) {
  await waitForAppReady(pageRef);
  await expect(pageRef.getByRole('main').getByText('لوحة التحكم', { exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openTab(pageRef, navLabel, heading) {
  await pageRef.getByRole('button', { name: navLabel, exact: true }).click();
  await expect(pageRef.getByRole('main').getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 20_000 });
}

async function attachRuntimeMonitoring(appRef, pageRef) {
  pageRef.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`[renderer:console.error] ${message.text()}`);
  });
  pageRef.on('pageerror', (error) => runtimeErrors.push(`[renderer:pageerror] ${error.message}`));
  const child = appRef.process();
  child?.stdout?.on('data', (chunk) => childProcessOutput.push(`[stdout] ${chunk.toString()}`));
  child?.stderr?.on('data', (chunk) => childProcessOutput.push(`[stderr] ${chunk.toString()}`));
}

async function launchApp({ forceWhatsAppFailure = false, dataDir = testData } = {}) {
  const hostAppData = process.env.APPDATA || path.join(dataDir, 'AppData', 'Roaming');
  const hostLocalAppData = process.env.LOCALAPPDATA || path.join(dataDir, 'AppData', 'Local');
  const fixtureName = path.basename(dataDir).replace(/[^a-zA-Z0-9_-]/g, '_');
  const userDataDir = path.join(hostAppData, 'sahwa-packaged-acceptance', acceptanceRunId, fixtureName);
  const automationEnv = {
    ...process.env,
    APPDATA: hostAppData,
    LOCALAPPDATA: hostLocalAppData,
    SAHWA_UI_AUTOMATION: '1',
    ...(forceWhatsAppFailure ? { SAHWA_FORCE_WHATSAPP_FAILURE: '1' } : {})
  };
  app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', `--user-data-dir=${userDataDir}`],
    env: automationEnv
  });
  page = await app.firstWindow();
  await attachRuntimeMonitoring(app, page);
  return { app, page };
}

async function closeApp() {
  if (app) {
    await app.close().catch(() => {});
    app = undefined;
    page = undefined;
  }
}

async function getDataSnapshot(pageRef) {
  return pageRef.evaluate(() => window.electronAPI.getData());
}

async function waitForData(pageRef, predicate, description) {
  await expect.poll(async () => predicate(await getDataSnapshot(pageRef)), { timeout: 20_000, message: description }).toBe(true);
}

async function waitForReachability(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return { reachable: true, status: response.status };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function runPowerShell(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8' });
}

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function verifyInstalledIdentityAndIcon() {
  const expectedIconPath = path.resolve(process.cwd(), 'build', 'icon.ico');
  assert(fs.existsSync(expectedIconPath), `Expected source icon was not found: ${expectedIconPath}`);
  const expectedShortcutName = 'صهوة للخياطة';
  const command = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$exePath = ${powershellLiteral(path.resolve(executablePath))}
$expectedIconPath = ${powershellLiteral(expectedIconPath)}
$expectedShortcutName = ${powershellLiteral(expectedShortcutName)}

function Get-RenderedIcon([System.Drawing.Icon] $icon) {
  $bitmap = New-Object System.Drawing.Bitmap 64, 64
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawIcon($icon, [System.Drawing.Rectangle]::new(0, 0, 64, 64))
    $stream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($stream.ToArray())
      $hashText = ([BitConverter]::ToString($hash) -replace '-', '')
    } finally {
      $stream.Dispose()
    }
    $argb = [int[]]::new(4096)
    $opaquePixels = 0
    for ($y = 0; $y -lt 64; $y += 1) {
      for ($x = 0; $x -lt 64; $x += 1) {
        $color = $bitmap.GetPixel($x, $y)
        $argb[($y * 64) + $x] = $color.ToArgb()
        if ($color.A -gt 8) { $opaquePixels += 1 }
      }
    }
    return [pscustomobject]@{ hash = $hashText; argb = $argb; opaquePixels = $opaquePixels }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$exe = Get-Item -LiteralPath $exePath
$versionInfo = $exe.VersionInfo
$exeIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
if (-not $exeIcon) { throw "No icon resource was extracted from $exePath" }
$sourceIcon = New-Object System.Drawing.Icon($expectedIconPath, $exeIcon.Width, $exeIcon.Height)
try {
  $exeRendered = Get-RenderedIcon $exeIcon
  $sourceRendered = Get-RenderedIcon $sourceIcon
  $pixelDistance = [double]0
  $maxPixelDistance = [double](255 * 4 * 4096)
  for ($i = 0; $i -lt 4096; $i += 1) {
    $exeColor = [System.Drawing.Color]::FromArgb([int]$exeRendered.argb[$i])
    $sourceColor = [System.Drawing.Color]::FromArgb([int]$sourceRendered.argb[$i])
    $pixelDistance += [Math]::Abs([int]$exeColor.R - [int]$sourceColor.R)
    $pixelDistance += [Math]::Abs([int]$exeColor.G - [int]$sourceColor.G)
    $pixelDistance += [Math]::Abs([int]$exeColor.B - [int]$sourceColor.B)
    $pixelDistance += [Math]::Abs([int]$exeColor.A - [int]$sourceColor.A)
  }
  $iconSimilarity = 1 - ($pixelDistance / $maxPixelDistance)
  $opaqueSimilarity = 1 - ([Math]::Abs([int]$exeRendered.opaquePixels - [int]$sourceRendered.opaquePixels) / 4096)
  # Windows may select a different ICO frame and rasterize it differently.
  # Require close visual similarity and comparable opaque coverage rather than byte equality.
  $iconResourceMatchesSource = $iconSimilarity -ge 0.50 -and $opaqueSimilarity -ge 0.85
} finally {
  if ($exeIcon) { $exeIcon.Dispose() }
  if ($sourceIcon) { $sourceIcon.Dispose() }
}

function Test-ByteSequence([byte[]] $bytes, [byte[]] $pattern) {
  if ($pattern.Length -eq 0 -or $bytes.Length -lt $pattern.Length) { return $false }
  for ($i = 0; $i -le $bytes.Length - $pattern.Length; $i += 1) {
    $matched = $true
    for ($j = 0; $j -lt $pattern.Length; $j += 1) {
      if ($bytes[$i + $j] -ne $pattern[$j]) { $matched = $false; break }
    }
    if ($matched) { return $true }
  }
  return $false
}

$shortcutRoots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:PUBLIC 'Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$shortcutCandidates = @()
foreach ($root in $shortcutRoots) {
  if (Test-Path -LiteralPath $root) {
    $shortcutCandidates += Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue
  }
}
$wsh = New-Object -ComObject WScript.Shell
$shortcuts = @($shortcutCandidates | ForEach-Object {
  $shortcut = $wsh.CreateShortcut($_.FullName)
  $targetPath = [string]$shortcut.TargetPath
  $shortcutBytes = [IO.File]::ReadAllBytes($_.FullName)
  $rawTargetMatchesExecutable = Test-ByteSequence $shortcutBytes ([Text.Encoding]::Unicode.GetBytes('sahwa-tailoring.exe')) -or Test-ByteSequence $shortcutBytes ([Text.Encoding]::ASCII.GetBytes('sahwa-tailoring.exe'))
  $rawIconMatchesSource = Test-ByteSequence $shortcutBytes ([Text.Encoding]::Unicode.GetBytes('icon.ico')) -or Test-ByteSequence $shortcutBytes ([Text.Encoding]::ASCII.GetBytes('icon.ico'))
  $matchesExecutable = $rawTargetMatchesExecutable
  if (-not [string]::IsNullOrWhiteSpace($targetPath)) {
    try {
      $matchesExecutable = $matchesExecutable -or ([IO.Path]::GetFullPath($targetPath) -ieq [IO.Path]::GetFullPath($exePath))
    } catch {
      # Some Windows shell links expose an empty/unsupported target through WScript.Shell.
    }
  }
  [pscustomobject]@{
    path = $_.FullName
    name = $_.BaseName
    targetPath = $targetPath
    iconLocation = [string]$shortcut.IconLocation
    workingDirectory = [string]$shortcut.WorkingDirectory
    rawTargetMatchesExecutable = $rawTargetMatchesExecutable
    rawIconMatchesSource = $rawIconMatchesSource
    matchesExecutable = $matchesExecutable
    matchesExpectedName = ($_.BaseName -eq $expectedShortcutName)
  }
})
$matchingShortcuts = @($shortcuts | Where-Object { $_.matchesExecutable -and $_.matchesExpectedName })
$targetShortcuts = @($shortcuts | Where-Object { $_.matchesExecutable })
$iconLocationValid = $targetShortcuts.Count -gt 0 -and @($targetShortcuts | Where-Object {
  $_.rawTargetMatchesExecutable -and (
    [string]::IsNullOrWhiteSpace($_.iconLocation) -or
    $_.iconLocation -eq ',0' -or
    $_.iconLocation -match 'sahwa-tailoring|icon\\.ico'
  )
}).Count -gt 0

$result = [pscustomobject]@{
  executablePath = $exePath
  executableName = $exe.Name
  productName = [string]$versionInfo.ProductName
  fileDescription = [string]$versionInfo.FileDescription
  sourceIconPath = $expectedIconPath
  executableIconHash = $exeRendered.hash
  sourceIconHash = $sourceRendered.hash
  iconSimilarity = [Math]::Round($iconSimilarity, 4)
  opaqueSimilarity = [Math]::Round($opaqueSimilarity, 4)
  iconResourceMatchesSource = $iconResourceMatchesSource
  shortcutName = $expectedShortcutName
  shortcuts = $shortcuts
  matchingShortcutCount = $matchingShortcuts.Count
  iconLocationValid = $iconLocationValid
}
$result | ConvertTo-Json -Depth 6 -Compress
`;
  let raw;
  try {
    raw = runPowerShell(command).trim();
  } catch (error) {
    const stdout = error?.stdout?.toString?.() || '';
    const stderr = error?.stderr?.toString?.() || '';
    throw new Error(`Windows identity probe failed before producing evidence. stdout=${stdout} stderr=${stderr}`);
  }
  const evidence = JSON.parse(raw.split(/\r?\n/).filter(Boolean).at(-1));
  fs.writeFileSync(path.join(evidenceDir, 'package-identity-evidence.json'), JSON.stringify(evidence, null, 2));
  assert(evidence.executableName === 'sahwa-tailoring.exe', `Unexpected executable name: ${evidence.executableName}`);
  assert(evidence.matchingShortcutCount >= 1, `No shortcut named '${expectedShortcutName}' targets ${executablePath}. Found: ${JSON.stringify(evidence.shortcuts)}`);
  assert(evidence.iconLocationValid, `No matching shortcut exposes a Sahwa icon location. Found: ${JSON.stringify(evidence.shortcuts)}`);
  assert(evidence.iconResourceMatchesSource, `Installed executable icon rendering does not match build/icon.ico. Evidence: ${JSON.stringify({ executableIconHash: evidence.executableIconHash, sourceIconHash: evidence.sourceIconHash, iconSimilarity: evidence.iconSimilarity, opaqueSimilarity: evidence.opaqueSimilarity })}`);
  return `executable=${evidence.executableName}; shortcuts=${evidence.matchingShortcutCount}; icon_match=${evidence.iconResourceMatchesSource}`;
}

function enableOfflineNetwork() {
  const rawNames = runPowerShell("@(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Name -notlike '*Loopback*' } | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress").trim();
  offlineAdapters = rawNames ? JSON.parse(rawNames) : [];
  if (typeof offlineAdapters === 'string') offlineAdapters = [offlineAdapters];
  if (!Array.isArray(offlineAdapters) || offlineAdapters.length === 0) throw new Error('No active Windows network adapter was found to disable.');
  offlineEnabled = true;
  for (const adapterName of offlineAdapters) {
    runPowerShell(`Disable-NetAdapter -Name ${JSON.stringify(adapterName)} -Confirm:$false -ErrorAction Stop`);
  }
}

function disableOfflineNetwork() {
  if (!offlineEnabled) return;
  for (const adapterName of offlineAdapters) {
    runPowerShell(`Enable-NetAdapter -Name ${JSON.stringify(adapterName)} -Confirm:$false -ErrorAction SilentlyContinue`);
  }
  offlineAdapters = [];
  offlineEnabled = false;
}

async function createFabric(pageRef) {
  await openTab(pageRef, 'المخزون والأصناف', 'المخزون والأصناف');
  await pageRef.getByRole('button', { name: 'إضافة قماش جديد', exact: true }).click();
  await expect(pageRef.getByRole('dialog')).toBeVisible();
  await pageRef.getByLabel('اسم القماش *', { exact: true }).fill('قماش Windows Acceptance');
  await pageRef.getByLabel('اللون', { exact: true }).fill('كحلي');
  await pageRef.getByLabel('المخزون الحالي (متر)', { exact: true }).fill('50');
  await pageRef.getByRole('button', { name: 'حفظ البيانات', exact: true }).click();
  await expect(pageRef.getByRole('row', { name: /قماش Windows Acceptance/ })).toBeVisible({ timeout: 20_000 });
  await waitForData(pageRef, (data) => data.fabrics.some((item) => item.name === 'قماش Windows Acceptance'), 'fabric data was not persisted');
  const data = await getDataSnapshot(pageRef);
  const fabric = data.fabrics.find((item) => item.name === 'قماش Windows Acceptance');
  assert(fabric, 'The acceptance fabric was not persisted.');
  pass('inventory.fabric-create', `created ${fabric.id}`);
  return fabric;
}

async function createCustomerAndOrder(pageRef, fabric) {
  await openTab(pageRef, 'العملاء والمقاسات', 'إدارة العملاء والمقاسات');
  await pageRef.getByTestId('customers-add').click();
  await expect(pageRef.getByText('تسجيل عميل جديد', { exact: true })).toBeVisible();
  await pageRef.getByTestId('customer-name').fill('عميل Windows Acceptance');
  await pageRef.getByTestId('customer-phone').fill('0500000111');
  await pageRef.getByTestId('customer-measurement-frontLength').fill('25.5');
  await pageRef.getByTestId('customer-measurement-sleeveLength').fill('24');
  await pageRef.getByTestId('save-customer-measurements').click();
  await expect(pageRef.getByRole('row', { name: /عميل Windows Acceptance/ })).toBeVisible({ timeout: 20_000 });
  await waitForData(pageRef, (data) => data.customers.some((item) => item.name === 'عميل Windows Acceptance'), 'customer data was not persisted');
  const customerData = await getDataSnapshot(pageRef);
  const acceptanceCustomer = customerData.customers.find((item) => item.name === 'عميل Windows Acceptance');
  assert(acceptanceCustomer, 'The acceptance customer was not returned after persistence.');
  assert(Number.isInteger(Number(acceptanceCustomer.customerNumber)) && Number(acceptanceCustomer.customerNumber) > 0, `Invalid visible customer number: ${acceptanceCustomer.customerNumber}`);
  pass('customer.measurement-create', `created customer #${acceptanceCustomer.customerNumber} and saved measurements`);

  await openTab(pageRef, 'إدارة الطلبات', 'إدارة طلبات الخياطة');
  await pageRef.getByTestId('orders-add').click();
  await expect(pageRef.getByRole('dialog')).toBeVisible();
  await pageRef.getByTestId('order-customer-select').selectOption({ label: 'عميل Windows Acceptance - (0500000111)' });
  const orderSeed = await getDataSnapshot(pageRef);
  const thobeType = orderSeed.thobeTypes.find((item) => Number(item.defaultPrice) > 0) || orderSeed.thobeTypes[0];
  assert(thobeType, 'No real thobe type is available for the acceptance order.');
  await pageRef.getByLabel('نوع الثوب *', { exact: true }).selectOption({ label: `${thobeType.name} (${thobeType.defaultPrice} ر.س)` });
  await pageRef.getByLabel('القماش واللون *', { exact: true }).selectOption({ label: `${fabric.name} - ${fabric.color} (${fabric.quantityMeters} متر)` });
  await pageRef.getByLabel('السعر الكلي (ر.س) *', { exact: true }).fill('220');
  await pageRef.getByLabel('المبلغ المدفوع (عربون) *', { exact: true }).fill('50');
  await pageRef.getByTestId('order-measurement-frontLength').fill('25.5');
  await pageRef.getByTestId('order-measurement-backLength').fill('25');
  await pageRef.getByTestId('order-measurement-shoulderWidth').fill('18');
  await pageRef.getByTestId('order-measurement-sleeveLength').fill('24');
  await pageRef.getByTestId('order-save').click();
  await expect(pageRef.getByRole('row', { name: /عميل Windows Acceptance/ })).toBeVisible({ timeout: 20_000 });
  const data = await getDataSnapshot(pageRef);
  const order = data.orders.find((item) => item.customerName === 'عميل Windows Acceptance');
  assert(order, 'The acceptance order was not persisted.');
  assert(Number(order.totalAmount) === 220, `Unexpected order total: ${order.totalAmount}`);
  assert(Number(order.paidAmount) === 50, `Unexpected order deposit: ${order.paidAmount}`);
  orderNumber = order.orderNumber;
  pass('order.create', `created order ${orderNumber}`);
  return order;
}

async function verifyInvoiceAndPayment(pageRef, order) {
  await openTab(pageRef, 'الفواتير والحسابات', 'الفواتير والحسابات المالية');
  const row = pageRef.getByRole('row', { name: /عميل Windows Acceptance/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'تحصيل', exact: true }).click();
  await expect(pageRef.getByRole('dialog')).toBeVisible();
  await pageRef.getByLabel('مبلغ التحصيل (ر.س) *', { exact: true }).fill('170');
  await pageRef.getByRole('button', { name: 'تأكيد العملية', exact: true }).click();
  await waitForData(pageRef, (data) => data.invoices.some((item) => item.orderId === order.id && Number(item.paidAmount) === 220), 'payment was not persisted');
  const data = await getDataSnapshot(pageRef);
  const invoice = data.invoices.find((item) => item.orderId === order.id);
  assert(invoice, 'Invoice was not generated for the order.');
  assert(Number(invoice.paidAmount) === 220, `Unexpected invoice paid amount: ${invoice.paidAmount}`);
  assert(Number(invoice.remainingAmount) === 0, `Unexpected invoice remaining amount: ${invoice.remainingAmount}`);
  assert(Number.isInteger(Number(invoice.visibleInvoiceNumber)) && Number(invoice.visibleInvoiceNumber) > 0, `Invalid visible invoice number: ${invoice.visibleInvoiceNumber}`);
  assert(invoice.invoiceNumber === `INV-${order.orderNumber}`, `Legacy invoice number changed unexpectedly: ${invoice.invoiceNumber}`);
  pass('invoice.create', `invoice INV-${invoice.visibleInvoiceNumber} (legacy ${invoice.invoiceNumber}) visible and paid`);
  pass('payment.create', 'registered payment and reconciled invoice');
}

async function createAcceptanceOrder(pageRef, baseOrder, id, totalAmount, orderDate) {
  const created = await pageRef.evaluate(async ({ baseOrder: source, id: orderId, total, date }) => {
    return window.electronAPI.createOrder({
      id: orderId,
      customerId: source.customerId,
      customerName: source.customerName,
      customerPhone: source.customerPhone,
      thobeTypeName: source.thobeTypeName,
      fabricId: source.fabricId,
      fabricName: source.fabricName,
      fabricColor: source.fabricColor,
      garmentCount: 1,
      totalAmount: total,
      paidAmount: 0,
      orderDate: date,
      deliveryDate: date,
      measurements: source.measurements,
      styleDetails: source.styleDetails,
      materialUsages: []
    });
  }, { baseOrder, id, total: totalAmount, date: orderDate });
  assert(created?.id, 'Acceptance order was not created through the packaged IPC bridge.');
  return created;
}

async function verifyCustomerCreditAndRefund(pageRef, sourceOrder) {
  const creditSourceOrder = await createAcceptanceOrder(pageRef, sourceOrder, `WIN-CREDIT-SOURCE-${Date.now()}`, 100, '2026-08-20');
  const sourceDataBefore = await getDataSnapshot(pageRef);
  const sourceInvoice = sourceDataBefore.invoices.find((invoice) => invoice.orderId === creditSourceOrder.id);
  assert(sourceInvoice, 'Source invoice was not found for Customer Credit acceptance.');

  await pageRef.evaluate(async ({ invoiceId }) => {
    await window.electronAPI.addPayment({
      invoiceId,
      amount: 120,
      method: 'cash',
      note: 'Windows Customer Credit overpayment',
      paymentId: `WIN-CREDIT-OVERPAY-${Date.now()}`,
    });
  }, { invoiceId: sourceInvoice.id });

  const afterOverpayment = await getDataSnapshot(pageRef);
  const sourceAfterOverpayment = afterOverpayment.invoices.find((invoice) => invoice.id === sourceInvoice.id);
  const sourceCredit = await pageRef.evaluate((customerId) => window.electronAPI.customerCredits.summary(customerId), creditSourceOrder.customerId);
  assert(Number(sourceAfterOverpayment.cashReceived) === Number(sourceAfterOverpayment.appliedPaid || sourceAfterOverpayment.paidAmount) + 20, 'Cash received/applied split was not preserved for overpayment.');
  assert(Number(sourceCredit.availableBalance) === 20, `Expected 20 riyals customer credit, got ${sourceCredit.availableBalance}.`);
  pass('customer-credit.overpayment', 'created liability without increasing recognized revenue or applied collection');

  const laterOrder = await createAcceptanceOrder(pageRef, creditSourceOrder, `WIN-CREDIT-LATER-${Date.now()}`, 20, '2026-08-21');
  const laterData = await getDataSnapshot(pageRef);
  const laterInvoice = laterData.invoices.find((invoice) => invoice.orderId === laterOrder.id);
  assert(laterInvoice, 'Later invoice was not generated for Customer Credit apply.');
  const applyRequest = {
    customerId: creditSourceOrder.customerId,
    targetInvoiceId: laterInvoice.id,
    amount: 20,
    idempotencyKey: `WIN-CREDIT-APPLY-${Date.now()}`,
    reason: 'Windows acceptance later invoice apply',
    actorId: 'windows-acceptance'
  };
  const applied = await pageRef.evaluate((request) => window.electronAPI.customerCredits.apply(request), applyRequest);
  assert(applied.entryType === 'applied' && applied.method === 'customer_credit', 'Credit apply must be a non-cash applied entry.');
  assert(Number(applied.balanceAfter) === 0, 'Customer Credit balance was not reduced to zero after apply.');
  const replay = await pageRef.evaluate((request) => window.electronAPI.customerCredits.apply(request), applyRequest);
  assert(replay.idempotent === true, 'Repeated Customer Credit apply was not idempotent.');
  const afterApplyData = await getDataSnapshot(pageRef);
  const appliedLaterInvoice = afterApplyData.invoices.find((invoice) => invoice.id === laterInvoice.id);
  assert(Number(appliedLaterInvoice.cashReceived || 0) === 0, 'Non-cash Customer Credit apply changed cash_received.');
  pass('customer-credit.apply-fifo-idempotency', 'applied credit to a later invoice without cash movement and replayed idempotently');

  const refundOrder = await createAcceptanceOrder(pageRef, creditSourceOrder, `WIN-CREDIT-REFUND-${Date.now()}`, 30, '2026-08-22');
  const refundData = await getDataSnapshot(pageRef);
  const refundInvoice = refundData.invoices.find((invoice) => invoice.orderId === refundOrder.id);
  assert(refundInvoice, 'Refund fixture invoice was not generated.');
  await pageRef.evaluate(async ({ invoiceId }) => {
    await window.electronAPI.addPayment({
      invoiceId,
      amount: 40,
      method: 'cash',
      note: 'Windows Customer Credit refund fixture',
      paymentId: `WIN-CREDIT-REFUND-SEED-${Date.now()}`,
    });
  }, { invoiceId: refundInvoice.id });
  await pageRef.reload();
  await waitForAppReady(pageRef);
  await openTab(pageRef, 'العملاء والمقاسات', 'إدارة العملاء والمقاسات');
  await expect.poll(async () => Number((await pageRef.evaluate((customerId) => window.electronAPI.customerCredits.summary(customerId), creditSourceOrder.customerId)).availableBalance) > 0, { timeout: 20_000, message: 'Customer Credit ledger was not refreshed in CustomersView.' }).toBe(true);
  const refundButton = pageRef.getByTestId(`customer-credit-refund-${creditSourceOrder.customerId}`);
  await expect(refundButton).toBeVisible({ timeout: 20_000 });
  const cashCountBefore = (await getDataSnapshot(pageRef)).cashTransactions.length;
  await refundButton.click();
  await expect(pageRef.getByTestId('customer-credit-refund-form')).toBeVisible();
  await pageRef.getByLabel('المبلغ المسترد (ر.س) *').fill('5');
  await pageRef.getByLabel('طريقة الاسترداد *').selectOption('cash');
  await expect(pageRef.getByTestId('customer-credit-cash-warning')).toBeVisible();
  await pageRef.getByLabel('سبب الاسترداد *').fill('Windows cash customer credit refund');
  await pageRef.getByRole('button', { name: 'مراجعة الاسترداد', exact: true }).click();
  await expect(pageRef.getByTestId('customer-credit-refund-confirmation')).toBeVisible();
  await pageRef.getByRole('button', { name: 'تأكيد التنفيذ', exact: true }).click();
  await expect(pageRef.getByTestId('customer-credit-refund-result')).toBeVisible({ timeout: 20_000 });
  const afterCashRefund = await getDataSnapshot(pageRef);
  assert(afterCashRefund.cashTransactions.length === cashCountBefore + 1, 'Cash refund did not create exactly one cash outflow.');
  await pageRef.getByRole('button', { name: 'إغلاق', exact: true }).click();

  await expect.poll(async () => Number((await pageRef.evaluate((customerId) => window.electronAPI.customerCredits.summary(customerId), creditSourceOrder.customerId)).availableBalance) > 0, { timeout: 20_000, message: 'Customer credit state was not available after cash refund.' }).toBe(true);
  const nonCashRefundButton = pageRef.getByTestId(`customer-credit-refund-${creditSourceOrder.customerId}`);
  await nonCashRefundButton.click();
  await pageRef.getByTestId('customer-credit-refund-form').waitFor({ state: 'visible' });
  await pageRef.getByLabel('المبلغ المسترد (ر.س) *').fill('5');
  await pageRef.getByLabel('طريقة الاسترداد *').selectOption('card');
  await expect(pageRef.getByTestId('customer-credit-noncash-note')).toBeVisible();
  await pageRef.getByLabel('سبب الاسترداد *').fill('Windows non-cash customer credit refund');
  await pageRef.getByRole('button', { name: 'مراجعة الاسترداد', exact: true }).click();
  await pageRef.getByRole('button', { name: 'تأكيد التنفيذ', exact: true }).click();
  await expect(pageRef.getByTestId('customer-credit-refund-result')).toBeVisible({ timeout: 20_000 });
  const afterNonCashRefund = await getDataSnapshot(pageRef);
  assert(afterNonCashRefund.cashTransactions.length === cashCountBefore + 1, 'Non-cash refund changed Cash Drawer.');
  const creditHistory = await pageRef.evaluate((customerId) => window.electronAPI.customerCredits.list(customerId), creditSourceOrder.customerId);
  assert(creditHistory.some((entry) => entry.entryType === 'refunded' && entry.method === 'cash'), 'Cash refund ledger entry is missing.');
  assert(creditHistory.some((entry) => entry.entryType === 'refunded' && entry.method === 'card'), 'Non-cash refund ledger entry is missing.');
  pass('customer-credit.refund-cash-noncash', 'validated refund modal, cash outflow, non-cash isolation, and ledger audit');
  await pageRef.getByRole('button', { name: 'إغلاق', exact: true }).click();
}

async function testAccountingAndStock(pageRef, fabric) {
  await openTab(pageRef, 'المخزون والأصناف', 'المخزون والأصناف');
  const movementTab = pageRef.getByRole('tab', { name: 'حركة المخزون', exact: true });
  await movementTab.click();
  await expect(movementTab).toHaveAttribute('aria-selected', 'true');
  await pageRef.getByLabel('نوع الصنف', { exact: true }).selectOption('fabric');
  await pageRef.getByLabel('الصنف', { exact: true }).selectOption({ label: fabric.name });
  await pageRef.getByLabel('الكمية', { exact: true }).fill('1');
  await pageRef.getByLabel('السبب', { exact: true }).fill('جرد Windows Acceptance');
  await pageRef.getByRole('button', { name: 'حفظ', exact: true }).click();
  await waitForData(pageRef, (data) => data.stockMovements.some((item) => item.reason === 'جرد Windows Acceptance'), 'stock adjustment was not persisted');
  pass('inventory.adjustment', 'recorded stock adjustment');

  await openTab(pageRef, 'المحاسبة والمشتريات', 'المحاسبة والتدفقات المالية');
  await pageRef.getByLabel('المورد', { exact: true }).fill('مورد Windows Acceptance');
  await pageRef.getByLabel('رقم فاتورة الشراء', { exact: true }).fill('PUR-WIN-001');
  await pageRef.getByLabel('نوع الصنف', { exact: true }).selectOption('fabric');
  await pageRef.getByLabel('الصنف', { exact: true }).selectOption({ label: `${fabric.name} — ${fabric.color}` });
  await pageRef.getByLabel('الكمية', { exact: true }).fill('2');
  await pageRef.getByLabel('سعر الوحدة', { exact: true }).fill('18');
  await pageRef.getByRole('button', { name: 'إضافة', exact: true }).click();
  await expect(pageRef.getByRole('row', { name: new RegExp(fabric.name) })).toBeVisible();
  await pageRef.getByRole('button', { name: 'اعتماد وحفظ المشتريات', exact: true }).click();
  await waitForData(pageRef, (data) => data.purchases.some((item) => item.supplier === 'مورد Windows Acceptance'), 'purchase was not persisted');
  pass('purchases.create', 'created purchase and linked stock/cash effects');

  await pageRef.getByRole('button', { name: 'المصروفات', exact: true }).click();
  await pageRef.getByLabel('المبلغ', { exact: true }).fill('35');
  await pageRef.getByLabel('الوصف', { exact: true }).fill('مصروف Windows Acceptance');
  await pageRef.getByLabel('ملاحظات', { exact: true }).fill('اختبار قبول Windows');
  await pageRef.getByRole('button', { name: 'حفظ المصروف', exact: true }).click();
  await waitForData(pageRef, (data) => data.expenses.some((item) => item.description === 'مصروف Windows Acceptance'), 'expense was not persisted');
  pass('expenses.create', 'created expense and linked cash effect');

  await pageRef.getByRole('button', { name: 'الصندوق', exact: true }).click();
  await pageRef.getByLabel('المبلغ', { exact: true }).fill('15');
  await pageRef.getByLabel('المرجع', { exact: true }).fill('CASH-WIN-001');
  await pageRef.getByLabel('الوصف', { exact: true }).fill('تسوية Windows Acceptance');
  await pageRef.getByLabel('ملاحظات', { exact: true }).fill('اختبار قبول Windows');
  await pageRef.getByRole('button', { name: 'حفظ الحركة', exact: true }).click();
  await waitForData(pageRef, (data) => data.cashTransactions.some((item) => item.referenceNumber === 'CASH-WIN-001'), 'cash adjustment was not persisted');
  pass('cash.create', 'created cash adjustment and visible ledger entry');

  const data = await getDataSnapshot(pageRef);
  assert(data.purchases.some((item) => item.supplier === 'مورد Windows Acceptance'), 'Purchase missing from local data.');
  assert(data.expenses.some((item) => item.description === 'مصروف Windows Acceptance'), 'Expense missing from local data.');
  assert(data.cashTransactions.some((item) => item.referenceNumber === 'CASH-WIN-001'), 'Cash adjustment missing from local data.');
  assert(data.stockMovements.length > 0, 'Stock movements missing from local data.');
  pass('accounting.local-data', 'purchases, expenses, cash, and stock movement data verified');
}

async function verifyCsvAndReportingViews(pageRef) {
  await openTab(pageRef, 'التقارير والإحصائيات', 'التقارير والإحصائيات المالية');
  const reportText = await pageRef.getByRole('main').innerText();
  assert(reportText.includes('المبيعات المسجلة'), 'Reports do not show sales_booked presentation.');
  assert(reportText.includes('الإيراد المعترف به وفق تاريخ التسليم'), 'Reports do not show recognized_revenue presentation.');
  assert(reportText.includes('التحصيل المطبق'), 'Reports do not show applied settlement.');
  assert(reportText.includes('النقد المستلم'), 'Reports do not show cash received.');
  assert(reportText.includes('Customer Credit liability') || reportText.includes('التزام ائتمان العملاء'), 'Reports do not show the separate Customer Credit liability section.');
  assert(reportText.includes('الاستردادات النقدية'), 'Reports do not show Customer Credit cash refunds separately.');
  assert(reportText.includes('الاستردادات غير النقدية'), 'Reports do not show Customer Credit non-cash refunds separately.');
  await pageRef.screenshot({ path: path.join(evidenceDir, 'reports-formula-matrix.png'), fullPage: true });
  pass('reports.formula-separation', 'sales_booked, recognized_revenue, applied collection, and cash are visible separately');

  await pageRef.evaluate(() => {
    window.__sahwaCsvCapture = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function captureSahwaCsvClick() {
      if (this.download && this.download.endsWith('.csv')) {
        const href = this.href;
        window.__sahwaCsvCapture = fetch(href).then((response) => response.text()).then((text) => ({ filename: this.download, text }));
      }
      return originalClick.call(this);
    };
  });
  await pageRef.getByRole('button', { name: 'تصدير CSV (Blob)', exact: true }).click();
  await expect.poll(async () => Boolean(await pageRef.evaluate(() => window.__sahwaCsvCapture)), { timeout: 20_000, message: 'CSV Blob export did not create a downloadable anchor.' }).toBe(true);
  const csvCapture = await pageRef.evaluate(() => window.__sahwaCsvCapture);
  assert(csvCapture?.text, 'CSV Blob payload was empty.');
  const csvPath = path.join(evidenceDir, 'windows-acceptance-report.csv');
  fs.writeFileSync(csvPath, csvCapture.text, 'utf8');
  const csv = fs.readFileSync(csvPath, 'utf8');
  for (const header of ['applied_paid', 'cash_received', 'overpayment', 'cancellation writeoff']) {
    assert(csv.includes(header), `CSV is missing settlement column: ${header}`);
  }
  for (const metric of ['Customer Credit Section', 'customer_credit_cash_refunds', 'customer_credit_non_cash_refunds', 'closing_customer_credit_liability']) {
    assert(csv.includes(metric), `CSV is missing Customer Credit section metric: ${metric}`);
  }
  fs.writeFileSync(path.join(evidenceDir, 'csv-evidence.json'), JSON.stringify({ path: csvPath, bytes: fs.statSync(csvPath).size, headers: ['applied_paid', 'cash_received', 'overpayment', 'cancellation writeoff'], customerCreditMetrics: ['customer_credit_cash_refunds', 'customer_credit_non_cash_refunds', 'closing_customer_credit_liability'] }, null, 2));
  pass('reports.csv-export', `CSV exported and settlement columns verified (${fs.statSync(csvPath).size} bytes)`);

  await openTab(pageRef, 'المحاسبة والمشتريات', 'المحاسبة والتدفقات المالية');
  await pageRef.getByRole('button', { name: 'الصندوق', exact: true }).click();
  const accountingText = await pageRef.getByRole('main').innerText();
  assert(accountingText.includes('استردادات رصيد العملاء'), 'AccountingView cash tab does not show the separated Customer Credit refunds section.');
  await pageRef.screenshot({ path: path.join(evidenceDir, 'accounting-credit-separation.png'), fullPage: true });
  pass('accounting.credit-separation', 'AccountingView shows cash, applied collection, and Customer Credit refunds separately');
}

async function exportExcelAndBackup(pageRef) {
  await openTab(pageRef, 'التقارير والإحصائيات', 'التقارير والإحصائيات المالية');
  const data = await getDataSnapshot(pageRef);
  assert(data.orders.length > 0 && data.invoices.length > 0, 'Reports have no order/invoice data.');
  const xlsxModule = await import('xlsx');
  const xlsxVersion = xlsxModule.version || xlsxModule.default?.version;
  assert(xlsxVersion === '0.20.3', `Unexpected xlsx version: ${xlsxVersion}`);
  await pageRef.getByRole('button', { name: 'تصدير Excel', exact: true }).click();
  await waitForToast(pageRef, /تم تصدير ملف التقرير Excel بنجاح/);
  const reportBase64 = await pageRef.evaluate(() => window.electronAPI.exportExcelReport?.());
  assert(typeof reportBase64 === 'string' && reportBase64.length > 100, 'Electron Excel report returned no usable base64 data.');
  excelPath = path.join(evidenceDir, 'windows-acceptance-report.xlsx');
  fs.writeFileSync(excelPath, Buffer.from(reportBase64, 'base64'));
  const excelHeader = fs.readFileSync(excelPath).subarray(0, 2).toString('hex');
  assert(excelHeader === '504b', `Excel output is not an XLSX zip: ${excelHeader}`);
  const workbook = (xlsxModule.default || xlsxModule).read(fs.readFileSync(excelPath), { type: 'buffer' });
  assert(workbook.SheetNames.includes('تقرير المبيعات'), `Missing sales sheet: ${workbook.SheetNames.join(', ')}`);
  assert(workbook.SheetNames.includes('ملخص المحاسبة'), `Missing accounting sheet: ${workbook.SheetNames.join(', ')}`);
  assert(workbook.SheetNames.includes('قيمة المخزون'), `Missing inventory sheet: ${workbook.SheetNames.join(', ')}`);
  assert(workbook.SheetNames.includes('Customer Credit'), `Missing Customer Credit sheet: ${workbook.SheetNames.join(', ')}`);
  const customerCreditRows = (xlsxModule.default || xlsxModule).utils.sheet_to_json(workbook.Sheets['Customer Credit']);
  const customerCreditMetric = (row) => row.metric ?? row['البيان'];
  assert(customerCreditRows.some((row) => customerCreditMetric(row) === 'customer_credit_cash_refunds'), 'Customer Credit sheet is missing cash refunds metric.');
  assert(customerCreditRows.some((row) => customerCreditMetric(row) === 'customer_credit_non_cash_refunds'), 'Customer Credit sheet is missing non-cash refunds metric.');
  fs.writeFileSync(path.join(evidenceDir, 'excel-evidence.json'), JSON.stringify({ xlsxVersion, uiButtonClicked: true, sheetNames: workbook.SheetNames, bytes: fs.statSync(excelPath).size }, null, 2));
  pass('reports.open', 'opened reports with local order/accounting data');
  pass('reports.excel-export', `UI export invoked and XLSX verified with xlsx@${xlsxVersion} (${fs.statSync(excelPath).size} bytes)`);

  await openTab(pageRef, 'لوحة التحكم', 'لوحة التحكم');
  await pageRef.getByRole('button', { name: 'فتح النسخ الاحتياطي للاستيراد أو التصدير' }).click();
  await expect(pageRef.getByRole('dialog')).toBeVisible();
  await pageRef.getByRole('button', { name: 'تنزيل النسخة الاحتياطية الان (.json)', exact: true }).click();
  await waitForToast(pageRef, /تم تصدير النسخة الاحتياطية بنجاح/);
  const backupContent = await pageRef.evaluate(() => window.electronAPI.exportBackup());
  assert(typeof backupContent === 'string' && backupContent.length > 100, 'Backup export returned no usable JSON.');
  backupPath = path.join(evidenceDir, 'windows-acceptance-backup.json');
  fs.writeFileSync(backupPath, backupContent, 'utf8');
  const backupJson = JSON.parse(backupContent);
  assert(Array.isArray(backupJson.customers) && Array.isArray(backupJson.orders), 'Backup JSON does not contain core data arrays.');
  pass('backup.create', `backup saved as ${path.basename(backupPath)}`);
  await pageRef.getByRole('button', { name: 'إغلاق', exact: true }).click();
}

async function createTransientCustomerAndRestore(pageRef) {
  await openTab(pageRef, 'العملاء والمقاسات', 'إدارة العملاء والمقاسات');
  await pageRef.getByTestId('customers-add').click();
  await pageRef.getByTestId('customer-name').fill('عميل بعد النسخة');
  await pageRef.getByTestId('customer-phone').fill('0500000222');
  await pageRef.getByTestId('save-customer-measurements').click();
  await expect(pageRef.getByRole('row', { name: /عميل بعد النسخة/ })).toBeVisible({ timeout: 20_000 });
  await waitForData(pageRef, (data) => data.customers.some((item) => item.name === 'عميل بعد النسخة'), 'transient customer was not persisted before restore');

  await pageRef.getByRole('button', { name: 'فتح النسخ الاحتياطي للاستيراد أو التصدير' }).click();
  const fileInput = pageRef.getByTestId('backup-file-input');
  await fileInput.setInputFiles(backupPath);
  await expect(pageRef.getByText('تحذير هام قبل الاستبدال!', { exact: true })).toBeVisible();
  await pageRef.getByRole('button', { name: 'تأكيد واستبدال البيانات الآن', exact: true }).click();
  await waitForToast(pageRef, /تم استعادة النسخة الاحتياطية بنجاح/);
  await waitForData(pageRef, (data) => data.customers.some((item) => item.name === 'عميل Windows Acceptance') && !data.customers.some((item) => item.name === 'عميل بعد النسخة'), 'backup restore did not replace the transient customer');
  await expect(pageRef.getByText('عميل Windows Acceptance', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(pageRef.getByText('عميل بعد النسخة', { exact: true })).toHaveCount(0);
  pass('restore.isolated-database', 'restored backup into the isolated runner database and removed post-backup data');
}

async function verifyStorageAndPersistence(pageRef) {
  const storage = await pageRef.evaluate(() => window.electronAPI.automationStorageInfo?.());
  assert(storage?.isPackaged === true, 'Installed app did not report app.isPackaged=true.');
  const expectedAppData = process.env.APPDATA ? path.resolve(process.env.APPDATA) : '';
  const normalizedUserData = path.resolve(storage.userDataPath).toLowerCase();
  const normalizedAppData = expectedAppData.toLowerCase();
  assert(normalizedAppData && (normalizedUserData === normalizedAppData || normalizedUserData.startsWith(`${normalizedAppData}${path.sep}`)), `userData is outside Windows APPDATA: ${storage.userDataPath}`);
  const normalizedUserDataRoot = path.resolve(storage.userDataPath).toLowerCase();
  const normalizedDatabase = path.resolve(storage.databasePath).toLowerCase();
  assert(normalizedDatabase.startsWith(`${normalizedUserDataRoot}${path.sep}`), `Database path is outside userData: ${storage.databasePath}`);
  assert(!normalizedDatabase.includes('program files'), `Database path is inside Program Files: ${storage.databasePath}`);
  assert(!normalizedDatabase.startsWith(path.dirname(executablePath).toLowerCase()), `Database path is inside install directory: ${storage.databasePath}`);
  assert(fs.existsSync(storage.databasePath), `SQLite database does not exist: ${storage.databasePath}`);
  assert(fs.statSync(storage.databasePath).size > 0, 'SQLite database is empty.');
  fs.writeFileSync(path.join(evidenceDir, 'storage-info.json'), JSON.stringify({ ...storage, executablePath, testData }, null, 2));
  pass('sqlite.userData-path', `app.getPath(userData)=${storage.userDataPath}`);
  pass('sqlite.database-location', `SQLite database=${storage.databasePath}`);

  const data = await getDataSnapshot(pageRef);
  assert(data.customers.some((item) => item.name === 'عميل Windows Acceptance'), 'Customer did not persist after restore/reload flow.');
  assert(data.orders.some((item) => item.orderNumber === orderNumber), 'Order did not persist after restore/reload flow.');
  assert(data.invoices.length > 0, 'Invoice did not persist after restore/reload flow.');
  pass('data.persistence', 'customer, measurements, order, invoice, accounting, and stock data persisted');
}

async function testLegacyMigration() {
  await closeApp();
  const legacyRoot = path.join(testData, 'legacy-schema-v5');
  fs.rmSync(legacyRoot, { recursive: true, force: true });
  fs.mkdirSync(legacyRoot, { recursive: true });

  await launchApp({ dataDir: legacyRoot });
  await waitForDashboard(page);
  await page.waitForTimeout(500);
  const storage = await page.evaluate(() => window.electronAPI.automationStorageInfo());
  await closeApp();
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.mkdirSync(path.dirname(storage.databasePath), { recursive: true });
  fs.rmSync(storage.databasePath, { force: true });

  const legacyDb = new DatabaseSync(storage.databasePath);
  legacyDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO system_settings(key, value) VALUES ('schemaVersion', '5');
    INSERT INTO system_settings(key, value) VALUES ('fabricConsumptionRatePerGarment', '3.5');
    CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT, measurements_json TEXT, style_details_json TEXT);
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, thobe_type_name TEXT NOT NULL, fabric_name TEXT NOT NULL, fabric_color TEXT NOT NULL,
      garment_count INTEGER NOT NULL DEFAULT 1, order_date TEXT NOT NULL, delivery_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new', total_amount REAL NOT NULL DEFAULT 0, paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0, measurements_json TEXT NOT NULL, style_details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE invoices (
      id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL, order_date TEXT NOT NULL, total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0, remaining_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid', payments_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, date TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0, customer_phone TEXT, order_id TEXT
    );
    INSERT INTO customers(id, name, phone, created_at) VALUES ('LEGACY-CUST-1', 'Legacy Acceptance Customer', '0500000999', '2026-01-01');
    INSERT INTO orders(id, order_number, customer_id, customer_name, customer_phone, thobe_type_name, fabric_name, fabric_color, order_date, delivery_date, status, total_amount, paid_amount, remaining_amount, measurements_json, style_details_json, created_at)
      VALUES ('LEGACY-ORDER-1', 'LEGACY-0001', 'LEGACY-CUST-1', 'Legacy Acceptance Customer', '0500000999', 'ثوب', 'Legacy Fabric', 'كحلي', '2026-01-01', '2026-01-02', 'new', 100, 20, 80, '{}', '{}', '2026-01-01');
    INSERT INTO invoices(id, invoice_number, order_id, customer_name, customer_phone, order_date, total_amount, paid_amount, remaining_amount, payment_status, payments_json)
      VALUES ('LEGACY-INVOICE-1', 'LEGACY-INV-1', 'LEGACY-ORDER-1', 'Legacy Acceptance Customer', '0500000999', '2026-01-01', 100, 20, 80, 'partial', '[]');
    INSERT INTO notifications(id, type, title, message, date, read) VALUES ('LEGACY-NOTIFICATION-1', 'legacy', 'Legacy', 'Legacy notification', '2026-01-01', 0);
  `);
  const beforeCounts = {
    customers: Number(legacyDb.prepare('SELECT COUNT(*) AS count FROM customers').get().count),
    orders: Number(legacyDb.prepare('SELECT COUNT(*) AS count FROM orders').get().count),
    invoices: Number(legacyDb.prepare('SELECT COUNT(*) AS count FROM invoices').get().count),
    notifications: Number(legacyDb.prepare('SELECT COUNT(*) AS count FROM notifications').get().count)
  };
  legacyDb.close();

  await launchApp({ dataDir: legacyRoot });
  await waitForAppReady(page);
  const settings = await page.evaluate(() => window.electronAPI.getSettings());
  assert(Number(settings.schemaVersion) === 15, `Legacy fixture did not migrate to schemaVersion=15: ${settings.schemaVersion}`);
  await closeApp();

  const migratedDb = new DatabaseSync(storage.databasePath);
  const columns = (table) => migratedDb.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  const indexes = migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name);
  for (const column of ['customer_number', 'cash_received', 'overpayment_amount', 'cancellation_writeoff_amount']) {
    if (column === 'customer_number') {
      assert(columns('customers').includes(column), `Migration 015 missing customers.${column}`);
    } else {
      assert(columns('orders').includes(column), `Migration 010 missing orders.${column}`);
      assert(columns('invoices').includes(column), `Migration 010 missing invoices.${column}`);
    }
  }
  for (const column of ['operation_id', 'idempotency_key', 'source_entry_id', 'target_invoice_id', 'method', 'actor_id', 'reason', 'occurred_at', 'balance_after']) {
    assert(columns('customer_credits').includes(column), `Migration 011 missing customer_credits.${column}`);
  }
  for (const column of ['status', 'source', 'source_id', 'read_at', 'archived_at', 'retry_count', 'last_error', 'retry_history_json', 'created_at', 'updated_at']) {
    assert(columns('notifications').includes(column), `Migration 014 missing notifications.${column}`);
  }
  for (const indexName of ['idx_customers_customer_number', 'idx_invoices_visible_invoice_number', 'idx_customer_credits_idempotency', 'idx_customer_credits_operation_entry', 'idx_customer_credits_source_entry', 'idx_notifications_source_source_id', 'idx_notifications_active_created']) {
    assert(indexes.includes(indexName), `Expected migration index is missing: ${indexName}`);
  }
  const afterCounts = {
    customers: Number(migratedDb.prepare('SELECT COUNT(*) AS count FROM customers').get().count),
    orders: Number(migratedDb.prepare('SELECT COUNT(*) AS count FROM orders').get().count),
    invoices: Number(migratedDb.prepare('SELECT COUNT(*) AS count FROM invoices').get().count),
    notifications: Number(migratedDb.prepare('SELECT COUNT(*) AS count FROM notifications').get().count)
  };
  assert(JSON.stringify(beforeCounts) === JSON.stringify(afterCounts), `Legacy row counts changed during migration: before=${JSON.stringify(beforeCounts)} after=${JSON.stringify(afterCounts)}`);
  const legacyCreditRows = Number(migratedDb.prepare('SELECT COUNT(*) AS count FROM customer_credits').get().count);
  assert(legacyCreditRows === 0, 'Legacy migration unexpectedly backfilled customer_credits rows.');
  assert(columns('invoices').includes('visible_invoice_number'), 'Migration 015 missing invoices.visible_invoice_number');
  const verifiedColumns = { customers: columns('customers'), orders: columns('orders'), invoices: columns('invoices'), customer_credits: columns('customer_credits'), notifications: columns('notifications') };
  migratedDb.close();
  fs.writeFileSync(path.join(evidenceDir, 'legacy-migration-evidence.json'), JSON.stringify({ storage, beforeCounts, afterCounts, schemaVersion: settings.schemaVersion, verifiedColumns, verifiedIndexes: indexes }, null, 2));
  pass('legacy.schema-v5-migration', 'schemaVersion=5 fixture upgraded to 15 with additive columns/indexes, unchanged rows, visible numbering, and no credit backfill');
}

async function testNotificationsLifecycle(pageRef) {
  const failedNotifications = await pageRef.evaluate(() => window.electronAPI.notifications.list(true));
  const failedNotification = failedNotifications.find((item) => item.status === 'failed' && item.source === 'whatsapp');
  assert(failedNotification, 'Forced WhatsApp failure did not create a failed notification.');
  assert(Number(failedNotification.retryCount) === 0, 'New failed notification must start with retryCount=0.');
  let retryCount = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const retry = await pageRef.evaluate((id) => window.electronAPI.notifications.retry(id), failedNotification.id);
    retryCount = Number(retry.retryCount);
    assert(retry.status === 'retry', `Notification retry ${attempt + 1} did not enter retry status.`);
  }
  let retryCapRejected = false;
  try {
    await pageRef.evaluate((id) => window.electronAPI.notifications.retry(id), failedNotification.id);
  } catch (error) {
    retryCapRejected = /تجاوز|maximum|retry/i.test(String(error));
  }
  assert(retryCapRejected, 'Fourth notification retry was not rejected by the retry cap.');
  const marked = await pageRef.evaluate(() => window.electronAPI.notifications.markAllRead());
  assert(Number(marked.updated) >= 1, 'markAllRead did not update the failed WhatsApp notification.');
  const archived = await pageRef.evaluate(() => window.electronAPI.notifications.clearAll());
  assert(Number(archived.archived) >= 1, 'clearAll did not archive notifications.');
  const archivedNotifications = await pageRef.evaluate(() => window.electronAPI.notifications.list(true));
  const archivedNotification = archivedNotifications.find((item) => item.id === failedNotification.id);
  assert(archivedNotification?.archivedAt, 'Archived notification was not retained with archivedAt.');
  const activeNotifications = await pageRef.evaluate(() => window.electronAPI.notifications.list(false));
  assert(!activeNotifications.some((item) => item.id === failedNotification.id), 'Archived notification remained in active list.');
  fs.writeFileSync(path.join(evidenceDir, 'notifications-lifecycle.json'), JSON.stringify({ failedNotification, retryCount, archivedNotification, activeCount: activeNotifications.length }, null, 2));
  return 'failed, retry cap, read, and archive lifecycle verified without deletion';
}

async function offlineAcceptance() {
  const before = await waitForReachability('https://example.com');
  enableOfflineNetwork();
  const after = await waitForReachability('https://example.com');
  assert(after.reachable === false, `Outbound network remained reachable after firewall block: ${JSON.stringify(after)}`);
  fs.writeFileSync(path.join(evidenceDir, 'network-evidence.json'), JSON.stringify({ before, after, offlineAdapters }, null, 2));
  pass('offline.network-cut', `network before=${before.reachable} after=${after.reachable}`);

  await launchApp({ forceWhatsAppFailure: true });
  await waitForAppReady(page);
    const fontEvidence = await page.evaluate(async () => {
    const root = document.querySelector('#root');
    const localFontRule = Array.from(document.styleSheets).flatMap((sheet) => {
      try { return Array.from(sheet.cssRules); } catch { return []; }
    }).some((rule) => /Tajawal-\d+\.ttf/.test(rule.cssText) && /\/fonts\//.test(rule.cssText));
    const fontFiles = ['Tajawal-300.ttf', 'Tajawal-400.ttf', 'Tajawal-500.ttf', 'Tajawal-700.ttf', 'Tajawal-800.ttf', 'Tajawal-900.ttf'];
    const validSignatures = new Set(['00010000', '4f54544f', '74746366', '74727565']);
    const localFiles = await Promise.all(fontFiles.map(async (fileName) => {
      try {
        const url = new URL(`./fonts/${fileName}`, document.baseURI);
        const response = await fetch(url.href);
        const buffer = await response.arrayBuffer();
        const header = Array.from(new Uint8Array(buffer.slice(0, 4)))
          .map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return { fileName, url: url.href, responseOk: response.ok || response.status === 0, bytes: buffer.byteLength, header, validTtf: validSignatures.has(header) };
      } catch (error) {
        return { fileName, error: String(error), responseOk: false, bytes: 0, header: '', validTtf: false };
      }
    }));
    return {
      rootFontFamily: root ? getComputedStyle(root).fontFamily : '',
      localFontRule,
      localFiles,
      localFontsValid: localFiles.every((file) => file.responseOk && file.bytes > 10_000 && file.validTtf),
      fontStatus: document.fonts.status
    };
  });
  fs.writeFileSync(path.join(evidenceDir, 'font-evidence.json'), JSON.stringify(fontEvidence, null, 2));
  assert(fontEvidence.localFontsValid && fontEvidence.localFontRule && /Tajawal/i.test(fontEvidence.rootFontFamily), `Local Tajawal TTF files were not confirmed: ${JSON.stringify(fontEvidence)}`);
  pass('offline.tajawal', `Tajawal loaded offline with family ${fontEvidence.rootFontFamily}`);

  const offlineData = await getDataSnapshot(page);
  assert(offlineData.customers.length > 0 && offlineData.orders.length > 0 && offlineData.invoices.length > 0, 'Core offline data could not be loaded.');
  assert(offlineData.fabrics.length > 0 && offlineData.purchases.length > 0 && offlineData.expenses.length > 0 && offlineData.cashTransactions.length > 0, `Accounting/inventory offline data could not be loaded: ${JSON.stringify({ fabrics: offlineData.fabrics?.length, purchases: offlineData.purchases?.length, expenses: offlineData.expenses?.length, cashTransactions: offlineData.cashTransactions?.length })}`);

  await openTab(page, 'العملاء والمقاسات', 'إدارة العملاء والمقاسات');
  await expect(page.getByText('عميل Windows Acceptance', { exact: true }).first()).toBeVisible();
  await openTab(page, 'إدارة الطلبات', 'إدارة طلبات الخياطة');
  await expect(page.getByText('عميل Windows Acceptance', { exact: true }).first()).toBeVisible();
  await openTab(page, 'الفواتير والحسابات', 'الفواتير والحسابات المالية');
  await expect(page.getByText('عميل Windows Acceptance', { exact: true }).first()).toBeVisible();
  await openTab(page, 'المخزون والأصناف', 'المخزون والأصناف');
  await expect(page.getByText('قماش Windows Acceptance', { exact: true }).first()).toBeVisible();
  await openTab(page, 'المحاسبة والمشتريات', 'المحاسبة والتدفقات المالية');
  await expect(page.getByText('مورد Windows Acceptance', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'المصروفات', exact: true }).click();
  await expect(page.getByText('مصروف Windows Acceptance', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'الصندوق', exact: true }).click();
  await expect(page.getByText('CASH-WIN-001', { exact: true }).first()).toBeVisible();
  await openTab(page, 'التقارير والإحصائيات', 'التقارير والإحصائيات المالية');
  await expect(page.getByRole('main').getByText('إجمالي الطلبات', { exact: true })).toBeVisible();
  pass('offline.local-modules', 'customers, measurements, orders, invoices, inventory, accounting, and reports loaded offline');

  await openTab(page, 'إدارة الطلبات', 'إدارة طلبات الخياطة');
  const orderRow = page.getByRole('row').filter({ hasText: String(orderNumber) }).last();
  const actionsMenu = orderRow.locator('details.sahwa-actions-menu');
  await actionsMenu.locator('summary').click();
  const whatsappButton = actionsMenu.getByRole('button', { name: `إرسال رسالة واتساب للطلب ${orderNumber}`, exact: true });
  await expect(whatsappButton).toBeVisible();
  await whatsappButton.click();
  await waitForToast(page, /تعذر فتح واتساب/, 'danger');
  assert(!page.isClosed(), 'Application crashed after WhatsApp failure.');
  pass('offline.whatsapp-failure', 'failure toast shown without application crash');

  await runScenario('notifications.lifecycle', () => testNotificationsLifecycle(page));

  const expectedAcceptanceErrorPatterns = [/تم تجاوز الحد الأقصى لمحاولات إعادة الإرسال/];
  const isExpectedAcceptanceError = (line) => expectedAcceptanceErrorPatterns.some((pattern) => pattern.test(line));
  const expectedOutput = childProcessOutput.filter((line) => isExpectedAcceptanceError(line));
  const fatalOutput = childProcessOutput.filter((line) => /renderer:|pageerror|Unhandled|FATAL|IPC|uncaughtException|unhandledRejection/i.test(line) && !isExpectedAcceptanceError(line));
  if (runtimeErrors.length > 0 || fatalOutput.length > 0) {
    throw new Error(`Runtime errors captured: ${[...runtimeErrors, ...fatalOutput].join(' | ')}`);
  }
  fs.writeFileSync(path.join(evidenceDir, 'runtime-errors.log'), [...runtimeErrors, ...fatalOutput].join(''));
  fs.writeFileSync(path.join(evidenceDir, 'expected-acceptance-errors.log'), expectedOutput.join(''));
  pass('runtime.error-monitoring', `no unexpected renderer/pageerror/Unhandled/FATAL/IPC errors; expected rejection events=${expectedOutput.length}`);
}

try {
  await launchApp();
  await waitForDashboard(page);
  await runScenario('packaging.identity-icon-shortcut', verifyInstalledIdentityAndIcon);
  await createFabric(page).then(async (fabric) => {
    const order = await createCustomerAndOrder(page, fabric);
    await verifyInvoiceAndPayment(page, order);
    await testAccountingAndStock(page, fabric);
    await exportExcelAndBackup(page);
    await createTransientCustomerAndRestore(page);
    await closeApp();
    await launchApp();
    await waitForAppReady(page);
    await verifyStorageAndPersistence(page);
    await runScenario('customer-credit.lifecycle', () => verifyCustomerCreditAndRefund(page, order));
    await runScenario('reports.csv-and-accounting-separation', () => verifyCsvAndReportingViews(page));
    await closeApp();
    await runScenario('legacy.schema-v5-migration', testLegacyMigration);
    await offlineAcceptance();
  });

  fs.writeFileSync(path.join(evidenceDir, 'acceptance-results.json'), JSON.stringify({
    version: acceptanceVersion,
    commit: acceptanceCommit,
    executablePath,
    testData,
    results,
    runtimeErrors,
    childProcessOutput
  }, null, 2));
  const failedScenarios = results.filter((item) => item.status === 'FAIL');
  const notTestableScenarios = results.filter((item) => item.status === 'NOT_TESTABLE');
  if (failedScenarios.length > 0) {
    throw new Error(`Acceptance scenarios failed: ${failedScenarios.map((item) => item.id).join(', ')}`);
  }
  console.log(notTestableScenarios.length > 0 ? 'WINDOWS_ACCEPTANCE=PARTIAL' : 'WINDOWS_ACCEPTANCE=PASS');
} catch (error) {
  fs.writeFileSync(path.join(evidenceDir, 'acceptance-results.json'), JSON.stringify({
    version: acceptanceVersion,
    commit: acceptanceCommit,
    executablePath,
    testData,
    results,
    failure: error instanceof Error ? error.stack : String(error),
    runtimeErrors,
    childProcessOutput
  }, null, 2));
  console.error('WINDOWS_ACCEPTANCE=FAIL', error);
  process.exitCode = 1;
} finally {
  await closeApp();
  try { disableOfflineNetwork(); } catch (error) { console.error('Failed to restore network:', error); process.exitCode = 1; }
}
