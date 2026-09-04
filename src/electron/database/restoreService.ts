import Database from 'better-sqlite3';
import {
  AccessoryItem,
  ColorItem,
  Customer,
  CustomerCreditRecord,
  FabricItem,
  Invoice,
  NotificationItem,
  Order,
  OrderEvent,
  ThobeType,
} from '../../types';
import { normalizeMeasurements, normalizeStyleDetails } from '../../services/shared/measurementDefaults';
import { DatabaseIntegrityService } from '../services/databaseIntegrityService';
import { writeSetting } from './settingsRepository';

type RestoreBackupResult = { success: boolean; filePath?: string; error?: string };

export interface RestoreServiceDeps {
  getRawDb: () => Database.Database;
  backupDatabase: (reason: string) => Promise<RestoreBackupResult>;
}

interface RestorePayload {
  customers: Customer[];
  fabrics: FabricItem[];
  accessories: AccessoryItem[];
  thobeTypes: ThobeType[];
  colors: ColorItem[];
  orders: Order[];
  invoices?: Invoice[];
  customerCredits?: CustomerCreditRecord[];
  stockMovements?: Array<Record<string, unknown>>;
  purchases?: Array<Record<string, unknown>>;
  expenses?: Array<Record<string, unknown>>;
  cashTransactions?: Array<Record<string, unknown>>;
  orderEvents?: OrderEvent[];
  orderMaterialUsages?: Array<Record<string, unknown>>;
  notifications?: NotificationItem[];
}

