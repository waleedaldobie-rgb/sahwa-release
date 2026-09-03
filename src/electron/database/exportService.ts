import Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { BACKUP_SCHEMA_VERSION } from '../integrity/types';
import { parseMeasurementsJson, parseStyleDetailsJson } from './jsonParsers';
import { calculateReportProjection, formatReportStatus } from '../../domain/reportMetrics';

type SqlRow = Record<string, unknown>;

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJsonArray(value: unknown): unknown[] {
  try {
    const parsed = JSON.parse(asString(value, '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function exportFullDataAsJson(db: Database.Database, includeArchivedNotifications = true): Record<string, unknown> {
  const rawCustomers = db.prepare('SELECT * FROM customers').all() as SqlRow[];
  const rawHistory = db.prepare('SELECT * FROM customer_measurement_history').all() as SqlRow[];
  const rawFabrics = db.prepare('SELECT * FROM fabrics').all() as SqlRow[];
  const rawAccessories = db.prepare('SELECT * FROM accessories').all() as SqlRow[];
  const rawThobeTypes = db.prepare('SELECT * FROM dress_types').all() as SqlRow[];
  const rawColors = db.prepare('SELECT * FROM colors').all() as SqlRow[];
  const rawOrders = db.prepare('SELECT * FROM orders').all() as SqlRow[];
  const rawInvoices = db.prepare('SELECT * FROM invoices').all() as SqlRow[];
  const rawNotifications = db.prepare(includeArchivedNotifications
    ? 'SELECT * FROM notifications'
    : 'SELECT * FROM notifications WHERE archived_at IS NULL').all() as SqlRow[];
  const rawStockMovements = db.prepare('SELECT * FROM inventory_movements').all() as SqlRow[];
  const rawPurchases = db.prepare('SELECT * FROM purchases').all() as SqlRow[];
  const rawPurchaseLines = db.prepare('SELECT * FROM purchase_lines').all() as SqlRow[];
  const rawExpenses = db.prepare('SELECT * FROM expenses').all() as SqlRow[];
  const rawCashTransactions = db.prepare('SELECT * FROM cash_transactions').all() as SqlRow[];
  const rawOrderMaterialUsages = db.prepare('SELECT * FROM order_material_usages').all() as SqlRow[];
  const rawOrderEvents = db.prepare('SELECT * FROM order_events ORDER BY created_at DESC').all() as SqlRow[];
  const rawCustomerCredits = db.prepare('SELECT * FROM customer_credits ORDER BY occurred_at ASC, created_at ASC, id ASC').all() as SqlRow[];

  const purchaseLinesMap = new Map<string, SqlRow[]>();
  for (const line of rawPurchaseLines) {
    const purchaseId = asString(line.purchase_id);
    const lines = purchaseLinesMap.get(purchaseId) || [];
    lines.push(line);
    purchaseLinesMap.set(purchaseId, lines);
  }

  const historyMap = new Map<string, unknown[]>();
  for (const history of rawHistory) {
    const customerId = asString(history.customer_id);
    const list = historyMap.get(customerId) || [];
    list.push({
      id: history.id,
      savedAt: history.saved_at,
      note: history.note,
      measurements: parseMeasurementsJson(asString(history.measurements_json, '{}')),
      styleDetails: parseStyleDetailsJson(asString(history.style_details_json, '{}'))
    });
    historyMap.set(customerId, list);
  }

  const customers = rawCustomers.map(customer => ({
    id: customer.id,
    customerNumber: customer.customer_number ?? undefined,
    name: customer.name,
    phone: customer.phone,
    createdAt: customer.created_at,
    measurements: parseMeasurementsJson(asString(customer.measurements_json, '{}')),
    styleDetails: parseStyleDetailsJson(asString(customer.style_details_json, '{}')),
    measurementHistory: historyMap.get(asString(customer.id)) || []
  }));

  const fabrics = rawFabrics.map(fabric => ({
    id: fabric.id,
    name: fabric.name,
    color: fabric.color,
    colorHex: fabric.color_hex,
    purchasePrice: fabric.purchase_price,
    sellingPrice: fabric.selling_price,
    quantityMeters: fabric.quantity_meters,
    minStockMeters: fabric.min_stock_meters,
    createdAt: fabric.created_at
  }));

  const accessories = rawAccessories.map(accessory => ({
    id: accessory.id,
    name: accessory.name,
    category: accessory.category,
    quantity: accessory.quantity,
    minStock: accessory.min_stock,
    unit: accessory.unit,
    purchasePrice: accessory.purchase_price || 0,
    sellingPrice: accessory.selling_price || 0,
    createdAt: accessory.created_at
  }));

  const thobeTypes = rawThobeTypes.map(type => ({
    id: type.id,
    name: type.name,
    defaultPrice: type.default_price,
    description: type.description
  }));

  const colors = rawColors.map(color => ({
    id: color.id,
    name: color.name,
    hex: color.hex
  }));

  const customerNumberById = new Map(rawCustomers.map((customer) => [asString(customer.id), customer.customer_number ?? undefined]));
  const orders = rawOrders.map(order => ({
    id: order.id,
    orderNumber: order.order_number,
    customerId: order.customer_id,
    customerNumber: customerNumberById.get(asString(order.customer_id)),
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    thobeTypeId: order.thobe_type_id,
    thobeTypeName: order.thobe_type_name,
    fabricId: order.fabric_id,
    fabricName: order.fabric_name,
    fabricColor: order.fabric_color,
    fabricConsumptionMeters: order.fabric_consumption_meters,
    fabricBuyPriceAtOrder: order.fabric_buy_price_at_order,
    garmentCount: order.garment_count,
    orderDate: order.order_date,
    deliveryDate: order.delivery_date,
    status: order.status,
    totalAmount: order.total_amount,
    paidAmount: order.paid_amount,
    remainingAmount: order.remaining_amount,
    cashReceived: order.cash_received,
    overpaymentAmount: order.overpayment_amount,
    cancellationWriteoffAmount: order.cancellation_writeoff_amount,
    isCustomMeasurement: Boolean(order.is_custom_measurement),
    measurements: parseMeasurementsJson(asString(order.measurements_json, '{}')),
    styleDetails: parseStyleDetailsJson(asString(order.style_details_json, '{}')),
    notes: order.notes,
    createdAt: order.created_at
  }));

  const invoices = rawInvoices.map(invoice => {
    const relatedOrder = rawOrders.find((order) => order.id === invoice.order_id);
    return {
      id: invoice.id,
      visibleInvoiceNumber: invoice.visible_invoice_number ?? undefined,
      customerNumber: customerNumberById.get(asString(invoice.customer_id || relatedOrder?.customer_id)),
      invoiceNumber: invoice.invoice_number,
      orderId: invoice.order_id,
      customerName: invoice.customer_name,
      customerPhone: invoice.customer_phone,
      orderDate: invoice.order_date,
      totalAmount: invoice.total_amount,
      paidAmount: invoice.paid_amount,
      remainingAmount: invoice.remaining_amount,
      cashReceived: invoice.cash_received,
      overpaymentAmount: invoice.overpayment_amount,
      cancellationWriteoffAmount: invoice.cancellation_writeoff_amount,
      paymentStatus: invoice.payment_status,
      payments: JSON.parse(asString(invoice.payments_json, '[]'))
    };
  });

  const notifications = rawNotifications.map(notification => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    date: notification.date,
    read: Boolean(notification.read),
    customerPhone: notification.customer_phone,
    orderId: notification.order_id || undefined,
    status: notification.status || 'sent',
    source: notification.source || 'legacy',
    sourceId: notification.source_id || undefined,
    readAt: notification.read_at || undefined,
    archivedAt: notification.archived_at || undefined,
    retryCount: asNumber(notification.retry_count, 0),
    lastError: notification.last_error || undefined,
    retryHistory: parseJsonArray(notification.retry_history_json),
    createdAt: notification.created_at || undefined,
    updatedAt: notification.updated_at || undefined
  }));

  const stockMovements = rawStockMovements.map(movement => ({
    id: movement.id, itemType: movement.item_type, itemId: movement.item_id, itemName: movement.item_name, direction: movement.direction,
    quantity: movement.quantity, quantityBefore: movement.quantity_before, quantityAfter: movement.quantity_after, unit: movement.unit,
    reason: movement.reason, referenceType: movement.reference_type, referenceId: movement.reference_id, referenceNumber: movement.reference_number,
    unitCost: asOptionalNumber(movement.unit_cost),
    totalCost: asOptionalNumber(movement.total_cost),
    sourceMovementId: movement.source_movement_id || undefined, actorId: movement.actor_id || undefined,
    createdAt: movement.created_at
  }));
  const purchases = rawPurchases.map(purchase => ({
    id: purchase.id, supplier: purchase.supplier, invoiceNumber: purchase.invoice_number, purchaseDate: purchase.purchase_date,
    totalAmount: purchase.total_amount, paymentMethod: purchase.payment_method, notes: purchase.notes, status: purchase.status,
    lines: (purchaseLinesMap.get(asString(purchase.id)) || []).map(line => ({
      id: line.id, purchaseId: line.purchase_id, itemType: line.item_type, itemId: line.item_id, itemName: line.item_name,
      quantity: line.quantity, unit: line.unit, unitPrice: line.unit_price, totalAmount: line.total_amount, createdAt: line.created_at
    })),
    createdAt: purchase.created_at
  }));
  const expenses = rawExpenses.map(expense => ({
    id: expense.id, category: expense.category, amount: expense.amount, expenseDate: expense.expense_date,
    paymentMethod: expense.payment_method, description: expense.description, notes: expense.notes, createdAt: expense.created_at
  }));
  const cashTransactions = rawCashTransactions.map(cash => ({
    id: cash.id, direction: cash.direction, sourceType: cash.source_type, sourceId: cash.source_id,
    referenceNumber: cash.reference_number, orderId: cash.order_id || undefined, amount: cash.amount, paymentMethod: cash.payment_method,
    transactionDate: cash.transaction_date, description: cash.description, notes: cash.notes,
    actorId: cash.actor_id || undefined, reason: cash.reason || undefined, createdAt: cash.created_at
  }));
  const orderMaterialUsages = rawOrderMaterialUsages.map(usage => ({
    id: usage.id, orderId: usage.order_id, itemType: usage.item_type, itemId: usage.item_id, itemName: usage.item_name,
    quantity: usage.quantity, unit: usage.unit, unitCostAtUsage: usage.unit_cost_at_usage, totalCost: usage.total_cost,
    sourceMovementId: usage.source_movement_id, createdAt: usage.created_at
  }));
  const orderEvents = rawOrderEvents.map(event => ({
    id: event.id, orderId: event.order_id, type: event.event_type, title: event.title, description: event.description,
    fromStatus: event.from_status || undefined, toStatus: event.to_status || undefined, actor: event.actor || undefined,
    metadata: event.metadata_json ? JSON.parse(asString(event.metadata_json)) : undefined, createdAt: event.created_at
  }));
  const customerCredits = rawCustomerCredits.map(credit => ({
    id: credit.id, customerId: credit.customer_id, orderId: credit.order_id ?? null,
    invoiceId: credit.invoice_id ?? null, paymentId: credit.payment_id ?? null,
    entryType: credit.entry_type, amount: credit.amount, referenceId: credit.reference_id ?? null,
    notes: credit.notes ?? null, createdAt: credit.created_at,
    operationId: credit.operation_id ?? null, idempotencyKey: credit.idempotency_key ?? null,
    sourceEntryId: credit.source_entry_id ?? null, targetInvoiceId: credit.target_invoice_id ?? null,
    targetOrderId: credit.target_order_id ?? null, method: credit.method ?? null,
    actorId: credit.actor_id ?? null, reason: credit.reason ?? null,
    occurredAt: credit.occurred_at ?? null, balanceAfter: credit.balance_after ?? null
  }));

  return {
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    customers, fabrics, accessories, thobeTypes, colors, orders, invoices, notifications,
    stockMovements, purchases, expenses, cashTransactions, orderMaterialUsages, orderEvents, customerCredits
  };
}

export async function generateExcelReport(db: Database.Database, startDate?: string, endDate?: string): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const data = exportFullDataAsJson(db);
  const customers = Array.isArray(data.customers) ? data.customers as Array<Record<string, unknown>> : [];
  const invoices = Array.isArray(data.invoices) ? data.invoices as Array<Record<string, unknown>> : [];
  const fabrics = Array.isArray(data.fabrics) ? data.fabrics as Array<Record<string, unknown>> : [];
  const accessories = Array.isArray(data.accessories) ? data.accessories as Array<Record<string, unknown>> : [];
  const projection = calculateReportProjection({
    orders: (data.orders || []) as never,
    invoices: (data.invoices || []) as never,
    cashTransactions: (data.cashTransactions || []) as never,
    customerCredits: (data.customerCredits || []) as never,
    purchases: (data.purchases || []) as never,
    expenses: (data.expenses || []) as never,
    stockMovements: (data.stockMovements || []) as never,
    orderEvents: (data.orderEvents || []) as never,
    orderMaterialUsages: (data.orderMaterialUsages || []) as never,
    startDate,
    endDate
  });
  const statusLabel = (status: string) => status === 'cancelled' ? 'ملغى' : status === 'delivered' ? 'مُسلم' : status === 'ready' ? 'جاهز' : status === 'processing' ? 'تحت التنفيذ' : 'جديد';
  const orderRows = projection.details.map((detail, index) => {
    const customer = customers.find((item) => item.id === detail.order.customerId);
    const invoice = invoices.find((item) => item.orderId === detail.order.id);
    const visibleInvoiceNumber = invoice?.visibleInvoiceNumber ? `INV-${invoice.visibleInvoiceNumber}` : asString(invoice?.invoiceNumber);
    return {
      'م': index + 1,
      'رقم العميل': customer?.customerNumber || '',
      'رقم الفاتورة': visibleInvoiceNumber,
      'رقم الطلب': detail.order.orderNumber,
      'اسم العميل': detail.order.customerName,
      'رقم الجوال': detail.order.customerPhone,
      'نوع الثوب': detail.order.thobeTypeName,
      'القماش واللون': detail.order.fabricName + ' (' + detail.order.fabricColor + ')',
      'تاريخ الطلب': detail.order.orderDate,
      'تاريخ التسليم': detail.order.deliveryDate,
      'حالة الطلب': statusLabel(detail.order.status),
      'حالة التسوية': formatReportStatus(detail.settlementStatus),
      'داخل المبيعات': detail.includedInSales ? 'نعم' : 'لا',
      'داخل الإيراد المعترف به': detail.includedInRecognizedRevenue ? 'نعم' : 'لا',
      'applied_paid (ر.س)': detail.appliedPaid,
      'cash_received (ر.س)': detail.cashReceived,
      'overpayment (ر.س)': detail.overpaymentAmount,
      'cancellation writeoff (ر.س)': detail.cancellationWriteoffAmount,
      'الإجمالي (ر.س)': detail.order.totalAmount,
      'المتبقي (ر.س)': detail.order.remainingAmount,
      'تكلفة المواد (ر.س)': detail.materialCost || 0,
      'الربح المعترف به (ر.س)': detail.includedInRecognizedRevenue ? Number(detail.order.totalAmount || 0) - Number(detail.materialCost || 0) : 0
    };
  });
  const summaryRows: Array<{ البيان: string; القيمة: number }> = [
    { البيان: 'Sales booked', القيمة: projection.salesBooked },
    { البيان: 'Recognized revenue', القيمة: projection.recognizedRevenue },
    { البيان: 'Applied collected', القيمة: projection.appliedCollected },
    { البيان: 'Cash received', القيمة: projection.cashReceived },
    { البيان: 'Overpayment created', القيمة: projection.overpaymentCreated },
    { البيان: 'Overpayment applied', القيمة: projection.overpaymentApplied },
    { البيان: 'Overpayment refunded', القيمة: projection.overpaymentRefunded },
    { البيان: 'Closing customer credit liability', القيمة: projection.closingCustomerCreditLiability },
    { البيان: 'Customer credit cash refunds', القيمة: projection.customerCreditCashRefunds },
    { البيان: 'Customer credit non-cash refunds', القيمة: projection.customerCreditNonCashRefunds },
    { البيان: 'Cancellation Writeoff (Non-Cash Settlement)', القيمة: projection.cancellationWriteoff },
    { البيان: 'Active outstanding balance', القيمة: projection.activeOutstanding },
    { البيان: 'إجمالي المشتريات', القيمة: projection.totalPurchases },
    { البيان: 'إجمالي المصروفات', القيمة: projection.totalExpenses },
    { البيان: 'تكلفة المواد المعترف بها', القيمة: projection.recognizedMaterialCost },
    { البيان: 'صافي الربح', القيمة: projection.netProfit },
    { البيان: 'الطلبات الملغاة', القيمة: projection.cancelledOrdersCount },
    { البيان: 'الطلبات المسواة بالإلغاء', القيمة: projection.settledByCancellationCount }
  ];
  const customerCreditRows = [
    { البيان: 'overpayment_created', القيمة: projection.overpaymentCreated },
    { البيان: 'overpayment_applied', القيمة: projection.overpaymentApplied },
    { البيان: 'overpayment_refunded', القيمة: projection.overpaymentRefunded },
    { البيان: 'closing_customer_credit_liability', القيمة: projection.closingCustomerCreditLiability },
    { البيان: 'customer_credit_cash_refunds', القيمة: projection.customerCreditCashRefunds },
    { البيان: 'customer_credit_non_cash_refunds', القيمة: projection.customerCreditNonCashRefunds },
    { البيان: 'net_profit_impact', القيمة: 0 },
    { البيان: 'cash_received_impact', القيمة: 0 },
    { البيان: 'applied_collected_impact', القيمة: 0 },
    { البيان: 'recognized_revenue_impact', القيمة: 0 }
  ];
  const inventoryRows = [
    ...fabrics.map((fabric) => ({ النوع: 'قماش', الصنف: fabric.name, الكمية: fabric.quantityMeters, الوحدة: 'متر', 'سعر الشراء': fabric.purchasePrice || 0, 'قيمة المخزون': asNumber(fabric.quantityMeters) * asNumber(fabric.purchasePrice) })),
    ...accessories.map((accessory) => ({ النوع: 'مستلزم', الصنف: accessory.name, الكمية: accessory.quantity, الوحدة: accessory.unit, 'سعر الشراء': accessory.purchasePrice || 0, 'قيمة المخزون': asNumber(accessory.quantity) * asNumber(accessory.purchasePrice) }))
  ];
  const lowStockItems = fabrics.filter((fabric) => asNumber(fabric.quantityMeters) <= asNumber(fabric.minStockMeters)).length + accessories.filter((accessory) => asNumber(accessory.quantity) <= asNumber(accessory.minStock)).length;
  summaryRows.push({ البيان: 'قيمة المخزون', القيمة: inventoryRows.reduce((sum, row) => sum + Number(row['قيمة المخزون'] || 0), 0) });
  summaryRows.push({ البيان: 'أصناف منخفضة المخزون', القيمة: lowStockItems });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(orderRows), 'تقرير المبيعات');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'ملخص المحاسبة');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customerCreditRows), 'Customer Credit');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(inventoryRows), 'قيمة المخزون');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
