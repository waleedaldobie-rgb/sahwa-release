/**
 * Unified gateway contract between the renderer application layer and the
 * backend implementation (Electron IPC or Browser Mock). All business rules
 * are computed in the domain layer; gateways ONLY transport/validate/persist.
 */

export interface OrderResult {
  orderId: string;
  orderNumber: string | number;
  remainingAmount: number;
  materialUsages: unknown[];
  materialCost: number;
  profit: number;
  alreadyExists?: boolean;
}

export interface SahwaGateway {
  getData(): Promise<unknown>;
  saveData(data: unknown): Promise<boolean>;

  listCustomers(): Promise<unknown[]>;
  createCustomer(input: unknown): Promise<unknown>;
  updateCustomer(input: unknown): Promise<unknown>;
  deleteCustomer(id: string): Promise<unknown>;
  saveMeasurementHistory(id: string, note: string): Promise<unknown>;

  listOrders(): Promise<unknown[]>;
  createOrder(input: unknown, fabricConsumptionRate: number): Promise<OrderResult>;
  updateOrder(input: unknown, fabricConsumptionRate: number): Promise<unknown>;
  deleteOrder(id: string): Promise<unknown>;
  updateOrderStatus(input: unknown): Promise<unknown>;
  addPayment(input: unknown): Promise<unknown>;
  listInvoices(): Promise<unknown[]>;

  listFabrics(): Promise<unknown[]>;
  createFabric(input: unknown): Promise<unknown>;
  updateFabric(input: unknown): Promise<boolean>;
  deleteFabric(id: string): Promise<boolean>;
  listAccessories(): Promise<unknown[]>;
  createAccessory(input: unknown): Promise<unknown>;
  updateAccessory(input: unknown): Promise<boolean>;
  deleteAccessory(id: string): Promise<boolean>;
  listThobeTypes(): Promise<unknown[]>;
  createThobeType(input: unknown): Promise<unknown>;
  updateThobeType(input: unknown): Promise<boolean>;
  deleteThobeType(id: string): Promise<boolean>;
  listColors(): Promise<unknown[]>;
  createColor(input: unknown): Promise<unknown>;
  updateColor(input: unknown): Promise<boolean>;
  deleteColor(id: string): Promise<boolean>;

  listPurchases(): Promise<unknown[]>;
  createPurchase(input: unknown): Promise<unknown>;
  listExpenses(): Promise<unknown[]>;
  createExpense(input: unknown): Promise<unknown>;
  listCashTransactions(): Promise<unknown[]>;
  createCashAdjustment(input: unknown): Promise<unknown>;

  listCustomerCredits(customerId: string, filters?: unknown): Promise<unknown[]>;
  customerCreditSummary(customerId: string): Promise<unknown>;
  applyCustomerCredit(input: unknown): Promise<unknown>;
  refundCustomerCredit(input: unknown): Promise<unknown>;

  listNotifications(includeArchived?: boolean): Promise<unknown[]>;
  markNotificationRead(id: string): Promise<unknown>;
  markAllNotificationsRead(): Promise<unknown>;
  archiveNotifications(): Promise<unknown>;
  retryNotification(id: string): Promise<unknown>;
  getSettings(): Promise<unknown>;
  updateSetting(input: unknown): Promise<boolean>;
  backupNow(): Promise<unknown>;
  restoreFromJson(content: unknown): Promise<unknown>;
  clearAllData(): Promise<unknown>;
  exportExcel(startDate?: string, endDate?: string): Promise<string>;
}

export const SAHWA_GATEWAY_METHODS = [
  'getData', 'saveData', 'listCustomers', 'createCustomer', 'updateCustomer',
  'deleteCustomer', 'saveMeasurementHistory', 'listOrders', 'createOrder',
  'updateOrder', 'deleteOrder', 'updateOrderStatus', 'addPayment', 'listInvoices',
  'listFabrics', 'createFabric', 'updateFabric', 'deleteFabric',
  'listAccessories', 'createAccessory', 'updateAccessory', 'deleteAccessory',
  'listThobeTypes', 'createThobeType', 'updateThobeType', 'deleteThobeType',
  'listColors', 'createColor', 'updateColor', 'deleteColor',
  'listPurchases', 'createPurchase', 'listExpenses', 'createExpense',
  'listCashTransactions', 'createCashAdjustment',
  'listCustomerCredits', 'customerCreditSummary', 'applyCustomerCredit', 'refundCustomerCredit',
  'listNotifications', 'markNotificationRead', 'markAllNotificationsRead',
  'archiveNotifications', 'retryNotification', 'getSettings', 'updateSetting',
  'backupNow', 'restoreFromJson', 'clearAllData', 'exportExcel',
] as const;