function applyRestorePayload(db: Database.Database, parsed: RestorePayload): void {
  db.prepare('DELETE FROM customer_credits').run();
  db.prepare('DELETE FROM order_events').run();
  db.prepare('DELETE FROM order_material_usages').run();
  db.prepare('DELETE FROM purchase_lines').run();
  db.prepare('DELETE FROM cash_transactions').run();
  db.prepare('DELETE FROM expenses').run();
  db.prepare('DELETE FROM purchases').run();
  db.prepare('DELETE FROM inventory_movements').run();
  db.prepare('DELETE FROM invoices').run();
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM customer_measurement_history').run();
  db.prepare('DELETE FROM customers').run();
  db.prepare('DELETE FROM fabrics').run();
  db.prepare('DELETE FROM accessories').run();
  db.prepare('DELETE FROM dress_types').run();
  db.prepare('DELETE FROM colors').run();
  db.prepare('DELETE FROM notifications').run();
  db.prepare("DELETE FROM visible_number_sequences").run();

  const custStmt = db.prepare(`
    INSERT INTO customers (id, customer_number, name, phone, created_at, updated_at, measurements_json, style_details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of parsed.customers) {
    custStmt.run(
      c.id, c.customerNumber ?? null, c.name, c.phone, c.createdAt || new Date().toISOString(),
      null, JSON.stringify(normalizeMeasurements(c.measurements)), JSON.stringify(normalizeStyleDetails(c.styleDetails))
    );

    if (Array.isArray(c.measurementHistory)) {
      const histStmt = db.prepare(`
        INSERT INTO customer_measurement_history (id, customer_id, saved_at, note, measurements_json, style_details_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const h of c.measurementHistory) {
        histStmt.run(h.id, c.id, h.savedAt, h.note || '', JSON.stringify(normalizeMeasurements(h.measurements)), JSON.stringify(normalizeStyleDetails(h.styleDetails)));
      }
    }
  }

  const fabStmt = db.prepare(`
    INSERT INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const f of parsed.fabrics) {
    fabStmt.run(
      f.id, f.name, f.color, f.colorHex || '#ffffff',
      f.purchasePrice ?? 0, f.sellingPrice ?? 0, f.quantityMeters ?? 0,
      f.minStockMeters ?? 10, f.createdAt || new Date().toISOString()
    );
  }

  const accStmt = db.prepare(`
    INSERT INTO accessories (id, name, category, quantity, min_stock, unit, purchase_price, selling_price, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of parsed.accessories) {
    accStmt.run(a.id, a.name, a.category, a.quantity ?? 0, a.minStock ?? 5, a.unit || 'حبة', a.purchasePrice ?? 0, a.sellingPrice ?? 0, a.createdAt || new Date().toISOString());
  }

  const thbStmt = db.prepare(`
    INSERT INTO dress_types (id, name, default_price, description)
    VALUES (?, ?, ?, ?)
  `);
  for (const t of parsed.thobeTypes) {
    thbStmt.run(t.id, t.name, t.defaultPrice ?? 0, t.description || '');
  }

  const colStmt = db.prepare(`
    INSERT INTO colors (id, name, hex)
    VALUES (?, ?, ?)
  `);
  for (const cl of parsed.colors) {
    colStmt.run(cl.id, cl.name, cl.hex);
  }

  const ordStmt = db.prepare(`
    INSERT INTO orders (
      id, order_number, customer_id, customer_name, customer_phone,
      thobe_type_id, thobe_type_name, fabric_id, fabric_name, fabric_color,
      fabric_consumption_meters, fabric_buy_price_at_order, garment_count,
      order_date, delivery_date, status, total_amount, paid_amount, remaining_amount,
      cash_received, overpayment_amount, cancellation_writeoff_amount,
      is_custom_measurement, measurements_json, style_details_json, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const o of parsed.orders) {
    const total = o.totalAmount ?? 0;
    const paid = o.paidAmount ?? 0;
    const remaining = o.remainingAmount ?? Math.max(0, total - paid);
    const cashReceived = o.cashReceived ?? paid;
    const overpaymentAmount = o.overpaymentAmount ?? 0;
    const cancellationWriteoffAmount = o.cancellationWriteoffAmount ?? 0;

    ordStmt.run(
      o.id, o.orderNumber, o.customerId, o.customerName, o.customerPhone,
      o.thobeTypeId || null, o.thobeTypeName || 'ثوب', o.fabricId || null,
      o.fabricName || 'قماش', o.fabricColor || 'أبيض',
      o.fabricConsumptionMeters ?? 3.5, o.fabricBuyPriceAtOrder ?? 0,
      o.garmentCount ?? 1, o.orderDate, o.deliveryDate, o.status || 'new',
      total, paid, remaining, cashReceived, overpaymentAmount, cancellationWriteoffAmount,
      o.isCustomMeasurement ? 1 : 0,
      JSON.stringify(normalizeMeasurements(o.measurements)), JSON.stringify(normalizeStyleDetails(o.styleDetails)),
      o.notes || '', o.createdAt || new Date().toISOString()
    );
  }

  if (Array.isArray(parsed.invoices)) {
    const invStmt = db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, visible_invoice_number, order_id, customer_name, customer_phone,
        order_date, total_amount, paid_amount, remaining_amount,
        cash_received, overpayment_amount, cancellation_writeoff_amount,
        payment_status, payments_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const inv of parsed.invoices) {
      const remaining = inv.remainingAmount ?? Math.max(0, (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0) - (inv.cancellationWriteoffAmount ?? 0));
      invStmt.run(
        inv.id, inv.invoiceNumber, inv.visibleInvoiceNumber ?? null, inv.orderId, inv.customerName, inv.customerPhone,
        inv.orderDate, inv.totalAmount ?? 0, inv.paidAmount ?? 0, remaining,
        inv.cashReceived ?? inv.paidAmount ?? 0, inv.overpaymentAmount ?? 0,
        inv.cancellationWriteoffAmount ?? 0, inv.paymentStatus || 'unpaid', JSON.stringify(inv.payments || [])
      );
    }
  }

  db.prepare(`
    INSERT INTO visible_number_sequences (name, next_number)
    VALUES ('customers', COALESCE((SELECT MAX(customer_number) + 1 FROM customers), 1))
  `).run();
  db.prepare(`
    INSERT INTO visible_number_sequences (name, next_number)
    VALUES ('invoices', COALESCE((SELECT MAX(visible_invoice_number) + 1 FROM invoices), 1))
  `).run();

  if (Array.isArray(parsed.customerCredits)) {
    const creditStmt = db.prepare(`
      INSERT INTO customer_credits (
        id, customer_id, order_id, invoice_id, payment_id, entry_type,
        amount, reference_id, notes, created_at,
        operation_id, idempotency_key, source_entry_id, target_invoice_id,
        target_order_id, method, actor_id, reason, occurred_at, balance_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const credit of parsed.customerCredits) {
      creditStmt.run(
        credit.id, credit.customerId, credit.orderId ?? null, credit.invoiceId ?? null,
        credit.paymentId ?? null, credit.entryType, credit.amount,
        credit.referenceId ?? null, credit.notes ?? null, credit.createdAt || new Date().toISOString(),
        credit.operationId ?? null, credit.idempotencyKey ?? null, credit.sourceEntryId ?? null,
        credit.targetInvoiceId ?? null, credit.targetOrderId ?? null, credit.method ?? null,
        credit.actorId ?? null, credit.reason ?? null, credit.occurredAt ?? null,
        credit.balanceAfter ?? null
      );
    }
  }

  if (Array.isArray(parsed.stockMovements)) {
    const movementStmt = db.prepare(`
      INSERT INTO inventory_movements (id, item_type, item_id, item_name, direction, quantity, quantity_before, quantity_after, unit, reason, reference_type, reference_id, reference_number, unit_cost, total_cost, source_movement_id, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const movement of parsed.stockMovements) {
      movementStmt.run(
        movement.id, movement.itemType, movement.itemId, movement.itemName, movement.direction, movement.quantity,
        movement.quantityBefore, movement.quantityAfter, movement.unit, movement.reason, movement.referenceType || null,
        movement.referenceId || null, movement.referenceNumber || null, movement.unitCost ?? null, movement.totalCost ?? null,
        movement.sourceMovementId || null, movement.actorId || null, movement.createdAt || new Date().toISOString()
      );
    }
  }

  if (Array.isArray(parsed.purchases)) {
    const purchaseStmt = db.prepare(`
      INSERT INTO purchases (id, supplier, invoice_number, purchase_date, total_amount, payment_method, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const lineStmt = db.prepare(`
      INSERT INTO purchase_lines (id, purchase_id, item_type, item_id, item_name, quantity, unit, unit_price, total_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const purchase of parsed.purchases) {
      purchaseStmt.run(
        purchase.id, purchase.supplier, purchase.invoiceNumber || null, purchase.purchaseDate, purchase.totalAmount ?? 0,
        purchase.paymentMethod || 'cash', purchase.notes || null, purchase.status || 'approved', purchase.createdAt || new Date().toISOString()
      );
      const lines = Array.isArray(purchase.lines) ? purchase.lines as Array<Record<string, unknown>> : [];
      for (const line of lines) {
        lineStmt.run(
          line.id, purchase.id, line.itemType, line.itemId, line.itemName, line.quantity, line.unit,
          line.unitPrice ?? 0, line.totalAmount ?? 0, line.createdAt || new Date().toISOString()
        );
      }
    }
  }

  if (Array.isArray(parsed.expenses)) {
    const expenseStmt = db.prepare(`
      INSERT INTO expenses (id, category, amount, expense_date, payment_method, description, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const expense of parsed.expenses) {
      expenseStmt.run(
        expense.id, expense.category, expense.amount ?? 0, expense.expenseDate, expense.paymentMethod || 'cash',
        expense.description, expense.notes || null, expense.createdAt || new Date().toISOString()
      );
    }
  }

  if (Array.isArray(parsed.cashTransactions)) {
    const cashStmt = db.prepare(`
      INSERT INTO cash_transactions (id, direction, source_type, source_id, order_id, reference_number, amount, payment_method, transaction_date, description, notes, actor_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const cash of parsed.cashTransactions) {
      cashStmt.run(
        cash.id, cash.direction, cash.sourceType, cash.sourceId || null, cash.orderId || null, cash.referenceNumber || null,
        cash.amount ?? 0, cash.paymentMethod || 'cash', cash.transactionDate, cash.description, cash.notes || null,
        cash.actorId || null, cash.reason || null, cash.createdAt || new Date().toISOString()
      );
    }
  }

  if (Array.isArray(parsed.orderEvents)) {
    const eventStmt = db.prepare(`
      INSERT INTO order_events (id, order_id, event_type, title, description, from_status, to_status, actor, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const event of parsed.orderEvents) {
      eventStmt.run(
        event.id, event.orderId, event.type, event.title, event.description, event.fromStatus || null, event.toStatus || null,
        event.actor || null, event.metadata ? JSON.stringify(event.metadata) : null, event.createdAt || new Date().toISOString()
      );
    }
  }

  if (Array.isArray(parsed.orderMaterialUsages)) {
    const materialStmt = db.prepare(`
      INSERT INTO order_material_usages (id, order_id, item_type, item_id, item_name, quantity, unit, unit_cost_at_usage, total_cost, source_movement_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const usage of parsed.orderMaterialUsages) {
      materialStmt.run(
        usage.id, usage.orderId, usage.itemType, usage.itemId || null, usage.itemName, usage.quantity, usage.unit,
        usage.unitCostAtUsage ?? 0, usage.totalCost ?? 0, usage.sourceMovementId || null, usage.createdAt || new Date().toISOString()
      );
    }
  }

  if (Array.isArray(parsed.notifications)) {
    const notifStmt = db.prepare(`
      INSERT INTO notifications (
        id, type, title, message, date, read, customer_phone, order_id,
        status, source, source_id, read_at, archived_at, retry_count, last_error,
        retry_history_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const notification of parsed.notifications) {
      notifStmt.run(
        notification.id, notification.type, notification.title, notification.message, notification.date, notification.read ? 1 : 0,
        notification.customerPhone || null, notification.orderId || null,
        notification.status || 'sent', notification.source || 'legacy', notification.sourceId || notification.id,
        notification.readAt || null, notification.archivedAt || null,
        notification.retryCount ?? 0, notification.lastError || null, JSON.stringify(notification.retryHistory || []),
        notification.createdAt || new Date().toISOString(), notification.updatedAt || new Date().toISOString()
      );
    }
  }

  const postRestore = new DatabaseIntegrityService(db).check();
  if (!postRestore.ok) {
    throw new Error(`فشل فحص سلامة البيانات بعد الاستعادة: ${postRestore.issues.slice(0, 5).map((item) => `${item.code}(${item.recordId || item.table})`).join(', ')}`);
  }
}

export async function restoreFromJson(
  deps: RestoreServiceDeps,
  jsonString: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = JSON.parse(jsonString) as RestorePayload;

    const preflight = DatabaseIntegrityService.validateRestorePayload(parsed);
    if (!preflight.ok) {
      return { success: false, error: `النسخة الاحتياطية غير صالحة: ${preflight.issues.map((item) => `${item.code}(${item.recordId || item.field || item.table})`).join(', ')}` };
    }

    const preRestoreBackup = await deps.backupDatabase('pre_restore');
    if (!preRestoreBackup.success) {
      return { success: false, error: `تعذر إنشاء نسخة أمان قبل الاستعادة: ${preRestoreBackup.error || 'سبب غير معروف'}` };
    }

    const db = deps.getRawDb();
    const restoreTx = db.transaction(() => {
      applyRestorePayload(db, parsed);
    });

    restoreTx();
    writeSetting(db, 'dataCleared', parsed.customers.length === 0 ? 'true' : 'false');
    return { success: true };
  } catch (err: unknown) {
    console.error('Restore error:', err);
    const message = err instanceof Error ? err.message : 'تعذر استيراد البيانات: فشل التحقق من بنية البيانات.';
    return { success: false, error: message || 'تعذر استيراد البيانات: فشل التحقق من بنية البيانات.' };
  }
}
