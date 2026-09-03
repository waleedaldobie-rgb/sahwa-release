import { ipcMain } from 'electron';
import { safeIpcHandle } from '../errorHandler';
import { SahwaDatabaseManager } from '../db';
import { OrderService } from '../services/orderService';
import { OrderStatusService } from '../services/orderStatusService';
import { PaymentService } from '../services/paymentService';
import { CustomerCreditService } from '../services/customerCreditService';
import { OrderRepository } from '../repositories/orderRepository';
import { OrderEventRepository } from '../repositories/orderEventRepository';
import { InvoiceRepository } from '../repositories/invoiceRepository';
import { CustomerRepository } from '../repositories/customerRepository';
import { Order, OrderMaterialUsage } from '../../types';
import { normalizeMeasurements, normalizeStyleDetails } from '../../services/shared/measurementDefaults';
import { round2 } from '../../domain/inventoryRules';
import {
  addPaymentArgsSchema,
  customerCreditApplyArgsSchema,
  customerCreditHistoryArgsSchema,
  customerCreditRefundArgsSchema,
  idArgsSchema,
  orderCreateSchema,
  orderStatusArgsSchema,
  orderUpdateSchema,
  ordersListQuerySchema,
} from '../../services/shared/ipcSchemas';
import { parseIpcInput } from '../validation/parseIpc';
import { mapOrderEvent, parseMeasurementsJson, parseStyleDetailsJson } from './mappers';

interface OrderHandlersDeps {
  dbManager: SahwaDatabaseManager;
  orderService: OrderService;
  orderStatusService: OrderStatusService;
  paymentService: PaymentService;
  customerCreditService: CustomerCreditService;
  orderRepository: OrderRepository;
  orderEventRepository: OrderEventRepository;
  invoiceRepository: InvoiceRepository;
  customerRepository: CustomerRepository;
}

