import { SahwaDatabaseManager } from './db';
import { CustomerRepository } from './repositories/customerRepository';
import { CashRepository } from './repositories/cashRepository';
import { CustomerCreditRepository } from './repositories/customerCreditRepository';
import { InventoryRepository } from './repositories/inventoryRepository';
import { OrderEventRepository } from './repositories/orderEventRepository';
import { AccountingRepository } from './repositories/accountingRepository';
import { OrderRepository } from './repositories/orderRepository';
import { OrderWriteRepository } from './repositories/orderWriteRepository';
import { InvoiceRepository } from './repositories/invoiceRepository';
import { NotificationRepository } from './repositories/notificationRepository';
import { FabricRepository } from './repositories/fabricRepository';
import { AccessoryRepository } from './repositories/accessoryRepository';
import { ThobeTypeRepository } from './repositories/thobeTypeRepository';
import { ColorRepository } from './repositories/colorRepository';
import { CustomerService } from './services/customerService';
import { InventoryService } from './services/inventoryService';
import { AccountingService } from './services/accountingService';
import { PaymentService } from './services/paymentService';
import { CustomerCreditService } from './services/customerCreditService';
import { OrderStatusService } from './services/orderStatusService';
import { WhatsAppService } from './services/whatsappService';
import { OrderService } from './services/orderService';
import { registerCustomerHandlers } from './ipc/registerCustomerHandlers';
import { registerCatalogHandlers } from './ipc/registerCatalogHandlers';
import { registerInventoryAccountingHandlers } from './ipc/registerInventoryAccountingHandlers';
import { registerOrderHandlers } from './ipc/registerOrderHandlers';
import { registerSystemHandlers } from './ipc/registerSystemHandlers';

/**
 * Composition root: builds all repositories/services once, then delegates
 * channel registration to domain-split modules (src/electron/ipc/).
 */
export function registerIpcHandlers(dbManager: SahwaDatabaseManager): void {
  const db = dbManager.getRawDb();

  const customerRepository = new CustomerRepository(db);
  const cashRepository = new CashRepository(db);
  const customerCreditRepository = new CustomerCreditRepository(db);
  const inventoryRepository = new InventoryRepository(db);
  const orderEventRepository = new OrderEventRepository(db);
  const accountingRepository = new AccountingRepository(db);
  const orderRepository = new OrderRepository(db);
  const orderWriteRepository = new OrderWriteRepository(db);
  const invoiceRepository = new InvoiceRepository(db);
  const notificationRepository = new NotificationRepository(db);
  const fabricRepository = new FabricRepository(db);
  const accessoryRepository = new AccessoryRepository(db);
  const thobeTypeRepository = new ThobeTypeRepository(db);
  const colorRepository = new ColorRepository(db);

  const customerService = new CustomerService(customerRepository, db);
  const inventoryService = new InventoryService(inventoryRepository, db);
  const accountingService = new AccountingService(accountingRepository, inventoryService, cashRepository, db);
  const customerCreditService = new CustomerCreditService(customerCreditRepository, invoiceRepository, orderWriteRepository, cashRepository, db);
  const paymentService = new PaymentService(invoiceRepository, orderWriteRepository, cashRepository, customerCreditService, orderEventRepository, db);
  const orderStatusService = new OrderStatusService(orderRepository, orderWriteRepository, inventoryService, orderEventRepository, invoiceRepository, db);
  const whatsappService = new WhatsAppService(notificationRepository, orderRepository, orderEventRepository);
  const orderService = new OrderService(orderRepository, orderWriteRepository, inventoryService, cashRepository, customerCreditRepository, orderEventRepository, invoiceRepository, db);

  registerCustomerHandlers(customerService);
  registerCatalogHandlers({ fabricRepository, accessoryRepository, thobeTypeRepository, colorRepository });
  registerInventoryAccountingHandlers({ inventoryService, accountingService, cashRepository, orderRepository });
  registerOrderHandlers({
    dbManager,
    orderService,
    orderStatusService,
    paymentService,
    customerCreditService,
    orderRepository,
    orderEventRepository,
    invoiceRepository,
    customerRepository,
  });
  registerSystemHandlers({ dbManager, notificationRepository, whatsappService });
}
