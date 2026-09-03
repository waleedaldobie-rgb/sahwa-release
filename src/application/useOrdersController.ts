import { createSafeId } from '../domain/idGenerator';
import { validateEntity, validateEntityErrors } from '../domain/validation';
import { Invoice, Order, OrderStatus, PaymentRecord } from '../types';
import { AppSession } from './sessionTypes';

export function useOrdersController(session: AppSession) {
  const { data, showToast, executeCrud, loadAppData, persistData, refreshSlices, offerDeleteUndo, gateway } = session;

  const handleSaveOrder = async (order: Order): Promise<boolean | Order> => {
    const validationErrors = validateEntityErrors('order', order);
    if (validationErrors.length > 0) {
      showToast(validationErrors.join('\n'), 'danger');
      return false;
    }

    const result = await executeCrud('جاري حفظ بيانات الطلب واستقطاع الأقمشة...', async () => {
      let alerts: string[] = [];
      let savedOrder: Order = order;
      if (gateway.createOrder && gateway.updateOrder) {
        const exists = data?.orders.some((o) => o.id === order.id);
        if (exists) {
          const updated = await gateway.updateOrder(order, 0);
          if (updated === false) return false;
        } else {
          const created = await gateway.createOrder(order, 0);
          savedOrder = { ...order, id: created.orderId, orderNumber: String(created.orderNumber), remainingAmount: created.remainingAmount };
        }
        alerts = await loadAppData();
      } else {
        if (!data) return false;
        const exists = data.orders.some((o) => o.id === order.id);
        const updatedOrders = exists
          ? data.orders.map((o) => (o.id === order.id ? order : o))
          : [order, ...data.orders];

        const invId = 'INV-' + order.orderNumber;
        const existingInvoice = data.invoices.find((i) => i.id === invId || i.orderId === order.id);

        const nextVisibleInvoiceNumber = data.invoices.reduce((max, invoice) => Math.max(max, Number(invoice.visibleInvoiceNumber) || 0), 0) + 1;
        const newInvoice: Invoice = {
          id: existingInvoice ? existingInvoice.id : invId,
          visibleInvoiceNumber: existingInvoice?.visibleInvoiceNumber ?? nextVisibleInvoiceNumber,
          invoiceNumber: existingInvoice ? existingInvoice.invoiceNumber : invId,
          orderId: order.id,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          orderDate: order.orderDate,
          totalAmount: order.totalAmount,
          paidAmount: order.paidAmount,
          remainingAmount: order.remainingAmount,
          paymentStatus: order.remainingAmount === 0 ? 'paid' : order.paidAmount > 0 ? 'partial' : 'unpaid',
          payments: existingInvoice
            ? existingInvoice.payments
            : (order.paidAmount > 0
                ? [
                    {
                      id: createSafeId('PAY'),
                      invoiceId: invId,
                      orderId: order.id,
                      amount: order.paidAmount,
                      paymentDate: order.orderDate,
                      method: 'cash',
                      note: 'دفعة أولى عند حجز الطلب',
                    },
                  ]
                : []),
        };

        const invoiceExists = data.invoices.some((i) => i.id === newInvoice.id);
        const updatedInvoices = invoiceExists
          ? data.invoices.map((i) => (i.id === newInvoice.id ? newInvoice : i))
          : [newInvoice, ...data.invoices];

        alerts = await persistData({ ...data, orders: updatedOrders, invoices: updatedInvoices });
      }

      if (alerts && alerts.length > 0) {
        showToast(`تم حفظ الطلب واستقطاع القماش. ⚠️ ${alerts[0]}`, 'warning');
      } else {
        showToast('تم حفظ الطلب بنجاح وخصم القماش من المخزون', 'success');
      }
      return savedOrder;
    });
    return result ?? false;
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    await executeCrud('جاري تحديث حالة الطلب...', async () => {
      if (gateway.updateOrderStatus) {
        await gateway.updateOrderStatus({ orderId, status: newStatus });
        await loadAppData();
        showToast('تم تحديث حالة الطلب بنجاح', 'success');
      } else {
        if (!data) return;
        const updatedOrders = data.orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
        await persistData({ ...data, orders: updatedOrders });
        showToast('تم تحديث حالة الطلب بنجاح', 'success');
      }
    });
  };

  const handleDeleteOrder = async (orderId: string) => {
    const beforeDelete = data ? JSON.parse(JSON.stringify(data)) as typeof data : null;
    await executeCrud('جاري حذف الطلب وإرجاع كمية القماش للمخزون...', async () => {
      if (gateway.deleteOrder) {
        await gateway.deleteOrder(orderId);
        await loadAppData();
        if (beforeDelete) offerDeleteUndo(beforeDelete, 'تم حذف الطلب وإرجاع القماش');
      } else {
        if (!data) return;
        const targetOrder = data.orders.find((o) => o.id === orderId);
        if (!targetOrder) throw new Error('الطلب غير موجود');

        const updatedFabrics = data.fabrics.map((f) => {
          if (f.id === targetOrder.fabricId && targetOrder.status !== 'cancelled') {
            return {
              ...f,
              quantityMeters: Number(
                (f.quantityMeters + (targetOrder.fabricConsumptionMeters || 0)).toFixed(2)
              ),
            };
          }
          return f;
        });

        const updatedOrders = data.orders.filter((o) => o.id !== orderId);
        const updatedInvoices = data.invoices.filter((i) => i.orderId !== orderId);

        const alerts = await persistData({
          ...data,
          fabrics: updatedFabrics,
          orders: updatedOrders,
          invoices: updatedInvoices,
        });

        if (alerts && alerts.length > 0) {
          showToast(`تم حذف الطلب وإرجاع القماش. ⚠️ ${alerts[0]}`, 'warning');
        } else {
          showToast('تم حذف الطلب وإرجاع كمية القماش للمخزون بنجاح', 'success');
        }
      }
    });
  };

  const handleAddPayment = async (invoiceId: string, payment: PaymentRecord) => {
    const targetInvoice = data?.invoices.find((i) => i.id === invoiceId);
    const err = validateEntity('payment', payment, { targetInvoice });
    if (err) {
      showToast(err, 'danger');
      return;
    }
    const paymentMethod = payment.method;
    if (paymentMethod === 'customer_credit') {
      showToast('طريقة customer_credit لها مسار رصيد عميل مستقل', 'danger');
      return;
    }

    await executeCrud('جاري تسجيل الدفعة المالية...', async () => {
      if (gateway.addPayment) {
        await gateway.addPayment({
          invoiceId,
          amount: payment.amount,
          method: paymentMethod,
          note: payment.note || '',
          paymentId: payment.id,
        });
        await refreshSlices(['orders', 'invoices', 'cashTransactions', 'orderEvents']);
        showToast('تم إضافة الدفعة بنجاح', 'success');
      } else {
        if (!data) return;
        const updatedInvoices = data.invoices.map((inv) => {
          if (inv.id !== invoiceId) return inv;

          const newPaidAmount = inv.paidAmount + payment.amount;
          const newRemainingAmount = Math.max(0, inv.totalAmount - newPaidAmount);
          const newStatus = newRemainingAmount === 0 ? 'paid' : 'partial';

          return {
            ...inv,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            paymentStatus: newStatus as Invoice['paymentStatus'],
            payments: [...inv.payments, payment],
          };
        });

        let updatedOrders = data.orders;
        if (targetInvoice) {
          updatedOrders = data.orders.map((ord) => {
            if (ord.id !== targetInvoice.orderId) return ord;
            const newPaid = ord.paidAmount + payment.amount;
            const newRemaining = Math.max(0, ord.totalAmount - newPaid);
            return { ...ord, paidAmount: newPaid, remainingAmount: newRemaining };
          });
        }

        await persistData({ ...data, invoices: updatedInvoices, orders: updatedOrders });
        showToast('تم إضافة الدفعة بنجاح', 'success');
      }
    });
  };

  const handleSendWhatsAppNotice = async (phone: string, name: string, orderNum: string, statusText: string) => {
    await executeCrud('جاري إرسال إشعار الواتساب...', async () => {
      const opened = await window.electronAPI.sendWhatsAppNotice({
        phone,
        customerName: name,
        orderNumber: orderNum,
        statusText,
      });
      if (opened === false) {
        throw new Error('تعذر فتح واتساب. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.');
      }
      showToast(`تم توجيه إشعار واتساب للعميل ${name}`, 'success');
      await loadAppData();
    });
  };

  return {
    handleSaveOrder,
    handleUpdateOrderStatus,
    handleDeleteOrder,
    handleAddPayment,
    handleSendWhatsAppNotice,
  };
}