export function registerOrderHandlers(deps: OrderHandlersDeps): void {
  const {
    dbManager,
    orderService,
    orderStatusService,
    paymentService,
    customerCreditService,
    orderRepository,
    orderEventRepository,
    invoiceRepository,
    customerRepository,
  } = deps;

  const localActorId = () => process.env.SAHWA_ACTOR_ID?.trim() || 'local-user';

  safeIpcHandle(ipcMain, 'orders:events:list', async (_, orderId?: string) => {
    return (orderEventRepository.list(orderId) as any[]).map(mapOrderEvent);
  });

  const mapOrderRows = (rows: any[]) => {
    const materialRows = orderRepository.listMaterialUsages();
    const materialsByOrder = new Map<string, OrderMaterialUsage[]>();
    for (const row of materialRows) {
      const usage: OrderMaterialUsage = {
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
      };
      materialsByOrder.set(row.order_id, [...(materialsByOrder.get(row.order_id) || []), usage]);
    }
    const customerNumberById = new Map((customerRepository.list() as any[]).map((customer) => [customer.id, customer.customer_number ?? undefined]));
    return rows.map(o => {
      const materialUsages = materialsByOrder.get(o.id) || [];
      const legacyFabricCost = materialUsages.length === 0
        ? round2((o.fabric_consumption_meters || 0) * (o.fabric_buy_price_at_order || 0))
        : 0;
      const materialCost = round2(materialUsages.reduce((sum, usage) => sum + usage.totalCost, 0) + legacyFabricCost);
      return {
        id: o.id,
        orderNumber: o.order_number,
        customerId: o.customer_id,
        customerNumber: customerNumberById.get(o.customer_id),
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        thobeTypeId: o.thobe_type_id,
        thobeTypeName: o.thobe_type_name,
        fabricId: o.fabric_id,
        fabricName: o.fabric_name,
        fabricColor: o.fabric_color,
        fabricConsumptionMeters: o.fabric_consumption_meters,
        fabricBuyPriceAtOrder: o.fabric_buy_price_at_order,
        garmentCount: o.garment_count,
        materialUsages,
        materialCost,
        profit: round2((o.total_amount || 0) - materialCost),
        orderDate: o.order_date,
        deliveryDate: o.delivery_date,
        status: o.status,
        totalAmount: o.total_amount,
        paidAmount: o.paid_amount,
        remainingAmount: o.remaining_amount,
        cashReceived: o.cash_received,
        overpaymentAmount: o.overpayment_amount,
        cancellationWriteoffAmount: o.cancellation_writeoff_amount,
        isCustomMeasurement: Boolean(o.is_custom_measurement),
        measurements: parseMeasurementsJson(o.measurements_json),
        styleDetails: parseStyleDetailsJson(o.style_details_json),
        notes: o.notes,
        createdAt: o.created_at
      };
    });
  };

  safeIpcHandle(ipcMain, 'orders:list', async (_, query?: unknown) => {
    const input = parseIpcInput(ordersListQuerySchema, query, 'قائمة الطلبات');
    const paged = input.page !== undefined && input.limit !== undefined;
    const rows = paged ? orderRepository.listPage(input.page as number, input.limit as number) : orderRepository.list();
    const mapped = mapOrderRows(rows);
    if (!paged) return mapped;
    return { items: mapped, total: orderRepository.count() };
  });

  safeIpcHandle(ipcMain, 'orders:create', async (_, raw: unknown) => {
    const input = parseIpcInput(orderCreateSchema, raw, 'بيانات الطلب');
    const settings = dbManager.getSettings();
    const result = orderService.createOrder(input as unknown as Partial<Order>, settings.fabricConsumptionRatePerGarment || 3.5);
    return {
      ...input,
      id: result.orderId,
      orderNumber: result.orderNumber,
      remainingAmount: result.remainingAmount,
      materialUsages: result.materialUsages,
      materialCost: result.materialCost,
      profit: result.profit,
      measurements: normalizeMeasurements(input.measurements as never),
      styleDetails: normalizeStyleDetails(input.styleDetails as never)
    };
  });
  safeIpcHandle(ipcMain, 'orders:update', async (_, raw: unknown) => {
    const input = parseIpcInput(orderUpdateSchema, raw, 'بيانات الطلب');
    const settings = dbManager.getSettings();
    return orderService.updateOrder(input as unknown as Order, settings.fabricConsumptionRatePerGarment || 3.5);
  });

  safeIpcHandle(ipcMain, 'orders:delete', async (_, orderId: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id: orderId }, 'معرّف الطلب');
    return orderService.deleteOrder(input.id);
  });

  safeIpcHandle(ipcMain, 'orders:updateStatus', async (_, request: unknown) => {
    const input = parseIpcInput(orderStatusArgsSchema, request, 'تحديث حالة الطلب');
    return orderStatusService.updateStatus(input.orderId, input.status);
  });

  safeIpcHandle(ipcMain, 'invoices:list', async () => {
    const rows = invoiceRepository.list();
    const orderRows = orderRepository.list() as any[];
    const customerNumberById = new Map((customerRepository.list() as any[]).map((customer) => [customer.id, customer.customer_number ?? undefined]));
    return rows.map(i => ({
      id: i.id,
      visibleInvoiceNumber: i.visible_invoice_number ?? undefined,
      customerNumber: customerNumberById.get(orderRows.find((order) => order.id === i.order_id)?.customer_id),
      invoiceNumber: i.invoice_number,
      orderId: i.order_id,
      customerName: i.customer_name,
      customerPhone: i.customer_phone,
      orderDate: i.order_date,
      totalAmount: i.total_amount,
      paidAmount: i.paid_amount,
      remainingAmount: i.remaining_amount,
      cashReceived: i.cash_received,
      overpaymentAmount: i.overpayment_amount,
      cancellationWriteoffAmount: i.cancellation_writeoff_amount,
      paymentStatus: i.payment_status,
      payments: JSON.parse(i.payments_json || '[]')
    }));
  });

  safeIpcHandle(ipcMain, 'invoices:addPayment', async (_, request: unknown) => {
    const input = parseIpcInput(addPaymentArgsSchema, request, 'بيانات الدفعة');
    return paymentService.addPayment(input.invoiceId, input.amount, input.method, input.note, input.paymentId);
  });

  safeIpcHandle(ipcMain, 'customerCredits:list', async (_, customerId: unknown, filters?: unknown) => {
    const input = parseIpcInput(customerCreditHistoryArgsSchema, { customerId, filters }, 'سجل رصيد العميل');
    return customerCreditService.getCustomerCreditHistory(input.customerId, input.filters || {});
  });
  safeIpcHandle(ipcMain, 'customerCredits:summary', async (_, customerId: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id: customerId }, 'معرّف العميل');
    return customerCreditService.getCustomerCreditSummary(input.id);
  });
  safeIpcHandle(ipcMain, 'customerCredits:diagnostics', async () => {
    return customerCreditService.getDiagnostics();
  });
  safeIpcHandle(ipcMain, 'customerCredits:apply', async (_, request: unknown) => {
    const input = parseIpcInput(customerCreditApplyArgsSchema, request, 'بيانات تطبيق رصيد العميل');
    return customerCreditService.applyCredit({
      customerId: input.customerId,
      targetInvoiceId: input.targetInvoiceId,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      actorId: localActorId()
    });
  });
  safeIpcHandle(ipcMain, 'customerCredits:refund', async (_, request: unknown) => {
    const input = parseIpcInput(customerCreditRefundArgsSchema, request, 'بيانات استرداد رصيد العميل');
    return customerCreditService.refundCredit({
      customerId: input.customerId,
      amount: input.amount,
      method: input.method,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      actorId: localActorId()
    });
  });
  safeIpcHandle(ipcMain, 'customerCredits:getOperation', async (_, operationId: unknown) => {
    const input = parseIpcInput(idArgsSchema, { id: operationId }, 'معرّف عملية الرصيد');
    return customerCreditService.getOperation(input.id);
  });
}
