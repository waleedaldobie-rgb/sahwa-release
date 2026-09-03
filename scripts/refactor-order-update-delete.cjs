const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/electron/ipcHandlers.ts');
let source = fs.readFileSync(filePath, 'utf8');

const updateStart = source.indexOf("  safeIpcHandle(ipcMain, 'orders:update'");
const deleteComment = source.indexOf("  /**\n   * TRANSACTION REQUIREMENT: Delete order", updateStart);
if (updateStart < 0 || deleteComment < 0) throw new Error('orders:update markers not found');
const updateReplacement = `  safeIpcHandle(ipcMain, 'orders:update', async (_, updatedOrder: Order) => {
    const settings = dbManager.getSettings();
    return orderService.updateOrder(updatedOrder, settings.fabricConsumptionRatePerGarment || 3.5);
  });

`;
source = source.slice(0, updateStart) + updateReplacement + source.slice(deleteComment);

const deleteStart = source.indexOf("  /**\n   * TRANSACTION REQUIREMENT: Delete order");
const statusComment = source.indexOf("  /**\n   * TRANSACTION REQUIREMENT: Status Change", deleteStart);
if (deleteStart < 0 || statusComment < 0) throw new Error('orders:delete markers not found');
const deleteReplacement = `  safeIpcHandle(ipcMain, 'orders:delete', async (_, orderId: string) => {
    return orderService.deleteOrder(orderId);
  });

`;
source = source.slice(0, deleteStart) + deleteReplacement + source.slice(statusComment);
fs.writeFileSync(filePath, source, 'utf8');
console.log('orders:update and orders:delete moved to OrderService');
