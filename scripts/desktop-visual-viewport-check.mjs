import fs from 'node:fs';
import path from 'node:path';

const port = process.env.CDP_PORT || '9333';
const outputDir = process.env.DESKTOP_VISUAL_OUTPUT_DIR || path.join(process.cwd(), 'test-results', 'desktop-visual-viewport');
const visualStates = (process.env.DESKTOP_VISUAL_STATES || 'populated,loading,error')
  .split(',')
  .map((state) => state.trim())
  .filter(Boolean);
const viewportCases = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1440x1000', width: 1440, height: 1000 },
  { name: '1920x1080', width: 1920, height: 1080 }
];

fs.mkdirSync(outputDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && item.url !== 'about:blank');
      if (target?.webSocketDebuggerUrl) return target;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`لم يتم العثور على نافذة Electron عبر CDP على المنفذ ${port}: ${lastError?.message || 'انتهت المهلة'}`);
}

function createConnection(url) {
  const socket = new WebSocket(url);
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
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const command = async (method, params = {}) => {
    await ready;
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`انتهت مهلة CDP: ${method}`));
      }, 15_000);
    });
  };
  return { socket, command };
}

const target = await waitForTarget();
const browserInfo = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const pageConnection = createConnection(target.webSocketDebuggerUrl);
const browserConnection = createConnection(browserInfo.webSocketDebuggerUrl);
const command = pageConnection.command;
const browserCommand = browserConnection.command;

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.error || response.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(response.error || response.exceptionDetails)}`);
  const remoteResult = response.result?.result;
  if (!remoteResult || remoteResult.type === 'undefined' || !Object.prototype.hasOwnProperty.call(remoteResult, 'value')) {
    throw new Error(`Runtime.evaluate returned no value: ${JSON.stringify({ response, remoteResult })}`);
  }
  return remoteResult.value;
}

async function waitForRoot({ requireContent = true, timeout = 30_000 } = {}) {
  const deadline = Date.now() + timeout;
  let lastState;
  while (Date.now() < deadline) {
    lastState = await evaluate(`(() => {
      const root = document.getElementById('root');
      return {
        exists: Boolean(root),
        hasContent: Boolean(root?.textContent?.trim()),
        visible: Boolean(root && root.getBoundingClientRect().width > 0 && root.getBoundingClientRect().height > 0)
      };
    })()`);
    if (lastState?.exists && lastState.visible && (!requireContent || lastState.hasContent)) return lastState;
    await sleep(300);
  }
  throw new Error(`لم تجهز واجهة Electron: ${JSON.stringify(lastState)}`);
}

async function clickButtonByText(text) {
  return evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((element) => element.innerText.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function clickTestId(testId) {
  return evaluate(`(() => {
    const element = document.querySelector('[data-testid="${testId}"]');
    if (!element) return false;
    element.click();
    return true;
  })()`);
}

async function waitForText(text, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
    if (found) return true;
    await sleep(250);
  }
  return false;
}

async function waitForTestId(testId, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await evaluate(`Boolean(document.querySelector('[data-testid="${testId}"]'))`);
    if (found) return true;
    await sleep(100);
  }
  return false;
}

async function resetApp() {
  await command('Page.reload', { ignoreCache: true });
  await waitForRoot();
  await sleep(500);
}

async function preparePopulatedFixture() {
  await waitForRoot();
  return evaluate(`(async () => {
    const api = window.electronAPI;
    if (!api?.getData || !api?.createOrder) return { available: false, created: false, reason: 'Electron bridge fixture methods unavailable' };
    try {
      const originalData = await api.getData();
      window.__SAHWA_VISUAL_ORIGINAL_DATA__ = originalData;
      let data = originalData;
      let customer = data.customers?.find((item) => item.id === 'VISUAL-CUSTOMER-POLISH' || item.phone === '0501234567');
    let customerCreated = false;
    if (!customer) {
      if (!api.createCustomer) return { available: false, created: false, reason: 'Customer fixture API unavailable' };
      customer = await api.createCustomer({
        id: 'VISUAL-CUSTOMER-POLISH',
        name: 'عميل واجهة اختبار طويل الاسم',
        phone: '0501234567',
        createdAt: '2026-08-01T09:00:00.000Z',
        measurements: data.customers?.[0]?.measurements,
        styleDetails: data.customers?.[0]?.styleDetails,
        measurementHistory: []
      });
      customerCreated = true;
    }
    let fabric = data.fabrics?.find((item) => item.id === 'VISUAL-FABRIC-LOW');
    let accessory = data.accessories?.find((item) => item.id === 'VISUAL-ACCESSORY-OUT');
    let catalogCreated = false;
    if (!fabric && api.createFabric) {
      fabric = await api.createFabric({ id: 'VISUAL-FABRIC-LOW', name: 'قماش اختبار الواجهة الطويل', color: 'كحلي داكن', colorHex: '#1e293b', purchasePrice: 42, sellingPrice: 125, quantityMeters: 4, minStockMeters: 8 });
      catalogCreated = true;
    }
    if (!accessory && api.createAccessory) {
      accessory = await api.createAccessory({ id: 'VISUAL-ACCESSORY-OUT', name: 'زر اختبار نفد المخزون', category: 'أزرار', quantity: 0, minStock: 3, unit: 'حبة', purchasePrice: 2.5, sellingPrice: 5 });
      catalogCreated = true;
    }
    if (!fabric || !accessory) return { available: false, created: false, reason: 'Catalog fixture APIs unavailable' };
    const fixtureId = 'VISUAL-ORDER-P1-7';
    const cancelledFixtureId = 'VISUAL-ORDER-P1-8-CANCELLED';
    if (api.createPurchase && !data.purchases?.some((item) => item.id === 'VISUAL-PURCHASE-POLISH')) {
      await api.createPurchase({
        id: 'VISUAL-PURCHASE-POLISH',
        supplier: 'مورد اختبار الواجهة',
        invoiceNumber: 'VISUAL-PUR-01',
        purchaseDate: '2026-08-06',
        paymentMethod: 'card',
        notes: 'سجل شراء معزول للفحص البصري',
        lines: [{ itemType: 'fabric', itemId: fabric.id, itemName: fabric.name, quantity: 50, unit: 'متر', unitPrice: 42 }]
      });
    }
    data = await api.getData();
    const existing = data.orders?.find((order) => order.id === fixtureId);
    if (!existing) {
      await api.createOrder({
        id: fixtureId,
        orderNumber: 'VISUAL-1001',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        thobeTypeId: data.thobeTypes?.[0]?.id || 'THB-01',
        thobeTypeName: data.thobeTypes?.[0]?.name || 'ثوب سعودي كلاسيك',
        fabricId: fabric.id,
        fabricName: fabric.name,
        fabricColor: fabric.color,
        garmentCount: 1,
        totalAmount: 300,
        paidAmount: 150,
        initialPaymentMethod: 'cash',
        orderDate: '2026-08-03',
        deliveryDate: '2026-08-29',
        measurements: customer.measurements || {},
        styleDetails: customer.styleDetails || {},
        materialUsages: []
      });
    }
    const existingCancelled = data.orders?.find((order) => order.id === cancelledFixtureId);
    if (!existingCancelled) {
      await api.createOrder({
        id: cancelledFixtureId,
        orderNumber: 'VISUAL-1002',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        thobeTypeId: data.thobeTypes?.[0]?.id || 'THB-01',
        thobeTypeName: data.thobeTypes?.[0]?.name || 'ثوب سعودي كلاسيك',
        fabricId: fabric.id,
        fabricName: fabric.name,
        fabricColor: fabric.color,
        garmentCount: 1,
        totalAmount: 420,
        paidAmount: 0,
        initialPaymentMethod: 'transfer',
        orderDate: '2026-08-05',
        deliveryDate: '2026-08-20',
        measurements: customer.measurements || {},
        styleDetails: customer.styleDetails || {},
        materialUsages: []
      });
    }
    data = await api.getData();
    const purchaseCreated = Boolean(api.createPurchase && !data.purchases?.some((item) => item.id === 'VISUAL-PURCHASE-POLISH'));
    if (purchaseCreated) {
      await api.createPurchase({
        id: 'VISUAL-PURCHASE-POLISH',
        supplier: 'مورد اختبار الواجهة',
        invoiceNumber: 'VISUAL-PUR-01',
        purchaseDate: '2026-08-06',
        paymentMethod: 'card',
        notes: 'سجل شراء معزول للفحص البصري',
        lines: [{ itemType: 'fabric', itemId: fabric.id, itemName: fabric.name, quantity: 6, unit: 'متر', unitPrice: 42 }]
      });
    }
    data = await api.getData();
    const expenseCreated = Boolean(api.createExpense && !data.expenses?.some((item) => item.id === 'VISUAL-EXPENSE-POLISH'));
    if (expenseCreated) {
      await api.createExpense({ id: 'VISUAL-EXPENSE-POLISH', category: 'تشغيل', amount: 175, expenseDate: '2026-08-07', paymentMethod: 'cash', description: 'مصروف اختبار الواجهة', notes: 'سجل معزول للفحص البصري' });
    }
    const cancelledOrder = data.orders?.find((order) => order.id === cancelledFixtureId);
    if (cancelledOrder?.status !== 'cancelled') {
      await api.updateOrderStatus({ orderId: cancelledFixtureId, status: 'cancelled' });
    }
      return { available: true, created: !existing || customerCreated || catalogCreated, orderId: fixtureId, cancelledOrderId: cancelledFixtureId, cancelledOrderCreated: !existingCancelled, customerCreated, catalogCreated, purchaseCreated, expenseCreated };
    } catch (error) {
      return { available: false, created: false, reason: error?.message || String(error) };
    }
  })()`);
}

async function prepareLongPrintFixture(fixture) {
  return evaluate(`(async () => {
    const api = window.electronAPI;
    const data = await api.getData();
    const order = data.orders?.find((item) => item.id === ${JSON.stringify(fixture.orderId)});
    if (!order || !api.updateOrder) return false;
    const longNotes = 'ملاحظة اختبار طباعة طويلة للتأكد من التفاف النص وعدم قصه داخل الفاتورة.\\nيرجى مراجعة تفاصيل القماش والقياسات قبل التسليم، مع المحافظة على جميع التعليمات الفنية في صفحة الطباعة.\\nسطر إضافي لاختبار المحتوى متعدد الأسطر والأرقام الكبيرة 987654.32 ر.س.';
    await api.updateOrder({ ...order, totalAmount: 987654.32, notes: longNotes, styleDetails: { ...(order.styleDetails || {}), tailorNotes: longNotes } });
    return true;
  })()`);
}

async function restoreVisualFixture() {
  return evaluate(`(async () => {
    const backup = window.__SAHWA_VISUAL_ORIGINAL_DATA__;
    if (!backup) return false;
    await window.electronAPI.saveData(backup);
    delete window.__SAHWA_VISUAL_ORIGINAL_DATA__;
    return true;
  })()`);
}

async function setViewport(viewport, resizeMode, windowId) {
  if (resizeMode === 'native-window') {
    await browserCommand('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal', width: viewport.width, height: viewport.height }
    });
  } else {
    await command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height
    });
  }
  await sleep(650);
}

async function snapshot(state, viewport, fixture) {
  const serialized = await evaluate(`JSON.stringify((() => {
    const root = document.getElementById('root');
    const bodyText = document.body.innerText;
    const fixture = ${JSON.stringify(fixture)};
    const emptyStates = Array.from(document.querySelectorAll('.sahwa-empty-state')).map((element) => ({
      compact: element.classList.contains('sahwa-empty-state--compact'),
      title: element.querySelector('.sahwa-empty-state-title')?.textContent?.trim() || ''
    }));
    const alerts = Array.from(document.querySelectorAll('[role="alert"], .sahwa-field-error')).map((element) => element.textContent?.trim() || '').filter(Boolean);
    const hasLoadingSignal = bodyText.includes('جاري تحميل نظام صهوة للخياطة') || bodyText.includes('جاري تحميل الصفحة') || document.querySelector('svg.animate-spin') !== null;
    const hasErrorSignal = alerts.length > 0 || bodyText.includes('يرجى مراجعة الحقول المحددة قبل الحفظ') || bodyText.includes('يرجى إدخال اسم العميل بشكل صحيح');
    const tableRows = Array.from(document.querySelectorAll('tbody tr')).filter((row) => row.querySelectorAll('td').length > 0).length;
    return {
      state: ${JSON.stringify(state)},
      expected: ${JSON.stringify(viewport)},
      outer: { width: window.outerWidth, height: window.outerHeight },
      inner: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      title: document.title,
      hasRoot: Boolean(root),
      visible: Boolean(root && root.getBoundingClientRect().width > 0 && root.getBoundingClientRect().height > 0),
      hasReportHeading: bodyText.includes('التقارير والإحصائيات المالية'),
      hasCustomerHeading: bodyText.includes('إدارة العملاء والمقاسات'),
      hasLoadingSignal,
      hasErrorSignal,
      alerts,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      hasPrintPreview: Boolean(document.querySelector('.invoice-screen-preview')),
      cardCount: document.querySelectorAll('.sahwa-card, .ui-card').length,
      tableCount: document.querySelectorAll('table').length,
      tableRows,
      emptyStates,
      fixture,
      bodyText: bodyText.slice(0, 1600)
    };
  })())`);
  if (typeof serialized !== 'string') throw new Error(`تعذر تسلسل snapshot للحالة ${state} والحجم ${viewport.name}`);
  return JSON.parse(serialized);
}

function statePassed(state, snapshotResult) {
  const base = snapshotResult.hasRoot && snapshotResult.visible && !snapshotResult.horizontalOverflow;
  if (state === 'populated') return base && snapshotResult.hasReportHeading && snapshotResult.tableCount > 0 && snapshotResult.tableRows > 0;
  if (state === 'loading') return base && snapshotResult.hasLoadingSignal;
  if (state === 'error') return base && snapshotResult.hasCustomerHeading && snapshotResult.hasErrorSignal;
  if (state === 'print') return base && snapshotResult.hasPrintPreview && snapshotResult.bodyText.includes('ملاحظة اختبار طباعة طويلة');
  return false;
}

async function captureScreenshotPng() {
  const capture = async () => command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  let response = await capture();
  if (!response.result?.data) {
    await sleep(300);
    response = await capture();
  }
  if (!response.result?.data) {
    throw new Error(`لم تُرجع CDP صورة PNG صالحة: ${JSON.stringify(response)}`);
  }
  return Buffer.from(response.result.data, 'base64');
}

async function captureState(state, viewport, resizeMode, windowId, fixture) {
  await setViewport(viewport, resizeMode, windowId);
  if (state === 'loading') {
    await command('Page.reload', { ignoreCache: true });
    const deadline = Date.now() + 5_000;
    let loadingDetected = false;
    while (Date.now() < deadline) {
      const signal = await evaluate(`(() => {
        const bodyText = document.body?.innerText || '';
        return bodyText.includes('جاري تحميل نظام صهوة للخياطة') || bodyText.includes('جاري تحميل الصفحة') || document.querySelector('svg.animate-spin') !== null;
      })()`);
      if (signal) { loadingDetected = true; break; }
      await sleep(25);
    }
    if (!loadingDetected) throw new Error(`تعذر التقاط إشارة loading الحقيقية قبل اكتمال إعادة التحميل للحجم ${viewport.name}`);
  } else if (state === 'populated') {
    const clicked = await clickButtonByText('التقارير والإحصائيات');
    if (!clicked || !(await waitForText('التقارير والإحصائيات المالية'))) throw new Error('تعذر فتح شاشة التقارير في populated state');
  } else if (state === 'error') {
    const clicked = await clickButtonByText('العملاء والمقاسات');
    if (!clicked || !(await waitForText('إدارة العملاء والمقاسات'))) throw new Error('تعذر فتح شاشة العملاء في error state');
    if (!await waitForTestId('customers-add')) throw new Error('تعذر تحميل زر إضافة العميل في error state');
    if (!await clickTestId('customers-add')) throw new Error('تعذر فتح نموذج إضافة العميل في error state');
    if (!await waitForTestId('save-customer-measurements')) throw new Error('تعذر تحميل زر حفظ نموذج العميل في error state');
    if (!await clickTestId('save-customer-measurements')) throw new Error('تعذر تشغيل validation error في نموذج العميل');
    await sleep(350);
  } else if (state === 'print') {
    const clicked = await clickButtonByText('الفواتير والحسابات');
    if (!clicked || !(await waitForText('الفواتير والحسابات المالية'))) throw new Error('تعذر فتح شاشة الفواتير في print state');
    const previewClicked = await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((element) => element.innerText.trim() === 'معاينة');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!previewClicked || !(await waitForTestId('invoice-preview-root', 10_000))) {
      await waitForText('معاينة الفاتورة', 10_000);
    }
    await waitForText('ملاحظة اختبار طباعة طويلة', 10_000);
    await sleep(350);
  }

  const snapshotResult = await snapshot(state, viewport, fixture);
  if (!snapshotResult) throw new Error(`لم تُرجع Runtime.evaluate snapshot للحالة ${state} والحجم ${viewport.name}`);
  const screenshot = await captureScreenshotPng();
  const prefix = `${state}-${viewport.name}`;
  fs.writeFileSync(path.join(outputDir, `${prefix}.png`), screenshot);
  fs.writeFileSync(path.join(outputDir, `${prefix}.json`), JSON.stringify(snapshotResult, null, 2));
  let pdf;
  if (state === 'print') {
    const pdfData = await evaluate(`window.electronAPI.automationPrintToPDF({ printBackground: true, preferCSSPageSize: true })`);
    if (typeof pdfData !== 'string' || pdfData.length < 100) throw new Error(`لم تُرجع Electron ملف PDF صالحًا للحجم ${viewport.name}`);
    pdf = `${prefix}.pdf`;
    fs.writeFileSync(path.join(outputDir, pdf), Buffer.from(pdfData, 'base64'));
  }

  const passed = statePassed(state, snapshotResult);
  const result = {
    state,
    name: viewport.name,
    expected: viewport,
    actual: snapshotResult.inner,
    outer: snapshotResult.outer,
    mode: resizeMode,
    passed,
    horizontalOverflow: snapshotResult.horizontalOverflow,
    cardCount: snapshotResult.cardCount,
    tableCount: snapshotResult.tableCount,
    tableRows: snapshotResult.tableRows,
    hasLoadingSignal: snapshotResult.hasLoadingSignal,
    hasErrorSignal: snapshotResult.hasErrorSignal,
    emptyStates: snapshotResult.emptyStates,
    screenshot: `${prefix}.png`,
    ...(pdf ? { pdf } : {})
  };
  if (!passed) throw new Error(`فشل الفحص البصري لحالة ${state} وحجم ${viewport.name}: ${JSON.stringify(result)}`);
  return result;
}

await command('Runtime.enable');
await command('Page.enable');
await waitForRoot();

const fixture = await preparePopulatedFixture();
if (!fixture.available) {
  await restoreVisualFixture().catch(() => undefined);
  throw new Error(`تعذر تجهيز populated fixture: ${fixture.reason}`);
}
await resetApp();
if (visualStates.includes('print')) {
  const printPrepared = await prepareLongPrintFixture(fixture);
  if (!printPrepared) {
    await restoreVisualFixture().catch(() => undefined);
    throw new Error('تعذر تجهيز بيانات الطباعة الطويلة؛ يلزم توفر updateOrder في جسر Electron');
  }
  await resetApp();
}

let resizeMode = 'native-window';
let windowId;
try {
  const windowInfo = await browserCommand('Browser.getWindowForTarget', { targetId: target.id });
  if (windowInfo.error || !windowInfo.result?.windowId) throw new Error(windowInfo.error?.message || JSON.stringify(windowInfo));
  windowId = windowInfo.result.windowId;
} catch {
  resizeMode = 'emulated-viewport';
}

const results = [];
try {
  for (const state of visualStates) {
    if (!['populated', 'loading', 'error', 'print'].includes(state)) throw new Error(`حالة بصرية غير مدعومة: ${state}`);
    if (state === 'loading') {
      for (const viewport of viewportCases) {
        results.push(await captureState(state, viewport, resizeMode, windowId, fixture));
      }
      await resetApp();
    } else {
      for (const viewport of viewportCases) {
        results.push(await captureState(state, viewport, resizeMode, windowId, fixture));
        await resetApp();
      }
    }
  }
} finally {
  await restoreVisualFixture().catch(() => undefined);
}

if (resizeMode === 'emulated-viewport') await command('Emulation.clearDeviceMetricsOverride');

const summary = {
  generatedAt: new Date().toISOString(),
  target: { url: target.url, type: target.type },
  resizeMode,
  states: visualStates,
  fixture,
  cases: results,
  passed: results.every((result) => result.passed),
  count: {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length
  }
};
fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
pageConnection.socket.close();
browserConnection.socket.close();
console.log(JSON.stringify(summary, null, 2));
