const fs = require('fs');
const path = require('path');

const project = path.resolve(__dirname, '..');
const filePath = path.join(project, 'src/electron/ipcHandlers.ts');
let source = fs.readFileSync(filePath, 'utf8');

if (!source.includes("import { OrderStatusService } from './services/orderStatusService';")) throw new Error('expected current imports not found');
source = source.replace(
  "import { WhatsAppService } from './services/whatsappService';\n",
  "import { WhatsAppService } from './services/whatsappService';\nimport { OrderService } from './services/orderService';\n"
);
source = source.replace(
  "  const whatsappService = new WhatsAppService(notificationRepository, orderRepository, orderEventRepository);\n",
  "  const whatsappService = new WhatsAppService(notificationRepository, orderRepository, orderEventRepository);\n  const orderService = new OrderService(orderRepository, inventoryService, cashRepository, orderEventRepository, db);\n"
);
const startMarker = "  safeIpcHandle(ipcMain, 'orders:create'";
const endMarker = "  safeIpcHandle(ipcMain, 'orders:update'";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) throw new Error('order create block markers not found');
const replacement = `  safeIpcHandle(ipcMain, 'orders:create', async (_, orderData: Partial<Order>) => {
    const settings = dbManager.getSettings();
    const result = orderService.createOrder(orderData, settings.fabricConsumptionRatePerGarment || 3.5);
    return {
      ...orderData,
      id: result.orderId,
      orderNumber: result.orderNumber,
      remainingAmount: result.remainingAmount,
      materialUsages: result.materialUsages,
      materialCost: result.materialCost,
      profit: result.profit,
      measurements: normalizeMeasurements(orderData.measurements),
      styleDetails: normalizeStyleDetails(orderData.styleDetails)
    };
  });
`;
source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(filePath, source, 'utf8');
console.log('orders:create moved to OrderService');
