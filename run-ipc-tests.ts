import fs from 'fs';
import path from 'path';
import { fork } from 'child_process';

// 1. Generate the test version of ipcHandlers.ts
const originalIpcPath = path.join(process.cwd(), 'src/electron/ipcHandlers.ts');
const testIpcPath = path.join(process.cwd(), 'src/electron/ipcHandlers.test.ts');

const originalContent = fs.readFileSync(originalIpcPath, 'utf8');

const modifiedContent = originalContent
  .replace(
    "import { ipcMain } from 'electron';",
    `export const mockIpcHandlers = new Map<string, Function>();\nconst ipcMain: any = {};`
  )
  .replace(
    "import { safeIpcHandle } from './errorHandler';",
    `function safeIpcHandle(ipcDummy: any, channel: string, handler: Function) {\n  mockIpcHandlers.set(channel, handler);\n}`
  );

fs.writeFileSync(testIpcPath, modifiedContent, 'utf8');
console.log('Generated src/electron/ipcHandlers.test.ts for testing.');

// 2. We will run the tests in an asynchronous self-executing function
async function runTests() {
  const results: any[] = [];

  try {
    // Import the test file we just generated, and database manager
    const { SahwaDatabaseManager } = await import('./src/electron/db');
    // @ts-ignore - dynamically generated during test execution
    const { registerIpcHandlers, mockIpcHandlers } = await import('./src/electron/ipcHandlers.test');

    // Setup temporary database directory
    const tempDbDir = path.join(process.cwd(), 'temp_test_db');
    if (fs.existsSync(tempDbDir)) {
      fs.rmSync(tempDbDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDbDir, { recursive: true });

    const dbManager = new SahwaDatabaseManager(tempDbDir);
    const initRes = dbManager.initDatabase();
    if (!initRes.success) {
      throw new Error('Failed to initialize test database: ' + initRes.error);
    }

    // Register handlers to fill mockIpcHandlers Map
    registerIpcHandlers(dbManager);

    const db = dbManager.getRawDb();

    // Helper to invoke registered handlers
    async function invokeIPC(channel: string, ...args: any[]) {
      const handler = mockIpcHandlers.get(channel);
      if (!handler) {
        throw new Error(`IPC handler for channel "${channel}" not registered.`);
      }
      // Simulate Electron IPC call where first arg is the event (dummy event)
      return await handler(null, ...args);
    }

    // Helper to get fabric quantity
    function getFabricQty(fabricId: string): number {
      const row = db.prepare('SELECT quantity_meters FROM fabrics WHERE id = ?').get(fabricId) as any;
      return row ? row.quantity_meters : 0;
    }

    // Helper to get system settings rate
    const settings = dbManager.getSettings();
    const consumptionRate = settings.fabricConsumptionRatePerGarment || 3.5;
    console.log(`Using Fabric Consumption Rate: ${consumptionRate} meters per garment`);

    // ==========================================
    // ١) الخصم الأساسي
    // ==========================================
    console.log('\n--- Scenario 1: Basic Deduction ---');
    // Seed a fabric with quantity = 100
    db.prepare(`
      INSERT INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FAB-S1', 'قماش تجريبي ١', 'أبيض', '#ffffff', 50, 100, 100, 10, new Date().toISOString());

    const qtyBeforeS1 = getFabricQty('FAB-S1');
    console.log(`Quantity BEFORE order: ${qtyBeforeS1}`);

    // Create order with garmentCount = 2
    const orderDataS1 = {
      id: 'ORD-S1',
      orderNumber: '10001',
      customerId: 'CUST-101',
      customerName: 'عبدالمجيد السلمان',
      customerPhone: '0501234567',
      fabricId: 'FAB-S1',
      fabricName: 'قماش تجريبي ١',
      fabricColor: 'أبيض',
      garmentCount: 2,
      totalAmount: 200,
      paidAmount: 50
    };

    const expectedDeductionS1 = 2 * consumptionRate;
    const expectedQtyS1 = 100 - expectedDeductionS1;

    let actualQtyS1 = 0;
    let s1Passed = false;
    let s1Error: any = null;

    try {
      await invokeIPC('orders:create', orderDataS1);
      actualQtyS1 = getFabricQty('FAB-S1');
      console.log(`Quantity AFTER order: ${actualQtyS1}`);
      s1Passed = Math.abs(actualQtyS1 - expectedQtyS1) < 0.001;
    } catch (err: any) {
      s1Error = err;
      console.error('Error in Scenario 1:', err);
    }

    results.push({
      id: 1,
      name: '١) الخصم الأساسي (Basic Deduction)',
      expected: `${expectedQtyS1} متر`,
      actual: s1Error ? `خطأ: ${s1Error.message}` : `${actualQtyS1} متر`,
      passed: s1Passed
    });

    // ==========================================
    // ٢) الإرجاع عند الحذف
    // ==========================================
    console.log('\n--- Scenario 2: Return on Delete ---');
    const qtyBeforeS2 = getFabricQty('FAB-S1');
    console.log(`Quantity BEFORE deleting order: ${qtyBeforeS2}`);

    let actualQtyS2 = 0;
    let s2Passed = false;
    let s2Error: any = null;

    try {
      await invokeIPC('orders:delete', 'ORD-S1');
      actualQtyS2 = getFabricQty('FAB-S1');
      console.log(`Quantity AFTER deleting order: ${actualQtyS2}`);
      s2Passed = Math.abs(actualQtyS2 - 100) < 0.001;
    } catch (err: any) {
      s2Error = err;
      console.error('Error in Scenario 2:', err);
    }

    results.push({
      id: 2,
      name: '٢) الإرجاع عند الحذف (Return on Delete)',
      expected: '100 متر',
      actual: s2Error ? `خطأ: ${s2Error.message}` : `${actualQtyS2} متر`,
      passed: s2Passed
    });

    // ==========================================
    // ٣) الإرجاع عند الإلغاء
    // ==========================================
    console.log('\n--- Scenario 3: Return on Cancel ---');
    const qtyBeforeS3 = getFabricQty('FAB-S1');
    console.log(`Quantity BEFORE new order: ${qtyBeforeS3}`);

    const orderDataS3 = {
      id: 'ORD-S3',
      orderNumber: '10002',
      customerId: 'CUST-101',
      customerName: 'عبدالمجيد السلمان',
      customerPhone: '0501234567',
      fabricId: 'FAB-S1',
      fabricName: 'قماش تجريبي ١',
      fabricColor: 'أبيض',
      garmentCount: 3,
      totalAmount: 300,
      paidAmount: 100
    };

    let actualQtyS3AfterCreate = 0;
    let actualQtyS3AfterCancel = 0;
    let s3Passed = false;
    let s3Error: any = null;

    try {
      await invokeIPC('orders:create', orderDataS3);
      actualQtyS3AfterCreate = getFabricQty('FAB-S1');
      console.log(`Quantity AFTER creating order (garments=3): ${actualQtyS3AfterCreate}`);

      await invokeIPC('orders:updateStatus', 'ORD-S3', 'cancelled');
      actualQtyS3AfterCancel = getFabricQty('FAB-S1');
      console.log(`Quantity AFTER cancelling order: ${actualQtyS3AfterCancel}`);

      s3Passed = Math.abs(actualQtyS3AfterCancel - 100) < 0.001;
    } catch (err: any) {
      s3Error = err;
      console.error('Error in Scenario 3:', err);
    }

    results.push({
      id: 3,
      name: '٣) الإرجاع عند الإلغاء (Return on Cancel)',
      expected: '100 متر',
      actual: s3Error ? `خطأ: ${s3Error.message}` : `${actualQtyS3AfterCancel} متر`,
      passed: s3Passed
    });

    // ==========================================
    // ٤) تبديل القماش داخل طلب قائم
    // ==========================================
    console.log('\n--- Scenario 4: Swap Fabric ---');
    // Seed Fabric A and B with quantity = 100
    db.prepare(`
      INSERT OR REPLACE INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FAB-A', 'قماش أ', 'أبيض', '#ffffff', 50, 100, 100, 10, new Date().toISOString());

    db.prepare(`
      INSERT OR REPLACE INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FAB-B', 'قماش ب', 'كريمي', '#fef3c7', 50, 100, 100, 10, new Date().toISOString());

    console.log(`Fabric A Before: ${getFabricQty('FAB-A')}, Fabric B Before: ${getFabricQty('FAB-B')}`);

    const orderDataS4 = {
      id: 'ORD-S4',
      orderNumber: '10004',
      customerId: 'CUST-101',
      customerName: 'عبدالمجيد السلمان',
      customerPhone: '0501234567',
      thobeTypeName: 'ثوب سعودي كلاسيك',
      fabricId: 'FAB-A',
      fabricName: 'قماش أ',
      fabricColor: 'أبيض',
      garmentCount: 2,
      totalAmount: 200,
      paidAmount: 50,
      isCustomMeasurement: false,
      measurements: {},
      styleDetails: {},
      notes: '',
      deliveryDate: new Date().toISOString().slice(0, 10),
      orderDate: new Date().toISOString().slice(0, 10),
      status: 'new'
    };

    let actualQtyS4_A = 0;
    let actualQtyS4_B = 0;
    let s4Passed = false;
    let s4Error: any = null;

    try {
      // 1. Create order with fabric A
      const createdOrder = await invokeIPC('orders:create', orderDataS4);
      console.log(`After Create - Fabric A: ${getFabricQty('FAB-A')}, Fabric B: ${getFabricQty('FAB-B')}`);

      // 2. Update same order to use fabric B
      const updatedOrder = {
        ...createdOrder,
        fabricId: 'FAB-B',
        fabricName: 'قماش ب',
        fabricColor: 'كريمي'
      };

      await invokeIPC('orders:update', updatedOrder);
      actualQtyS4_A = getFabricQty('FAB-A');
      actualQtyS4_B = getFabricQty('FAB-B');
      console.log(`After Update - Fabric A: ${actualQtyS4_A}, Fabric B: ${actualQtyS4_B}`);

      const expectedQtyS4_B = 100 - (2 * consumptionRate);
      s4Passed = Math.abs(actualQtyS4_A - 100) < 0.001 && Math.abs(actualQtyS4_B - expectedQtyS4_B) < 0.001;
    } catch (err: any) {
      s4Error = err;
      console.error('Error in Scenario 4:', err);
    }

    results.push({
      id: 4,
      name: '٤) تبديل القماش داخل طلب قائم (Swap Fabric)',
      expected: `A: 100 متر، B: ${100 - 2 * consumptionRate} متر`,
      actual: s4Error ? `خطأ: ${s4Error.message}` : `A: ${actualQtyS4_A} متر، B: ${actualQtyS4_B} متر`,
      passed: s4Passed
    });

    // ==========================================
    // ٥) منع الكمية السالبة
    // ==========================================
    console.log('\n--- Scenario 5: Prevent Negative Quantity ---');
    db.prepare(`
      INSERT OR REPLACE INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FAB-C', 'قماش ج', 'أسود', '#000000', 50, 100, 1, 10, new Date().toISOString());

    console.log(`Fabric C Before: ${getFabricQty('FAB-C')}`);

    const orderDataS5 = {
      id: 'ORD-S5',
      orderNumber: '10005',
      customerId: 'CUST-101',
      customerName: 'عبدالمجيد السلمان',
      customerPhone: '0501234567',
      fabricId: 'FAB-C',
      fabricName: 'قماش ج',
      fabricColor: 'أسود',
      garmentCount: 5, // needs 5 * 3.5 = 17.5 meters
      totalAmount: 500,
      paidAmount: 100
    };

    let actualQtyS5 = 0;
    let s5Passed = false;
    let s5Error: any = null;

    try {
      await invokeIPC('orders:create', orderDataS5);
      actualQtyS5 = getFabricQty('FAB-C');
    } catch (err: any) {
      s5Error = err;
      actualQtyS5 = getFabricQty('FAB-C');
      console.log(`Expected Error thrown: "${err.message}"`);
      console.log(`Fabric C quantity remains: ${actualQtyS5}`);
      s5Passed = actualQtyS5 === 1 && err.message.includes('غير كافية');
    }

    results.push({
      id: 5,
      name: '٥) منع الكمية السالبة (Prevent Negative Stock)',
      expected: 'يرفض العملية، ويبقى المخزون 1 متر كما هو',
      actual: s5Passed ? `رُفض بنجاح برسالة الخطأ: "${s5Error.message}" والمخزون ${actualQtyS5} متر` : `فشل: المخزون صار ${actualQtyS5}`,
      passed: s5Passed
    });

    // ==========================================
    // ٦) التزامن (transaction) عند فشل جزء من العملية
    // ==========================================
    console.log('\n--- Scenario 6: Transaction Rollback on Failure ---');
    db.prepare(`
      INSERT OR REPLACE INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FAB-S6', 'قماش تراجع', 'أبيض', '#ffffff', 50, 100, 100, 10, new Date().toISOString());

    console.log(`Fabric Rollback Before: ${getFabricQty('FAB-S6')}`);

    const orderDataS6 = {
      id: 'ORD-S6',
      orderNumber: '10006',
      customerId: null, // This is NOT NULL in database! Should trigger rollback.
      customerName: 'عبدالمجيد السلمان',
      customerPhone: '0501234567',
      fabricId: 'FAB-S6',
      fabricName: 'قماش تراجع',
      fabricColor: 'أبيض',
      garmentCount: 2,
      totalAmount: 200,
      paidAmount: 50
    };

    let actualQtyS6 = 0;
    let s6Passed = false;
    try {
      await invokeIPC('orders:create', orderDataS6);
    } catch (err: any) {
      actualQtyS6 = getFabricQty('FAB-S6');
      console.log(`Transaction failed with error: "${err.message}"`);
      console.log(`Fabric Rollback quantity AFTER rollback: ${actualQtyS6}`);

      // Verify no order record was partially written
      const orderCount = (db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE id = 'ORD-S6'").get() as any).cnt;
      console.log(`Orders matching ORD-S6 in database: ${orderCount}`);

      s6Passed = actualQtyS6 === 100 && orderCount === 0;
    }

    results.push({
      id: 6,
      name: '٦) التزامن (Transaction Rollback)',
      expected: 'يتراجع عن التغييرات، يبقى القماش 100، ولا يُحفظ الطلب',
      actual: s6Passed ? `نجح التراجع بالكامل والمخزون ${actualQtyS6} متر ولم يُحفظ أي سجل` : `فشل التراجع`,
      passed: s6Passed
    });

    // ==========================================
    // ٧) اختبار قسوة (إغلاق مفاجئ قبل Commit)
    // ==========================================
    console.log('\n--- Scenario 7: Stress/Crash Simulation ---');

    // Close the primary dbManager before starting crash simulation so there's no open lock on the file
    await dbManager.close();

    // To simulate a real crash mid-transaction, we fork a child process,
    // let it execute a transaction update, and SIGKILL it before commit!
    // Write the child process script to a temp file
    const childScriptPath = path.join(process.cwd(), 'temp_crash_child.js');
    const childScriptContent = `
const { SahwaDatabaseManager } = require('./src/electron/db');
const path = require('path');

async function runChild() {
  const dbManager = new SahwaDatabaseManager('${tempDbDir.replace(/\\/g, '\\\\')}');
  // Initialize with exact WAL / PRAGMAs
  dbManager.initDatabase();
  const db = dbManager.getRawDb();

  // Create a specific crash fabric
  db.prepare("INSERT OR REPLACE INTO fabrics (id, name, color, quantity_meters, min_stock_meters, created_at) VALUES ('FAB-CRASH', 'Crash Fabric', 'Blue', 100, 10, '2026-08-06')").run();

  console.log("READY");

  // Keep process open inside a transaction block updating fabric
  const tx = db.transaction(() => {
    db.prepare("UPDATE fabrics SET quantity_meters = 50 WHERE id = 'FAB-CRASH'").run();
    console.log("UPDATED");
    // infinite busy loop inside transaction to prevent commit
    while(true) {}
  });

  try {
    tx();
  } catch (err) {
    console.error("Tx Error:", err);
  }
}

runChild();
`;
    fs.writeFileSync(childScriptPath, childScriptContent, 'utf8');

    // Compile/run child using node (requires commonjs as written or standard requiring)
    // Wait, since db.ts is ES modules, let's make sure the child script can load ES modules or run them.
    // An even cleaner way to run the child script in tsx is to write it in TS and fork it with tsx!
    const childTsPath = path.join(process.cwd(), 'temp_crash_child.ts');
    const childTsContent = `
import { SahwaDatabaseManager } from './src/electron/db';
import path from 'path';

const dbManager = new SahwaDatabaseManager('${tempDbDir.replace(/\\/g, '\\\\')}');
dbManager.initDatabase();
const db = dbManager.getRawDb();

db.prepare("INSERT OR REPLACE INTO fabrics (id, name, color, quantity_meters, min_stock_meters, created_at) VALUES ('FAB-CRASH', 'Crash Fabric', 'Blue', 100, 10, '2026-08-06')").run();

console.log("READY");

const tx = db.transaction(() => {
  db.prepare("UPDATE fabrics SET quantity_meters = 50 WHERE id = 'FAB-CRASH'").run();
  console.log("UPDATED");
  while(true) {}
});

tx();
`;
    fs.writeFileSync(childTsPath, childTsContent, 'utf8');

    // Fork the child process with silent: true so we can read its stdout stream
    const child = fork(childTsPath, [], { silent: true, execArgv: ['--import', 'tsx'] });

    let s7Passed = false;
    let s7Message = '';

    await new Promise<void>((resolve) => {
      let isKilled = false;
      child.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        console.log(`[Child]: ${msg}`);
        if (msg.includes('UPDATED') && !isKilled) {
          isKilled = true;
          console.log('Child is in transaction block. Sending SIGKILL now!');
          child.kill('SIGKILL');
        }
      });

      child.on('exit', (_code, signal) => {
        console.log(`Child exited with signal: ${signal}`);
        resolve();
      });

      // Also listen to message channel if needed
      child.on('message', (m) => {
        console.log('[Child Message]', m);
      });
    });

    // Clean up child scripts
    try { fs.unlinkSync(childTsPath); } catch(e){}
    try { fs.unlinkSync(childScriptPath); } catch(e){}

    // Re-open database with a new Database Manager, verify integrity check and value
    console.log('Re-opening database to check integrity and rollback status...');
    const dbManagerRecovered = new SahwaDatabaseManager(tempDbDir);
    dbManagerRecovered.initDatabase();
    const dbRecovered = dbManagerRecovered.getRawDb();

    const integrityResult = dbRecovered.pragma('integrity_check') as any[];
    const integrityOk = integrityResult && integrityResult.length > 0 && integrityResult[0].integrity_check === 'ok';
    console.log(`SQLite integrity check result: ${integrityResult[0].integrity_check}`);

    const qtyAfterCrash = (dbRecovered.prepare("SELECT quantity_meters FROM fabrics WHERE id = 'FAB-CRASH'").get() as any)?.quantity_meters;
    console.log(`Fabric Crash quantity after recovery: ${qtyAfterCrash}`);

    s7Passed = integrityOk && qtyAfterCrash === 100;
    s7Message = `Integrity: ${integrityResult[0].integrity_check}, Qty: ${qtyAfterCrash} متر`;

    results.push({
      id: 7,
      name: '٧) اختبار قسوة (Crash mid-transaction & Rollback)',
      expected: 'PRAGMA integrity_check = ok، والكمية ترجع لـ 100 (rollback تلقائي بفعل WAL)',
      actual: s7Passed ? `نجح الاسترداد والتراجع بنجاح! (${s7Message})` : `فشل: ${s7Message}`,
      passed: s7Passed
    });

    // ==========================================
    // Print final results table
    // ==========================================
    console.log('\n======================================================');
    console.log('RESULTS TABLE:');
    console.log('======================================================');
    console.table(results.map(r => ({
      'السيناريو': r.name,
      'النتيجة المتوقعة': r.expected,
      'النتيجة الفعلية': r.actual,
      'الحالة': r.passed ? '✅ نجح (PASS)' : '❌ فشل (FAIL)'
    })));
    console.log('======================================================');

    // Clean up temporary test database folder
    await dbManagerRecovered.close();
    fs.rmSync(tempDbDir, { recursive: true, force: true });

  } catch (error) {
    console.error('Fatal testing error:', error);
  } finally {
    // Delete the test file we generated to avoid cluttering src/electron/
    try {
      fs.unlinkSync(testIpcPath);
      console.log('Removed temporary test file src/electron/ipcHandlers.test.ts');
    } catch (e) {}
    try {
      const childScriptPath = path.join(process.cwd(), 'temp_crash_child.js');
      if (fs.existsSync(childScriptPath)) {
        fs.unlinkSync(childScriptPath);
        console.log('Removed temporary child process file temp_crash_child.js');
      }
    } catch (e) {}
  }
}

runTests();
