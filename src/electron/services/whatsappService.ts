import { OrderEvent } from '../../types';
import { NotificationRepository, NotificationRow } from '../repositories/notificationRepository';
import { OrderEventRepository } from '../repositories/orderEventRepository';
import { OrderRepository } from '../repositories/orderRepository';
import { createSafeId } from '../../domain/idGenerator';

export type WhatsAppDeliveryResult = 'opened' | 'failed';

export class WhatsAppService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly orderRepository: OrderRepository,
    private readonly eventRepository: OrderEventRepository
  ) {}

  prepareMessage(phone: string, customerName: string, orderNumber: string, statusText: string): { url: string; message: string; orderId?: string } {
    const cleanPhone = phone.replace(/\D/g, '');
    const internationalPhone = cleanPhone.startsWith('0') ? '966' + cleanPhone.slice(1) : cleanPhone;
    const message = `مرحباً بك أ/ ${customerName}، نفيدك بنتيجة متابعة طلبك رقم (#${orderNumber}) لدى صهوة للخياطة. حالياً: ${statusText}. يسعدنا تواصلكم دائماً!`;
    const order = this.orderRepository.findByOrderNumber(orderNumber);
    return { url: `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`, message, orderId: order?.id };
  }

  private sourceId(phone: string, orderNumber: string, statusText: string): string {
    return `${phone}|${orderNumber}|${statusText}`;
  }

  beginDelivery(
    phone: string,
    customerName: string,
    orderNumber: string,
    statusText: string,
    prepared: { orderId?: string }
  ): NotificationRow {
    const sourceId = this.sourceId(phone, orderNumber, statusText);
    const existing = this.notificationRepository.findBySource('whatsapp', sourceId);
    if (existing) return existing;
    return this.notificationRepository.upsert({
      id: createSafeId('NOTIF'),
      type: 'whatsapp',
      title: `إرسال واتساب قيد التنفيذ - طلب #${orderNumber}`,
      message: `جاري تجهيز رسالة واتساب للعميل ${customerName} (${phone}) - الحالة: ${statusText}`,
      date: new Date().toLocaleString('ar-SA'),
      read: false,
      customerPhone: phone,
      orderId: prepared.orderId || null,
      status: 'pending',
      source: 'whatsapp',
      sourceId,
      retryCount: 0,
      retryHistory: []
    });
  }

  recordDeliveryResult(
    phone: string,
    customerName: string,
    orderNumber: string,
    statusText: string,
    prepared: { orderId?: string },
    result: WhatsAppDeliveryResult,
    error?: string
  ): NotificationRow {
    const sourceId = this.sourceId(phone, orderNumber, statusText);
    const pending = this.notificationRepository.findBySource('whatsapp', sourceId)
      || this.beginDelivery(phone, customerName, orderNumber, statusText, prepared);
    const status = result === 'opened' ? 'sent' : 'failed';
    const updated = this.notificationRepository.markDeliveryResult(
      'whatsapp',
      sourceId,
      status,
      error || (status === 'failed' ? 'تعذر فتح رابط واتساب' : undefined),
      `${status === 'sent' ? 'تم فتح' : 'فشل فتح'} واتساب - طلب #${orderNumber}`,
      `${status === 'sent' ? 'تم فتح' : 'فشل فتح'} رسالة واتساب للعميل ${customerName} (${phone}) - الحالة: ${statusText}`
    ) || pending;
    const now = new Date().toISOString();
    if (prepared.orderId) {
      const event: OrderEvent = {
        id: `EVT-WHATSAPP-${updated.id}-${status}-${updated.retryCount}`,
        orderId: prepared.orderId,
        type: 'whatsapp',
        title: status === 'sent' ? 'تم فتح رسالة واتساب' : 'فشل فتح رسالة واتساب',
        description: `${status === 'sent' ? 'تم فتح' : 'فشل فتح'} رسالة واتساب للعميل ${customerName} عن حالة الطلب: ${statusText}.`,
        actor: 'النظام',
        metadata: { phone, orderNumber, statusText, result: status, error: error || undefined, retryCount: updated.retryCount },
        createdAt: now
      };
      this.eventRepository.insert(event);
    }
    return updated;
  }

  retry(notificationId: string): NotificationRow {
    return this.notificationRepository.retry(notificationId);
  }
}
