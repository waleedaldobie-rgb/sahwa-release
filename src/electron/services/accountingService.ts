import { CashTransaction, InventoryItemType } from '../../types';
import { AccountingRepository } from '../repositories/accountingRepository';
import { CashRepository } from '../repositories/cashRepository';
import { InventoryService } from './inventoryService';
import { normalizePositiveAmount } from '../../domain/amountRules';
import { round2 } from '../../domain/inventoryRules';
import { assertValidPaymentMethod } from '../../domain/paymentRules';
import { createSafeId } from '../../domain/idGenerator';

export class AccountingService {
  constructor(
    private readonly repository: AccountingRepository,
    private readonly inventoryService: InventoryService,
    private readonly cashRepository: CashRepository,
    private readonly db: { transaction<T>(callback: () => T): () => T }
  ) {}

  listPurchases(): { rows: any[]; lines: any[] } {
    return { rows: this.repository.listPurchases(), lines: this.repository.listPurchaseLines() };
  }

  findPurchase(id: string): { row: any; lines: any[] } | undefined {
    const row = this.repository.findPurchase(id);
    if (!row) return undefined;
    return { row, lines: this.repository.listPurchaseLines().filter((line) => line.purchase_id === id) };
  }

  createPurchase(payload: any): { id: string; now: string } {
    const purchaseId = payload.id || createSafeId('PUR');
    const paymentMethod = assertValidPaymentMethod(payload.paymentMethod ?? 'cash');
    const existing = this.findPurchase(purchaseId);
    if (existing) return { id: purchaseId, now: existing.row.created_at };
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!payload.supplier?.trim()) throw new Error('اسم المورد مطلوب');
    if (lines.length === 0) throw new Error('أضف صنفاً واحداً على الأقل إلى المشتريات');

    const tx = this.db.transaction(() => {
      const now = new Date().toISOString();
      const purchaseDate = payload.purchaseDate || now.slice(0, 10);
      let totalAmount = 0;
      const preparedLines: Array<{ input: any; meta: any; quantity: number; unitPrice: number; total: number }> = [];
      for (const line of lines) {
        const quantity = Number(line.quantity);
        const unitPrice = Number(line.unitPrice);
        if (!line.itemType || !line.itemId || !Number.isFinite(quantity) || quantity <= 0) throw new Error('بيانات كمية المشتريات غير صحيحة');
        if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('سعر الشراء لا يمكن أن يكون سالباً');
        const meta = this.inventoryService.getMeta(line.itemType as InventoryItemType, line.itemId);
        const total = round2(quantity * unitPrice);
        totalAmount += total;
        preparedLines.push({ input: line, meta, quantity, unitPrice, total });
      }

      this.repository.insertPurchase({
        id: purchaseId,
        supplier: payload.supplier.trim(),
        invoiceNumber: payload.invoiceNumber,
        purchaseDate,
        totalAmount: round2(totalAmount),
        paymentMethod,
        notes: payload.notes,
        createdAt: now
      });

      for (const line of preparedLines) {
        this.inventoryService.recordMovement(line.input.itemType, line.input.itemId, line.quantity, 'purchase', `شراء من المورد ${payload.supplier.trim()}`, {
          type: 'purchase', id: purchaseId, number: payload.invoiceNumber || purchaseId
        }, { unitCost: line.unitPrice, actorId: 'system', updateWac: true });
        this.repository.insertPurchaseLine({
          id: createSafeId('PURL'),
          purchaseId,
          itemType: line.input.itemType,
          itemId: line.input.itemId,
          itemName: line.meta.name,
          quantity: line.quantity,
          unit: line.input.unit || line.meta.unit,
          unitPrice: line.unitPrice,
          totalAmount: line.total,
          createdAt: now
        });
      }

      if (totalAmount > 0) {
        const cash: CashTransaction = {
          id: `CASH-PUR-${purchaseId}`,
          direction: 'out',
          sourceType: 'purchase',
          sourceId: purchaseId,
          referenceNumber: payload.invoiceNumber || purchaseId,
          amount: round2(totalAmount),
          paymentMethod,
          transactionDate: purchaseDate,
          description: `شراء مخزون من ${payload.supplier.trim()}`,
          notes: payload.notes || undefined,
          actorId: 'system',
          reason: payload.notes?.trim() || `شراء مخزون من ${payload.supplier.trim()}`,
          createdAt: now
        };
        this.cashRepository.insert(cash);
      }
      return { id: purchaseId, now };
    });
    return tx();
  }

  listExpenses(): any[] { return this.repository.listExpenses(); }
  findExpense(id: string): any | undefined { return this.repository.findExpense(id); }

  createExpense(payload: any): string {
    const expenseId = payload.id || createSafeId('EXP');
    const paymentMethod = assertValidPaymentMethod(payload.paymentMethod ?? 'cash');
    if (this.repository.findExpense(expenseId)) return expenseId;
    if (!payload.category?.trim() || !payload.description?.trim()) throw new Error('تصنيف ووصف المصروف مطلوبان');
    const amount = normalizePositiveAmount(payload.amount, 'مبلغ المصروف');
    const now = new Date().toISOString();
    const expenseDate = payload.expenseDate || now.slice(0, 10);

    const tx = this.db.transaction(() => {
      this.repository.insertExpense({
        id: expenseId,
        category: payload.category.trim(),
        amount: round2(amount),
        expenseDate,
        paymentMethod,
        description: payload.description.trim(),
        notes: payload.notes,
        createdAt: now
      });
      this.cashRepository.insert({
        id: `CASH-EXP-${expenseId}`,
        direction: 'out',
        sourceType: 'expense',
        sourceId: expenseId,
        referenceNumber: expenseId,
        amount: round2(amount),
        paymentMethod,
        transactionDate: expenseDate,
        description: payload.description.trim(),
        notes: payload.notes || undefined,
        actorId: 'system',
        reason: payload.description.trim(),
        createdAt: now
      });
    });
    tx();
    return expenseId;
  }
}
