import { round2 } from './inventoryRules';

export type CustomerCreditEntryType = 'created' | 'applied' | 'refunded';

export type CustomerCreditMethod = 'customer_credit' | 'cash' | 'card' | 'transfer';

export interface CustomerCreditEntry {
  id: string;
  customerId: string;
  entryType: CustomerCreditEntryType;
  amount: number;
  createdAt: string;
  paymentId?: string;
  orderId?: string;
  invoiceId?: string;
  sourceEntryId?: string;
  targetOrderId?: string;
  targetInvoiceId?: string;
  operationId?: string;
  idempotencyKey?: string;
  method?: CustomerCreditMethod;
  actorId?: string;
  reason?: string;
  occurredAt?: string;
  /** Nullable only for legacy rows; required for new operations at service level. */
  balanceAfter?: number | null;
}

export interface CustomerCreditCreatedEntry extends CustomerCreditEntry {
  entryType: 'created';
  paymentId: string;
}

export interface CustomerCreditDebitAllocation {
  sourceEntryId: string;
  amount: number;
  /** Placeholder; the service recalculates it after each persisted FIFO entry. */
  balanceAfter: number;
}

export interface CustomerCreditApplicationInput {
  customerId: string;
  targetInvoiceId: string;
  targetOrderId: string;
  targetInvoiceCustomerId: string;
  targetInvoiceStatus: string;
  targetRemainingAmount: number;
  sourceInvoiceId?: string;
  amount: number;
  availableBalance: number;
  idempotencyKey: string;
}

export interface CustomerCreditRefundInput {
  customerId: string;
  amount: number;
  method: Exclude<CustomerCreditMethod, 'customer_credit'>;
  availableBalance: number;
  idempotencyKey: string;
  actorId: string;
  reason: string;
}

export const CUSTOMER_CREDIT_METHOD = 'customer_credit' as const;
const MONEY_EPSILON = 0.000001;

export const assertPositiveMoney = (amount: number, field = 'amount'): void => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${field} must be a finite positive amount`);
  }
  if (Math.abs(round2(amount) - amount) > MONEY_EPSILON) {
    throw new Error(`${field} exceeds supported monetary precision`);
  }
};

export const assertCustomerCreditAmountWithinBalance = (
  amount: number,
  availableBalance: number,
): void => {
  assertPositiveMoney(amount);
  if (!Number.isFinite(availableBalance) || availableBalance < 0) {
    throw new Error('Customer credit balance is invalid');
  }
  if (round2(amount) > round2(availableBalance) + MONEY_EPSILON) {
    throw new Error('Customer credit amount exceeds available balance');
  }
};

export const calculateCustomerCreditBalance = (
  entries: Pick<CustomerCreditEntry, 'entryType' | 'amount'>[],
): number => {
  const balance = entries.reduce((total, entry) => {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Customer credit entry amount must be non-negative');
    }
    const roundedAmount = round2(amount);
    return total + (entry.entryType === 'created' ? roundedAmount : -roundedAmount);
  }, 0);
  const roundedBalance = round2(balance);
  if (roundedBalance < -MONEY_EPSILON) {
    throw new Error('Customer credit balance cannot be negative');
  }
  return Math.max(0, roundedBalance);
};

export const assertApplicationTarget = (input: CustomerCreditApplicationInput): void => {
  if (!input.customerId || input.customerId !== input.targetInvoiceCustomerId) {
    throw new Error('Customer credit can only be applied to the same customer');
  }
  if (!input.targetInvoiceId || input.targetInvoiceId === input.sourceInvoiceId) {
    throw new Error('Customer credit cannot be applied to its source invoice');
  }
  if (!input.targetOrderId) {
    throw new Error('targetOrderId is required');
  }
  if (input.targetInvoiceStatus === 'cancelled' || input.targetInvoiceStatus === 'settled_by_cancellation') {
    throw new Error('Customer credit cannot be applied to a cancelled invoice');
  }
  if (!Number.isFinite(input.targetRemainingAmount) || input.targetRemainingAmount <= 0) {
    throw new Error('Customer credit target invoice must have a positive remaining amount');
  }
  assertCustomerCreditAmountWithinBalance(
    input.amount,
    Math.min(input.availableBalance, input.targetRemainingAmount),
  );
  if (!input.idempotencyKey.trim()) {
    throw new Error('idempotencyKey is required');
  }
};

export const assertRefundRequest = (input: CustomerCreditRefundInput): void => {
  if (!input.customerId) throw new Error('customerId is required');
  if (!input.actorId) throw new Error('actorId is required');
  if (!input.reason.trim()) throw new Error('Refund reason is required');
  if (!['cash', 'card', 'transfer'].includes(input.method)) {
    throw new Error('Refund method is invalid');
  }
  if (!input.idempotencyKey.trim()) {
    throw new Error('idempotencyKey is required');
  }
  assertCustomerCreditAmountWithinBalance(input.amount, input.availableBalance);
};

export const allocateCreditFIFO = (
  createdEntries: Array<{
    id: string;
    createdAt: string;
    amount: number;
    alreadyDebited: number;
  }>,
  debitAmount: number,
): CustomerCreditDebitAllocation[] => {
  assertPositiveMoney(debitAmount);
  let remaining = round2(debitAmount);
  const allocations: CustomerCreditDebitAllocation[] = [];
  const ordered = [...createdEntries].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );

  for (const entry of ordered) {
    const available = round2(Math.max(0, entry.amount - entry.alreadyDebited));
    if (available <= 0 || remaining <= 0) continue;
    const amount = round2(Math.min(available, remaining));
    allocations.push({ sourceEntryId: entry.id, amount, balanceAfter: 0 });
    remaining = round2(remaining - amount);
  }

  if (remaining > MONEY_EPSILON) {
    throw new Error('Insufficient customer credit balance for FIFO allocation');
  }
  return allocations;
};

export const assertBalanceAfter = (
  previousBalance: number,
  entryType: CustomerCreditEntryType,
  amount: number,
  balanceAfter: number,
): void => {
  if (!Number.isFinite(previousBalance) || previousBalance < 0) {
    throw new Error('Previous customer credit balance is invalid');
  }
  assertPositiveMoney(amount);
  const expected = round2(
    previousBalance + (entryType === 'created' ? amount : -amount),
  );
  if (expected < -MONEY_EPSILON) {
    throw new Error('Customer credit balance cannot become negative');
  }
  if (!Number.isFinite(balanceAfter) || Math.abs(round2(balanceAfter) - Math.max(0, expected)) > MONEY_EPSILON) {
    throw new Error('balance_after does not match the ledger movement');
  }
};
