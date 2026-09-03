import {
  StockMovement,
  PurchaseRecord,
  PurchaseLine,
  ExpenseRecord,
  CashTransaction,
  OrderEvent,
} from '../../types';
import { normalizeMeasurements, normalizeStyleDetails } from '../../services/shared/measurementDefaults';

export const parseMeasurementsJson = (value?: string) => {
  try { return normalizeMeasurements(JSON.parse(value || '{}')); }
  catch { return normalizeMeasurements(); }
};

export const parseStyleDetailsJson = (value?: string) => {
  try { return normalizeStyleDetails(JSON.parse(value || '{}')); }
  catch { return normalizeStyleDetails(); }
};

export const mapOrderEvent = (row: any): OrderEvent => ({
  id: row.id,
  orderId: row.order_id,
  type: row.event_type,
  title: row.title,
  description: row.description,
  fromStatus: row.from_status || undefined,
  toStatus: row.to_status || undefined,
  actor: row.actor || undefined,
  metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
  createdAt: row.created_at
});

export const mapStockMovement = (row: any): StockMovement => ({
  id: row.id,
  itemType: row.item_type,
  itemId: row.item_id,
  itemName: row.item_name,
  direction: row.direction,
  quantity: row.quantity,
  quantityBefore: row.quantity_before,
  quantityAfter: row.quantity_after,
  unit: row.unit,
  reason: row.reason,
  referenceType: row.reference_type || undefined,
  referenceId: row.reference_id || undefined,
  referenceNumber: row.reference_number || undefined,
  unitCost: row.unit_cost === null || row.unit_cost === undefined ? undefined : row.unit_cost,
  totalCost: row.total_cost === null || row.total_cost === undefined ? undefined : row.total_cost,
  sourceMovementId: row.source_movement_id || undefined,
  actorId: row.actor_id || undefined,
  createdAt: row.created_at
});

export const mapCashTransaction = (row: any): CashTransaction => ({
  id: row.id,
  direction: row.direction,
  sourceType: row.source_type,
  sourceId: row.source_id || undefined,
  orderId: row.order_id || undefined,
  referenceNumber: row.reference_number || undefined,
  amount: row.amount,
  paymentMethod: row.payment_method,
  transactionDate: row.transaction_date,
  description: row.description,
  notes: row.notes || undefined,
  actorId: row.actor_id || undefined,
  reason: row.reason || undefined,
  createdAt: row.created_at
});

export const mapPurchase = (row: any, lines: any[]): PurchaseRecord => ({
  id: row.id,
  supplier: row.supplier,
  invoiceNumber: row.invoice_number || undefined,
  purchaseDate: row.purchase_date,
  totalAmount: row.total_amount,
  paymentMethod: row.payment_method,
  notes: row.notes || undefined,
  status: row.status,
  lines: lines.filter((line) => line.purchase_id === row.id).map((line): PurchaseLine => ({
    id: line.id,
    purchaseId: line.purchase_id,
    itemType: line.item_type,
    itemId: line.item_id,
    itemName: line.item_name,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unit_price,
    totalAmount: line.total_amount,
    createdAt: line.created_at
  })),
  createdAt: row.created_at
});

export const mapExpense = (row: any): ExpenseRecord => ({
  id: row.id,
  category: row.category,
  amount: row.amount,
  expenseDate: row.expense_date,
  paymentMethod: row.payment_method,
  description: row.description,
  notes: row.notes || undefined,
  createdAt: row.created_at
});
