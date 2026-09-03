import { ipcMain } from 'electron';
import { safeIpcHandle } from '../errorHandler';
import { InventoryService } from '../services/inventoryService';
import { AccountingService } from '../services/accountingService';
import { CashRepository } from '../repositories/cashRepository';
import { OrderRepository } from '../repositories/orderRepository';
import {
  CashTransaction,
  ExpenseRecord,
  InventoryItemType,
  OrderMaterialUsage,
  PurchaseRecord,
} from '../../types';
import { createSafeId } from '../../domain/idGenerator';
import { normalizePositiveAmount } from '../../domain/amountRules';
import { round2 } from '../../domain/inventoryRules';
import { assertValidManualCashSourceType } from '../../domain/cashRules';
import { assertValidPaymentMethod } from '../../domain/paymentRules';
import {
  cashAdjustmentArgsSchema,
  expenseCreateSchema,
  purchaseCreateSchema,
  stockAdjustArgsSchema,
  stockReturnPurchaseArgsSchema,
} from '../../services/shared/ipcSchemas';
import { parseIpcInput } from '../validation/parseIpc';
import { mapCashTransaction, mapExpense, mapPurchase } from './mappers';

interface InventoryAccountingDeps {
  inventoryService: InventoryService;
  accountingService: AccountingService;
  cashRepository: CashRepository;
  orderRepository: OrderRepository;
}

export function registerInventoryAccountingHandlers(deps: InventoryAccountingDeps): void {
  const { inventoryService, accountingService, cashRepository, orderRepository } = deps;

  safeIpcHandle(ipcMain, 'stockMovements:list', async (_, itemType?: InventoryItemType, itemId?: string) => {
    return inventoryService.listMovements(itemType, itemId);
  });

  safeIpcHandle(ipcMain, 'stock:adjust', async (_, request: unknown) => {
    const input = parseIpcInput(stockAdjustArgsSchema, request, 'بيانات حركة المخزون');
    return inventoryService.adjustStock(input.itemType, input.itemId, input.quantity, input.reason, input.direction, input.actorId, input.unitCost);
  });
  safeIpcHandle(ipcMain, 'stock:returnPurchase', async (_, request: unknown) => {
    const input = parseIpcInput(stockReturnPurchaseArgsSchema, request, 'بيانات إرجاع الشراء');
    return inventoryService.returnPurchase(input.itemType, input.itemId, input.quantity, input.reason, input.originalMovementId, input.purchaseId, input.actorId);
  });

  safeIpcHandle(ipcMain, 'purchases:list', async () => {
    const { rows, lines } = accountingService.listPurchases();
    return rows.map((row) => mapPurchase(row, lines));
  });

  safeIpcHandle(ipcMain, 'purchases:create', async (_, raw: unknown) => {
    const input = parseIpcInput(purchaseCreateSchema, raw, 'بيانات المشتريات');
    const result = accountingService.createPurchase(input as unknown as PurchaseRecord);
    const purchase = accountingService.findPurchase(result.id);
    if (!purchase) throw new Error('تعذر العثور على المشتريات بعد إنشائها.');
    return mapPurchase(purchase.row, purchase.lines);
  });

  safeIpcHandle(ipcMain, 'expenses:list', async () => accountingService.listExpenses().map(mapExpense));

  safeIpcHandle(ipcMain, 'expenses:create', async (_, raw: unknown) => {
    const input = parseIpcInput(expenseCreateSchema, raw, 'بيانات المصروف');
    const expenseId = accountingService.createExpense(input as unknown as ExpenseRecord);
    const expense = accountingService.findExpense(expenseId);
    if (!expense) throw new Error('تعذر العثور على المصروف بعد إنشائه.');
    return mapExpense(expense);
  });

  safeIpcHandle(ipcMain, 'cash:list', async () => {
    return (cashRepository.list() as any[]).map(mapCashTransaction);
  });

  safeIpcHandle(ipcMain, 'cash:createAdjustment', async (_, payload: unknown) => {
    const input = parseIpcInput(cashAdjustmentArgsSchema, payload, 'بيانات حركة الصندوق');
    const amount = normalizePositiveAmount(input.amount, 'مبلغ الحركة');
    const paymentMethod = assertValidPaymentMethod(input.paymentMethod);
    const id = input.id || createSafeId('CASH');
    const existing = cashRepository.findById(id) as any;
    if (existing) return mapCashTransaction(existing);
    const transaction: CashTransaction = {
      id,
      direction: input.direction,
      sourceType: assertValidManualCashSourceType(input.sourceType),
      sourceId: input.sourceId,
      referenceNumber: input.referenceNumber,
      amount: round2(amount),
      paymentMethod,
      transactionDate: input.transactionDate || new Date().toISOString().slice(0, 10),
      description: input.description,
      notes: input.notes,
      actorId: input.actorId,
      reason: input.reason?.trim() || input.description,
      createdAt: new Date().toISOString()
    };
    cashRepository.insert(transaction);
    return transaction;
  });

  safeIpcHandle(ipcMain, 'orderMaterials:list', async (_, orderId?: string) => {
    const rows = orderRepository.listMaterialUsages(orderId);
    return (rows as any[]).map((row): OrderMaterialUsage => ({
      id: row.id,
      orderId: row.order_id,
      itemType: row.item_type,
      itemId: row.item_id || undefined,
      itemName: row.item_name,
      quantity: row.quantity,
      unit: row.unit,
      unitCostAtUsage: row.unit_cost_at_usage,
      totalCost: row.total_cost,
      sourceMovementId: row.source_movement_id || undefined,
      createdAt: row.created_at
    }));
  });
}
