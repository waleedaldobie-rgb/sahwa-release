// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Order, Invoice, Customer, FabricItem, AccessoryItem, ThobeType, OrderStatus, CustomerMeasurements, CustomerStyleDetails, UserPreferences, MeasurementHistoryRecord, OrderEvent } from '../types';
import { createSafeId } from '../domain/idGenerator';
import { EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS } from '../services/shared/measurementDefaults';
import { Card, Button, Input, Select, Modal, EmptyState, Badge, SortHeader, SortDirection, SegmentedControl, Tooltip, getOrderStatusBadgeVariant } from './ui';
import { ConfirmModal } from './ConfirmModal';
import { MeasurementsTableForm, draftKeyFor } from './MeasurementsTableForm';
import { PrintableInvoice } from './PrintableInvoice';
import {
  Scissors,
  Search,
  Plus,
  Printer,
  Calendar,
  History,
  Ruler,
  Trash2,
  Save,
  User,
  Hash,
  ShoppingBag,
  CreditCard,
  Notebook,
  MessageCircle,
  Play,
  CheckCircle2,
  PackageCheck,
  Clock3,
  CircleDollarSign,
  Warehouse,
  Send,
  MoreHorizontal
} from 'lucide-react';

const ORDER_STATUS_STEPS: Array<{ id: OrderStatus; label: string; description: string; icon: React.ReactNode }> = [
  { id: 'new', label: 'جديد', description: 'تم استلام الطلب', icon: <Scissors className="h-4 w-4" aria-hidden="true" /> },
  { id: 'processing', label: 'تحت التنفيذ', description: 'قيد الخياطة', icon: <Play className="h-4 w-4" aria-hidden="true" /> },
  { id: 'ready', label: 'جاهز', description: 'بانتظار التسليم', icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> },
  { id: 'delivered', label: 'مُسلم', description: 'اكتمل الطلب', icon: <PackageCheck className="h-4 w-4" aria-hidden="true" /> }
];

const OrderStatusStepper: React.FC<{
  currentStatus: OrderStatus;
  onStatusSelect: (status: OrderStatus) => void;
}> = ({ currentStatus, onStatusSelect }) => {
  const currentIndex = ORDER_STATUS_STEPS.findIndex((step) => step.id === currentStatus);
  return (
    <div className="sahwa-status-stepper" role="group" aria-label="مسار حالة الطلب">
      {ORDER_STATUS_STEPS.map((step, index) => {
        const state = index < currentIndex ? 'complete' : index === currentIndex ? 'active' : 'upcoming';
        return (
          <button
            key={step.id}
            type="button"
            className="sahwa-status-step"
            data-state={state}
            aria-current={state === 'active' ? 'step' : undefined}
            aria-label={`${step.label}: ${step.description}`}
            onClick={() => onStatusSelect(step.id)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/20" aria-hidden="true">
              {step.icon}
            </span>
            <span className="min-w-0 text-right">
              <span className="block text-xs font-black">{step.label}</span>
              <span className="mt-0.5 block text-[10px] font-bold opacity-70">{step.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export interface OrdersViewProps {
  orders: Order[];
  invoices?: Invoice[];
  customers: Customer[];
  fabrics: FabricItem[];
  accessories?: AccessoryItem[];
  thobeTypes: ThobeType[];
  userPreferences?: UserPreferences;
  onSaveOrder: (order: Order) => Promise<boolean | void | Order> | boolean | void;
  onSaveCustomer?: (customer: Customer) => Promise<void> | void;
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  onDeleteOrder?: (orderId: string) => void;
  onSendWhatsAppNotice: (phone: string, name: string, orderNum: string, statusText: string) => void;
  showToast: (msg: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
  initialSelectedOrder?: Order | null;
  openNewOrderTrigger?: boolean;
  initialCustomerForOrder?: Customer | null;
  initialMeasurementForOrder?: MeasurementHistoryRecord | null;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  invoices = [],
  customers,
  fabrics,
  accessories = [],
  thobeTypes,
  userPreferences,
  onSaveOrder,
  onSaveCustomer,
  onUpdateOrderStatus,
  onDeleteOrder,
  onSendWhatsAppNotice,
  showToast,
  initialSelectedOrder,
  openNewOrderTrigger,
  initialCustomerForOrder,
  initialMeasurementForOrder
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderSort, setOrderSort] = useState<{ key: 'orderNumber' | 'customerName' | 'deliveryDate' | 'totalAmount' | 'remainingAmount' | 'status'; direction: SortDirection }>({ key: 'orderNumber', direction: 'asc' });
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialSelectedOrder || null);
  const [measurementDraft, setMeasurementDraft] = useState<Order | null>(initialSelectedOrder || null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(!!initialSelectedOrder);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(!!openNewOrderTrigger);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(false);

  useEffect(() => {
    setMeasurementDraft(selectedOrder);
  }, [selectedOrder?.id]);


  // Print Mode State
  const [printableOrder, setPrintableOrder] = useState<Order | null>(null);

  // New Order Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerForOrder?.id || '');
  const [isCreatingCustomerInline, setIsCreatingCustomerInline] = useState(false);
  const [isMeasurementHistoryOpen, setIsMeasurementHistoryOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [inlineCustomer, setInlineCustomer] = useState<Customer | null>(null);
  const [selectedThobeTypeId, setSelectedThobeTypeId] = useState('');
  const [selectedFabricId, setSelectedFabricId] = useState('');
  const [orderDate] = useState(new Date().toISOString().split('T')[0]);
  
  const defaultDelivery = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [deliveryDate, setDeliveryDate] = useState(defaultDelivery);
  
  const [totalAmount, setTotalAmount] = useState<number>(220);
  const [paidAmount, setPaidAmount] = useState<number>(100);
  const [isTotalAmountManuallyEdited, setIsTotalAmountManuallyEdited] = useState(false);
  const [garmentCount, setGarmentCount] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const [selectedAccessoryId, setSelectedAccessoryId] = useState('');
  const [accessoryQuantity, setAccessoryQuantity] = useState('1');
  const [selectedMaterials, setSelectedMaterials] = useState<Array<{ itemType: 'accessory'; itemId: string; itemName: string; quantity: number; unit: string; unitCostAtUsage: number }>>([]);

  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const selectedCustomer = selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) : undefined;
  const selectedCustomerHistory = selectedCustomer?.measurementHistory || [];

  const handleUseHistoryForOrder = (historyRecord: MeasurementHistoryRecord) => {
    setNewOrderMeasurements({ ...historyRecord.measurements });
    setNewOrderStyleDetails({ ...historyRecord.styleDetails });
    setIsMeasurementHistoryOpen(false);
    setHasUnsavedChanges(true);
    showToast(`تم تطبيق نسخة ${historyRecord.savedAt} على هذا الطلب فقط`, 'info');
  };

  // Filtered Orders
  const hasActiveOrderFilters = Boolean(searchTerm.trim()) || statusFilter !== 'all';
  const filteredOrders = orders.filter((ord) => {
    const matchesSearch =
      ord.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ord.customerPhone.includes(searchTerm) ||
      ord.orderNumber.includes(searchTerm);

    const matchesStatus = statusFilter === 'all' || ord.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const toggleOrderSort = (key: typeof orderSort.key) => {
    setOrderSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };
  const orderSortNumber = (order: Order) => Number.parseInt(order.orderNumber.replace(/\D/g, ''), 10) || Number.MAX_SAFE_INTEGER;
  const orderStatusRank: Record<OrderStatus, number> = { new: 1, processing: 2, ready: 3, delivered: 4, cancelled: 5 };
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let comparison = 0;
    if (orderSort.key === 'orderNumber') comparison = orderSortNumber(a) - orderSortNumber(b);
    else if (orderSort.key === 'customerName') comparison = a.customerName.localeCompare(b.customerName, 'ar');
    else if (orderSort.key === 'deliveryDate') comparison = a.deliveryDate.localeCompare(b.deliveryDate);
    else if (orderSort.key === 'totalAmount') comparison = a.totalAmount - b.totalAmount;
    else if (orderSort.key === 'remainingAmount') comparison = a.remainingAmount - b.remainingAmount;
    else comparison = orderStatusRank[a.status] - orderStatusRank[b.status];
    if (comparison === 0) comparison = a.id.localeCompare(b.id);
    return orderSort.direction === 'asc' ? comparison : -comparison;
  });

  const [detailTab, setDetailTab] = useState<'info' | 'measurements' | 'events'>('info');
  const [newOrderMeasurements, setNewOrderMeasurements] = useState<CustomerMeasurements>(
    initialMeasurementForOrder?.measurements || initialCustomerForOrder?.measurements || EMPTY_MEASUREMENTS
  );
  const [newOrderStyleDetails, setNewOrderStyleDetails] = useState<CustomerStyleDetails>(
    initialMeasurementForOrder?.styleDetails || initialCustomerForOrder?.styleDetails || EMPTY_STYLE_DETAILS
  );

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialMeasurementAppliedRef = useRef(false);

  const loadOrderEvents = async (orderId: string) => {
    setIsEventsLoading(true);
    try {
      const events = window.electronAPI.getOrderEvents
        ? await window.electronAPI.getOrderEvents(orderId)
        : (await window.electronAPI.getData()).orderEvents?.filter((event) => event.orderId === orderId) || [];
      setOrderEvents(events);
    } catch (error) {
      console.error('تعذر تحميل سجل أحداث الطلب', error);
      setOrderEvents([]);
    } finally {
      setIsEventsLoading(false);
    }
  };

  useEffect(() => {
    if (isDetailModalOpen && selectedOrder) {
      void loadOrderEvents(selectedOrder.id);
    } else {
      setOrderEvents([]);
    }
  }, [isDetailModalOpen, selectedOrder?.id]);
  const skipNextDirtyCheck = useRef(true);

  useEffect(() => {
    if (skipNextDirtyCheck.current) {
      skipNextDirtyCheck.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [
    selectedCustomerId,
    selectedThobeTypeId,
    selectedFabricId,
    orderDate,
    deliveryDate,
    totalAmount,
    paidAmount,
    garmentCount,
    notes,
    newOrderMeasurements,
    newOrderStyleDetails,
    selectedMaterials,
  ]);

  useEffect(() => {
    if (selectedCustomerId && customers.length > 0) {
      const cust = customers.find((c) => c.id === selectedCustomerId);
      if (cust) {
        setInlineCustomer(cust);
        const preset = initialMeasurementForOrder && !initialMeasurementAppliedRef.current
          ? initialMeasurementForOrder
          : null;
        setNewOrderMeasurements({ ...(preset?.measurements || cust.measurements) });
        setNewOrderStyleDetails({ ...(preset?.styleDetails || cust.styleDetails) });
        if (preset) initialMeasurementAppliedRef.current = true;
      }
    }
  }, [selectedCustomerId, customers]);

  const handleOpenNewOrder = () => {
    setIsSubmittingOrder(false);
    initialMeasurementAppliedRef.current = true;
    setIsTotalAmountManuallyEdited(false);
    setGarmentCount(1);
    setSelectedCustomerId('');
    setInlineCustomer(null);
    setIsMeasurementHistoryOpen(false);
    setIsCreatingCustomerInline(false);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewOrderMeasurements({ ...EMPTY_MEASUREMENTS });
    setNewOrderStyleDetails({ ...EMPTY_STYLE_DETAILS });
    setSelectedAccessoryId('');
    setAccessoryQuantity('1');
    setSelectedMaterials([]);
    if (thobeTypes.length > 0) {
      setSelectedThobeTypeId(thobeTypes[0].id);
      setTotalAmount(thobeTypes[0].defaultPrice);
    }
    if (fabrics.length > 0) {
      setSelectedFabricId(fabrics[0].id);
    }
    skipNextDirtyCheck.current = true;
    setHasUnsavedChanges(false);
    setIsNewOrderModalOpen(true);
  };

  const handleThobeTypeChange = (thobeId: string) => {
    setSelectedThobeTypeId(thobeId);
    const found = thobeTypes.find((t) => t.id === thobeId);
    if (found) {
      setTotalAmount(found.defaultPrice * garmentCount);
      setIsTotalAmountManuallyEdited(false);
    }
  };

  const handleAddAccessoryMaterial = () => {
    const accessory = accessories.find((item) => item.id === selectedAccessoryId);
    const quantity = Number(accessoryQuantity);
    if (!accessory || !Number.isFinite(quantity) || quantity <= 0) {
      showToast('اختر المستلزم وأدخل كمية صحيحة', 'danger');
      return;
    }
    const alreadyAdded = selectedMaterials.find((material) => material.itemId === accessory.id);
    const nextQuantity = (alreadyAdded?.quantity || 0) + quantity;
    if (nextQuantity > accessory.quantity) {
      showToast(`الكمية المتاحة من ${accessory.name} هي ${accessory.quantity} ${accessory.unit}`, 'danger');
      return;
    }
    setSelectedMaterials((current) => [
      ...current.filter((material) => material.itemId !== accessory.id),
      { itemType: 'accessory', itemId: accessory.id, itemName: accessory.name, quantity: nextQuantity, unit: accessory.unit, unitCostAtUsage: accessory.purchasePrice || 0 }
    ]);
    setAccessoryQuantity('1');
  };

  const handleRemoveAccessoryMaterial = (itemId: string) => {
    setSelectedMaterials((current) => current.filter((material) => material.itemId !== itemId));
  };

  const handleCreateOrder = async () => {
    if (isSubmittingOrder) return;

    let customer = inlineCustomer || customers.find((c) => c.id === selectedCustomerId);
    let shouldPersistCustomer = false;

    if (isCreatingCustomerInline) {
      const name = newCustomerName.trim();
      const phone = newCustomerPhone.trim();
      if (!name || !phone) {
        showToast('يرجى إدخال اسم العميل ورقم الجوال للعميل الجديد', 'danger');
        return;
      }

      const existingCustomer = customers.find((c) => c.phone.trim() === phone);
      customer = existingCustomer || {
        id: createSafeId('CUS'),
        name,
        phone,
        createdAt: new Date().toISOString(),
        measurements: { ...newOrderMeasurements },
        styleDetails: { ...newOrderStyleDetails },
        measurementHistory: []
      };
      shouldPersistCustomer = !existingCustomer;
    }

    if (!customer) {
      showToast('يرجى اختيار العميل أو إدخال بيانات العميل الجديد', 'danger');
      return;
    }

    if (totalAmount < 0 || paidAmount < 0) {
      showToast('المبالغ المالية لا يمكن أن تكون سالبة', 'danger');
      return;
    }

    if (paidAmount > totalAmount) {
      showToast('مبلغ العربون لا يمكن أن يتجاوز السعر الكلي للطلب', 'danger');
      return;
    }

    if (garmentCount < 1) {
      showToast('عدد الثياب لا يمكن أن يكون أقل من 1', 'danger');
      return;
    }

    const thobe = thobeTypes.find((t) => t.id === selectedThobeTypeId) || null;
    if (!thobe) {
      showToast('يرجى اختيار نوع الثوب أولاً', 'danger');
      return;
    }

    const fabric = fabrics.find((f) => f.id === selectedFabricId);
    if (!fabric) {
      showToast('يرجى اختيار القماش واللون أولاً', 'danger');
      return;
    }

    const requiredMeasurements: Array<[keyof CustomerMeasurements, string]> = [
      ['frontLength', 'طول أمام'],
      ['backLength', 'طول خلف'],
      ['shoulderWidth', 'الكتف']
    ];
    const missingMeasurements = requiredMeasurements
      .filter(([key]) => !String(newOrderMeasurements[key] || '').trim())
      .map(([, label]) => label);
    if (missingMeasurements.length > 0) {
      showToast(`يرجى إدخال القياسات الأساسية قبل الحفظ: ${missingMeasurements.join('، ')}`, 'danger');
      return;
    }

    setIsSubmittingOrder(true);
    const newOrderNumber = '';
    const newOrder: Order = {
      id: createSafeId('ORD'),
      ...(newOrderNumber ? { orderNumber: newOrderNumber } : {}),
      customerId: customer.id,
      customerNumber: customer.customerNumber,
      customerName: customer.name,
      customerPhone: customer.phone,
      thobeTypeId: thobe.id,
      thobeTypeName: thobe.name,
      fabricId: fabric.id,
      fabricName: fabric.name,
      fabricColor: fabric.color,
      garmentCount,
      orderDate,
      deliveryDate,
      status: 'new',
      totalAmount,
      paidAmount,
      remainingAmount,
      isCustomMeasurement: true,
      measurements: newOrderMeasurements,
      styleDetails: newOrderStyleDetails,
      notes,
      materialUsages: selectedMaterials,
      createdAt: new Date().toISOString()
    };

    try {
      if (shouldPersistCustomer) await onSaveCustomer?.(customer);
      const savedOrder = await onSaveOrder(newOrder);
      if (!savedOrder) {
        showToast('تعذر حفظ الطلب. يرجى المحاولة مرة أخرى.', 'danger');
        return;
      }
      try {
        localStorage.removeItem(draftKeyFor(customer.name, customer.phone, 'new-order'));
      } catch { }
      const actualOrderNumber = savedOrder && typeof savedOrder === 'object' ? savedOrder.orderNumber : newOrderNumber;
      showToast(`تم تسجيل الطلب الجديد رقم (#${actualOrderNumber}) بنجاح!`, 'success');
      setHasUnsavedChanges(false);
      setIsNewOrderModalOpen(false);
    } catch {
      showToast('تعذر حفظ الطلب. يرجى المحاولة مرة أخرى.', 'danger');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleCloseNewOrder = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
      return;
    }
    setIsNewOrderModalOpen(false);
  };

  useEffect(() => {
    if (!isNewOrderModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleCreateOrder();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const getStatusText = (status: OrderStatus) => {
    switch (status) {
      case 'new': return 'جديد';
      case 'processing': return 'تحت التنفيذ';
      case 'ready': return 'جاهز للتسليم';
      case 'delivered': return 'تم التسليم';
      case 'cancelled': return 'ملغى';
    }
  };

  const getWhatsAppStatusText = (status: OrderStatus) => {
    switch (status) {
      case 'new': return 'تم استلام الطلب وجارٍ التجهيز';
      case 'processing': return 'الطلب تحت التنفيذ لدى الخياط';
      case 'ready': return 'الطلب جاهز للاستلام';
      case 'delivered': return 'تم تسليم الطلب بنجاح';
      case 'cancelled': return 'تم إلغاء الطلب';
    }
  };

  const handleSaveMeasurementDraft = async () => {
    if (!selectedOrder || !measurementDraft) return;
    const saved = await onSaveOrder(measurementDraft);
    if (saved === false) return;
    setSelectedOrder(measurementDraft);
    showToast('تم تحديث المقاسات بنجاح', 'success');
  };

  const handleCancelOrder = () => {
    if (!orderToCancel) return;
    if (!cancellationReason.trim()) {
      showToast('سبب إلغاء الطلب إلزامي', 'danger');
      return;
    }
    onUpdateOrderStatus(orderToCancel.id, 'cancelled');
    setSelectedOrder((current) => current?.id === orderToCancel.id ? { ...current, status: 'cancelled' } : current);
    setOrderToCancel(null);
    setCancellationReason('');
    setIsDetailModalOpen(false);
    showToast(`تم إلغاء الطلب #${orderToCancel.orderNumber}`, 'success');
  };

  const handleQuickStatusChange = (order: Order, nextStatus: OrderStatus) => {
    if (order.status === nextStatus) {
      showToast(`الطلب بالفعل في حالة ${getStatusText(nextStatus)}`, 'info');
      return;
    }
    onUpdateOrderStatus(order.id, nextStatus);
    setSelectedOrder((current) => current?.id === order.id ? { ...current, status: nextStatus } : current);
    window.setTimeout(() => void loadOrderEvents(order.id), 250);
    showToast(`تم تحديث الطلب إلى «${getStatusText(nextStatus)}»`, 'success');
  };

  const handleQuickWhatsApp = (order: Order, status: OrderStatus = order.status) => {
    onSendWhatsAppNotice(
      order.customerPhone,
      order.customerName,
      order.orderNumber,
      getWhatsAppStatusText(status)
    );
    window.setTimeout(() => void loadOrderEvents(order.id), 350);
  };

  const getNextStatusAction = (status: OrderStatus): { status: OrderStatus; label: string; icon: React.ReactNode } | null => {
    switch (status) {
      case 'new': return { status: 'processing', label: 'بدء التنفيذ', icon: <Play className="w-3.5 h-3.5" /> };
      case 'processing': return { status: 'ready', label: 'تجهيز كجاهز', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
      case 'ready': return { status: 'delivered', label: 'تسجيل التسليم', icon: <PackageCheck className="w-3.5 h-3.5" /> };
      default: return null;
    }
  };

  const handlePrintOrderSheet = (order: Order) => {
    setPrintableOrder(order);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="view-wrapper" dir="rtl">
      {/* Printable Area */}
      {printableOrder && (() => {
        const sourceInvoice = invoices.find((invoice) => invoice.orderId === printableOrder.id);
        const printableInvoice: Invoice = {
          id: sourceInvoice?.id || `INV-${printableOrder.id}`,
          visibleInvoiceNumber: sourceInvoice?.visibleInvoiceNumber,
          invoiceNumber: sourceInvoice?.invoiceNumber || `INV-${printableOrder.orderNumber}`,
          orderId: printableOrder.id,
          customerName: printableOrder.customerName,
          customerPhone: printableOrder.customerPhone,
          orderDate: printableOrder.orderDate,
          totalAmount: printableOrder.totalAmount,
          paidAmount: printableOrder.paidAmount,
          remainingAmount: printableOrder.remainingAmount,
          paymentStatus: sourceInvoice?.paymentStatus || (printableOrder.remainingAmount <= 0 ? 'paid' : printableOrder.paidAmount > 0 ? 'partial' : 'unpaid'),
          cashReceived: sourceInvoice?.cashReceived ?? printableOrder.cashReceived,
          overpaymentAmount: sourceInvoice?.overpaymentAmount ?? printableOrder.overpaymentAmount,
          cancellationWriteoffAmount: sourceInvoice?.cancellationWriteoffAmount ?? printableOrder.cancellationWriteoffAmount,
          payments: sourceInvoice?.payments || []
        };
        return (
          <div className="hidden-on-screen">
            <PrintableInvoice invoice={printableInvoice} order={printableOrder} preferences={userPreferences} />
          </div>
        );
      })()}

      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="page-header">
          <h2 className="page-title flex items-center gap-3">
            <Scissors className="w-7 h-7 text-[#111111]" />
            إدارة طلبات الخياطة
          </h2>
          <p className="page-subtitle">متابعة مراحل التنفيذ، التسليم، وطباعة الكروت</p>
        </div>
        <Button
          data-testid="orders-add"
          variant="primary"
          onClick={handleOpenNewOrder}
          icon={<Plus className="w-5 h-5" />}
          size="lg"
        >
          تسجيل طلب جديد
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="p-4 orders-filter-card">
        <div className="flex flex-col lg:flex-row gap-4 items-end justify-between">
          <div className="orders-filter-toolbar">
            <div className="relative w-full lg:max-w-lg">
              <Input
                aria-label="البحث في الطلبات برقم الطلب أو اسم العميل أو الجوال"
                placeholder="بحث برقم الطلب، اسم العميل، أو الجوال..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search className="w-5 h-5" aria-hidden="true" />}
                className="h-11"
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} disabled={!searchTerm && statusFilter === 'all'}>
              إعادة ضبط الفلاتر
            </Button>
          </div>

          <SegmentedControl
            value={statusFilter as 'all' | OrderStatus}
            onChange={setStatusFilter}
            ariaLabel="تصفية حالة الطلب"
            className="w-full lg:w-auto"
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'new', label: 'جديد' },
              { value: 'processing', label: 'تحت التنفيذ' },
              { value: 'ready', label: 'جاهز' },
              { value: 'delivered', label: 'مُسلم' },
              { value: 'cancelled', label: 'ملغى' }
            ]}
          />
        </div>
        <div className="orders-filter-meta" aria-live="polite">عرض {filteredOrders.length} من أصل {orders.length} طلب</div>
      </Card>

      {/* Orders Table */}
      <Card className="p-0 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <EmptyState
            compact
            icon={<Scissors className="w-8 h-8" />}
            title={hasActiveOrderFilters ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات بعد'}
            description={hasActiveOrderFilters ? 'غيّر البحث أو حالة الطلب لعرض نتائج أخرى.' : 'أضف أول طلب للبدء بمتابعة التنفيذ والتسليم.'}
            action={hasActiveOrderFilters ? <Button variant="secondary" size="md" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}>مسح البحث والفلاتر</Button> : <Button variant="primary" size="md" onClick={handleOpenNewOrder} icon={<Plus className="w-4 h-4" />}>إضافة طلب جديد</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th className="w-24 text-center" aria-sort={orderSort.key === 'orderNumber' ? orderSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="رقم الطلب" active={orderSort.key === 'orderNumber'} direction={orderSort.direction} onClick={() => toggleOrderSort('orderNumber')} align="center" /></th>
                  <th aria-sort={orderSort.key === 'customerName' ? orderSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="العميل" active={orderSort.key === 'customerName'} direction={orderSort.direction} onClick={() => toggleOrderSort('customerName')} /></th>
                  <th>التفاصيل</th>
                  <th aria-sort={orderSort.key === 'deliveryDate' ? orderSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="موعد التسليم" active={orderSort.key === 'deliveryDate'} direction={orderSort.direction} onClick={() => toggleOrderSort('deliveryDate')} /></th>
                  <th aria-sort={orderSort.key === 'totalAmount' ? orderSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="المالية" active={orderSort.key === 'totalAmount'} direction={orderSort.direction} onClick={() => toggleOrderSort('totalAmount')} align="center" /></th>
                  <th aria-sort={orderSort.key === 'status' ? orderSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="الحالة" active={orderSort.key === 'status'} direction={orderSort.direction} onClick={() => toggleOrderSort('status')} /></th>
                  <th className="text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrders.map((ord) => (
                  <tr key={ord.id} className="group">
                    <td className="text-center">
                      <span title={ord.orderNumber} className="font-black text-[#111111] bg-[#F3F4F6] px-2.5 py-1 rounded-lg text-xs">#{ord.orderNumber}</span>
                    </td>
                    <td>
                      <div title={ord.customerName} className="font-black text-[#111111]">{ord.customerName}</div>
                      <div title={ord.customerPhone} className="text-[10px] text-[#9CA3AF] font-mono font-bold mt-0.5">{ord.customerPhone}</div>
                    </td>
                    <td>
                      <div title={ord.thobeTypeName} className="text-xs font-black text-[#111111]">{ord.thobeTypeName}</div>
                      <div title={`${ord.fabricName} (${ord.fabricColor})`} className="text-[10px] text-[#6B7280] font-bold mt-0.5">{ord.fabricName} ({ord.fabricColor})</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-rose-600 font-black text-xs font-mono">
                        <Calendar className="w-3.5 h-3.5" />
                        {ord.deliveryDate}
                      </div>
                    </td>
                    <td>
                      <div className="text-xs font-black text-[#111111]">{ord.totalAmount} ر.س</div>
                      <div className="mt-1">
                        {ord.remainingAmount > 0 ? (
                          <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded">متبقي: {ord.remainingAmount}</span>
                        ) : (
                          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">مدفوع كامل</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge variant={getOrderStatusBadgeVariant(ord.status)}>
                        {getStatusText(ord.status)}
                      </Badge>
                      {Number(ord.cancellationWriteoffAmount || 0) > 0 && (
                        <div className="mt-1"><Badge variant="blue">ملغى مع تسوية</Badge></div>
                      )}
                    </td>
                    <td className="text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-[190px]">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedOrder(ord);
                            setIsDetailModalOpen(true);
                          }}
                          title="عرض التفاصيل"
                        >
                          عرض
                        </Button>
                        {getNextStatusAction(ord.status) && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={getNextStatusAction(ord.status)?.icon}
                            onClick={() => handleQuickStatusChange(ord, getNextStatusAction(ord.status)!.status)}
                            title={getNextStatusAction(ord.status)?.label}
                          >
                            {getNextStatusAction(ord.status)?.label}
                          </Button>
                        )}
                        <details className="sahwa-actions-menu">
                          <summary aria-label={`إجراءات إضافية للطلب ${ord.orderNumber}`}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            المزيد
                          </summary>
                          <div className="order-row-secondary-actions" role="group" aria-label={`إجراءات إضافية للطلب ${ord.orderNumber}`}>
                            <Tooltip content="إرسال رسالة واتساب بالحالة الحالية">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleQuickWhatsApp(ord)}
                                icon={<MessageCircle className="w-3.5 h-3.5" />}
                                aria-label={`إرسال رسالة واتساب للطلب ${ord.orderNumber}`}
                              >
                                واتساب
                              </Button>
                            </Tooltip>
                            <Tooltip content={`طباعة الطلب ${ord.orderNumber}`}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handlePrintOrderSheet(ord)}
                                icon={<Printer className="w-3.5 h-3.5" />}
                                aria-label={`طباعة الطلب ${ord.orderNumber}`}
                              >
                                طباعة
                              </Button>
                            </Tooltip>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* NEW ORDER FULL SCREEN MODAL */}
      <Modal
        isOpen={isNewOrderModalOpen}
        onClose={handleCloseNewOrder}
        title="تسجيل طلب جديد"
        maxWidth="full"
        footer={
          <div className="flex items-center justify-between w-full">
             <div className="flex items-center gap-4 text-[#6B7280]">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${hasUnsavedChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                  <span className="text-[11px] font-black">{hasUnsavedChanges ? 'تعديلات غير محفوظة' : 'جاهز للحفظ النهائي'}</span>
                </div>
             </div>
             <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={handleCloseNewOrder}>إلغاء</Button>
                <Button 
                  data-testid="order-save"
                  variant="primary" 
                  onClick={handleCreateOrder} 
                  icon={<Save className="w-4 h-4" />}
                  isLoading={isSubmittingOrder}
                  size="lg"
                >
                  حفظ الطلب والقياسات (Ctrl+S)
                </Button>
             </div>
          </div>
        }
      >
        <div className="space-y-10 pb-10">
          {/* Section 1: Customer & Basic Info */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Customer Info Card */}
            <Card 
              title="بيانات العميل" 
              headerIcon={<User className="w-5 h-5" />}
              className="xl:col-span-1"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                   <label className="text-[13px] font-black text-[#111111]">العميل المستهدف *</label>
                   <button 
                    onClick={() => setIsCreatingCustomerInline(!isCreatingCustomerInline)}
                    className="text-[11px] font-black text-[#111111] hover:underline flex items-center gap-1"
                   >
                     {isCreatingCustomerInline ? 'إلغاء الإضافة' : 'إضافة عميل جديد +'}
                   </button>
                </div>

                {isCreatingCustomerInline ? (
                  <div className="space-y-4 p-4 bg-[#F9FAFB] rounded-xl border-2 border-dashed border-[#E5E7EB] animate-in fade-in slide-in-from-top-2">
                    <Input
                      label="اسم العميل الجديد *"
                      placeholder="أدخل الاسم الثلاثي"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      icon={<User className="w-4 h-4" />}
                    />
                    <Input
                      label="رقم الجوال *"
                      placeholder="05xxxxxxxx"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      icon={<Hash className="w-4 h-4" />}
                    />
                    <p className="text-[10px] text-[#6B7280] font-bold leading-relaxed">سيتم إنشاء سجل للعميل الجديد تلقائياً عند حفظ هذا الطلب.</p>
                  </div>
                ) : (
                  <Select
                    data-testid="order-customer-select"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    icon={<User className="w-4 h-4" />}
                  >
                    <option value="">-- اختر عميلاً موجوداً --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} - ({c.phone})
                      </option>
                    ))}
                  </Select>
                )}

                {!isCreatingCustomerInline && selectedCustomer && selectedCustomerHistory.length > 0 && (
                  <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAF8] p-3.5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <History className="w-4 h-4 text-[#111111] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-[#111111] truncate">سجل المقاسات القديمة</p>
                          <p className="text-[10px] text-[#6B7280] font-bold truncate">اختر نسخة سابقة لهذا الطلب فقط</p>
                        </div>
                      </div>
                      <Badge variant="slate">{selectedCustomerHistory.length} نسخ</Badge>
                    </div>
                    <div className="space-y-2">
                      {selectedCustomerHistory.slice(0, 3).map((historyRecord) => (
                        <div key={historyRecord.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Calendar className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                            <div className="min-w-0">
                              <span className="block text-[10px] font-black text-[#111111]">نسخة محفوظة</span>
                              <span className="block text-[10px] font-mono font-bold text-[#6B7280] truncate">{historyRecord.savedAt}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleUseHistoryForOrder(historyRecord)}
                          >
                            استخدام لهذا الطلب فقط
                          </Button>
                        </div>
                      ))}
                    </div>
                    {selectedCustomerHistory.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setIsMeasurementHistoryOpen((open) => !open)}
                        className="mt-2 text-[10px] font-black text-[#111111] hover:underline"
                      >
                        {isMeasurementHistoryOpen ? 'إخفاء بقية السجل' : `عرض بقية السجل (${selectedCustomerHistory.length - 3})`}
                      </button>
                    )}
                    {isMeasurementHistoryOpen && selectedCustomerHistory.length > 3 && (
                      <div className="mt-2 space-y-2 border-t border-[#E5E7EB] pt-2">
                        {selectedCustomerHistory.slice(3).map((historyRecord) => (
                          <div key={historyRecord.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Calendar className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                              <span className="text-[10px] font-mono font-bold text-[#6B7280] truncate">{historyRecord.savedAt}</span>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleUseHistoryForOrder(historyRecord)}
                            >
                              استخدام لهذا الطلب فقط
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Order Details Card */}
            <Card 
              title="تفاصيل الطلب" 
              headerIcon={<ShoppingBag className="w-5 h-5" />}
              className="xl:col-span-2"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Select
                  label="نوع الثوب *"
                  value={selectedThobeTypeId}
                  onChange={(e) => handleThobeTypeChange(e.target.value)}
                >
                  <option value="">-- اختر النوع --</option>
                  {thobeTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.defaultPrice} ر.س)</option>
                  ))}
                </Select>

                <div>
                  <Select
                    label="القماش واللون *"
                    value={selectedFabricId}
                    onChange={(e) => setSelectedFabricId(e.target.value)}
                  >
                    <option value="">-- اختر القماش --</option>
                    {fabrics.map((f) => (
                      <option key={f.id} value={f.id}>{f.name} - {f.color} ({f.quantityMeters} متر)</option>
                    ))}
                  </Select>
                  {fabrics.length === 0 && <p className="mt-1 text-[10px] font-bold text-amber-700">لا توجد أقمشة مسجلة. أضف قماشاً من صفحة المخزون قبل حفظ الطلب.</p>}
                </div>

                <Input
                  label="تاريخ موعد التسليم *"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  icon={<Calendar className="w-4 h-4" />}
                />

                <Input
                  label="عدد الثياب *"
                  type="number"
                  min="1"
                  value={garmentCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setGarmentCount(val);
                    const found = thobeTypes.find(t => t.id === selectedThobeTypeId);
                    if (found && !isTotalAmountManuallyEdited) {
                      setTotalAmount(found.defaultPrice * val);
                    }
                  }}
                />

                <Input
                  label="السعر الكلي (ر.س) *"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={totalAmount === 0 ? '' : totalAmount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const value = e.target.value;
                    setIsTotalAmountManuallyEdited(true);
                    setTotalAmount(value === '' ? 0 : Number(value));
                  }}
                  icon={<CreditCard className="w-4 h-4" />}
                />

                <Input
                  label="المبلغ المدفوع (عربون) *"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={paidAmount === 0 ? '' : paidAmount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                  icon={<CreditCard className="w-4 h-4" />}
                />
              </div>

              <div className="mt-5 pt-5 border-t border-[#F3F4F6] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div><h4 className="text-sm font-black text-[#111111]">مواد مرتبطة بالطلب</h4><p className="text-[11px] text-[#6B7280] font-bold mt-1">اختياري — تُخصم من المخزون وتدخل بسعر الشراء التاريخي في التكلفة</p></div>
                  <Badge variant="slate">{selectedMaterials.length} أصناف</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end">
                  <Select label="المستلزم / الإكسسوار" value={selectedAccessoryId} onChange={(e) => setSelectedAccessoryId(e.target.value)}>
                    <option value="">-- اختر مستلزماً --</option>
                    {accessories.map((accessory) => <option key={accessory.id} value={accessory.id}>{accessory.name} ({accessory.quantity} {accessory.unit})</option>)}
                  </Select>
                  <Input label="الكمية" type="number" min="0.01" step="0.01" value={accessoryQuantity} onChange={(e) => setAccessoryQuantity(e.target.value)} />
                  <Button type="button" variant="secondary" onClick={handleAddAccessoryMaterial}>إضافة</Button>
                </div>
                {selectedMaterials.length > 0 && <div className="flex flex-wrap gap-2">{selectedMaterials.map((material) => <div key={material.itemId} className="inline-flex items-center gap-2 rounded-lg border border-[#D9D9D9] bg-[#F9FAFB] px-3 py-2 text-xs font-black"><span>{material.itemName} × {material.quantity} {material.unit}</span><span className="text-[#6B7280]">{material.quantity * material.unitCostAtUsage} ر.س</span><button type="button" className="text-rose-600 hover:underline" onClick={() => handleRemoveAccessoryMaterial(material.itemId)}>حذف</button></div>)}</div>}
              </div>
              
              <div className="mt-5 pt-5 border-t border-[#F3F4F6] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-black text-[#6B7280]">المبلغ المتبقي:</span>
                  <span className={`text-xl font-black font-mono ${remainingAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {remainingAmount} ر.س
                  </span>
                </div>
                <div className="w-1/2">
                   <Input
                    label="ملاحظات الطلب"
                    placeholder="تفاصيل إضافية اختيارية..."
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-11 border-dashed"
                   />
                </div>
              </div>
            </Card>
          </div>

          {/* Section 2: Measurements Worksheet */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-2">
               <div className="w-10 h-10 rounded-xl bg-[#111111] text-white flex items-center justify-center shadow-lg">
                  <Ruler className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="text-lg font-black text-[#111111] tracking-tight">جدول القياسات والرسومات</h3>
                  <p className="text-[12px] text-[#6B7280] font-bold">يرجى تعبئة كافة القياسات الفنية بدقة (جميع القياسات بالإنش)</p>
               </div>
            </div>
            
            <MeasurementsTableForm
              measurements={newOrderMeasurements}
              measurementTestIdPrefix="order"
              onChange={setNewOrderMeasurements}
              styleDetails={newOrderStyleDetails}
              onStyleChange={setNewOrderStyleDetails}
              customerName={isCreatingCustomerInline ? newCustomerName : inlineCustomer?.name}
              customerPhone={isCreatingCustomerInline ? newCustomerPhone : inlineCustomer?.phone}
              draftScope="new-order"
            />

            <div className="mt-6 rounded-2xl border border-[#D9D9D9] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Notebook className="w-4 h-4 text-[#111111]" />
                <label className="text-sm font-black text-[#111111]">ملاحظات الخياط</label>
              </div>
              <textarea
                value={newOrderStyleDetails.tailorNotes || ''}
                onChange={(e) => setNewOrderStyleDetails((prev) => ({ ...prev, tailorNotes: e.target.value }))}
                placeholder="اكتب التعليمات الفنية الخاصة بالخياط أو المقص دار..."
                rows={4}
                className="w-full rounded-xl border-2 border-[#E5E7EB] bg-[#FAFAF8] px-4 py-3 text-sm font-bold text-[#111111] outline-none transition focus:border-[#111111] resize-y"
              />
              <p className="mt-2 text-[11px] font-bold text-[#6B7280]">تظهر هذه الملاحظات في أسفل الفاتورة المطبوعة.</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`تفاصيل الطلب #${selectedOrder?.orderNumber}`}
        maxWidth={detailTab === 'measurements' ? 'full' : '2xl'}
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {selectedOrder?.status !== 'cancelled' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => { setCancellationReason(''); setOrderToCancel(selectedOrder); }}
                >
                  إلغاء الطلب
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => setOrderToDelete(selectedOrder)} icon={<Trash2 className="w-4 h-4" />}>حذف الطلب</Button>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => handlePrintOrderSheet(selectedOrder!)} icon={<Printer className="w-4 h-4" />}>طباعة الفاتورة</Button>
              <Button variant="primary" onClick={() => setIsDetailModalOpen(false)}>إغلاق</Button>
            </div>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-[#F3F4F6] rounded-xl w-fit">
              <button
                type="button"
                aria-pressed={detailTab === 'info'}
                onClick={() => setDetailTab('info')}
                className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${
                  detailTab === 'info' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
                }`}
              >
                بيانات الطلب
              </button>
              <button
                type="button"
                aria-pressed={detailTab === 'measurements'}
                onClick={() => setDetailTab('measurements')}
                className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${
                  detailTab === 'measurements' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
                }`}
              >
                المقاسات والتصميم
              </button>
              <button
                type="button"
                aria-pressed={detailTab === 'events'}
                onClick={() => setDetailTab('events')}
                className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${
                  detailTab === 'events' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
                }`}
              >
                سجل الأحداث
              </button>
            </div>

            {detailTab === 'info' ? (
              <div className="space-y-6">
                <section aria-labelledby="order-status-heading">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 id="order-status-heading" className="text-sm font-black text-[#111111]">مسار حالة الطلب</h3>
                      <p className="mt-1 text-[11px] font-bold text-[#6B7280]">اختر مرحلة لتحديث حالة الطلب وتسجيلها في سجل الأحداث.</p>
                    </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Badge variant={getOrderStatusBadgeVariant(selectedOrder.status)}>
                          {getStatusText(selectedOrder.status)}
                        </Badge>
                        {Number(selectedOrder.cancellationWriteoffAmount || 0) > 0 && <Badge variant="blue">ملغى مع تسوية</Badge>}
                      </div>
                  </div>
                  <OrderStatusStepper currentStatus={selectedOrder.status} onStatusSelect={(status) => handleQuickStatusChange(selectedOrder, status)} />
                </section>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                      <div className="order-detail-identity-card p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB]">
                        <h4 className="text-[11px] font-black text-[#9CA3AF] uppercase mb-3 tracking-wider">العميل والطلب</h4>
                        <div className="space-y-3">
                          <div>
                            <span className="block text-[11px] font-bold text-[#6B7280]">اسم العميل</span>
                            <span className="mt-0.5 block text-lg font-black text-[#111111]">{selectedOrder.customerName}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3">
                            <span className="text-xs font-bold text-[#6B7280]">رقم الجوال</span>
                            <span className="text-xs font-black text-[#111111] font-mono" dir="ltr">{selectedOrder.customerPhone}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-[#6B7280]">رقم الطلب</span>
                            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-black font-mono text-[#111111]" dir="ltr">#{selectedOrder.orderNumber}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB]">
                        <h4 className="text-[11px] font-black text-[#9CA3AF] uppercase mb-3 tracking-wider">تفاصيل التنفيذ والتسليم</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between gap-3">
                            <span className="text-xs font-bold text-[#6B7280]">نوع الثوب</span>
                            <span className="text-xs font-black text-[#111111] text-left">{selectedOrder.thobeTypeName}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-xs font-bold text-[#6B7280]">القماش واللون</span>
                            <span className="text-xs font-black text-[#111111] text-left">{selectedOrder.fabricName} ({selectedOrder.fabricColor})</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3">
                            <span className="text-xs font-bold text-[#6B7280]">موعد التسليم</span>
                            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-black font-mono text-[#111111]" dir="ltr">{selectedOrder.deliveryDate}</span>
                          </div>
                        </div>
                      </div>
                </div>

                <div className="space-y-4">
                   <div className="p-4 bg-[#111111] rounded-2xl text-white shadow-lg">
                    <h4 className="text-[11px] font-black text-white/50 uppercase mb-3 tracking-wider">المالية والحالة</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold opacity-80">الإجمالي:</span>
                        <span className="text-lg font-black font-mono">{selectedOrder.totalAmount} ر.س</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold opacity-80">المدفوع:</span>
                        <span className="text-lg font-black font-mono text-emerald-300">{selectedOrder.paidAmount} ر.س</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-white/10 pt-3">
                        <span className="text-xs font-bold opacity-80">المتبقي:</span>
                        <span className={`text-lg font-black font-mono ${selectedOrder.remainingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {selectedOrder.remainingAmount} ر.س
                        </span>
                      </div>
                      <div className="pt-2 border-t border-white/10">
                        <Select
                          aria-label="تحديث حالة الطلب"
                          value={selectedOrder.status}
                          onChange={(e) => handleQuickStatusChange(selectedOrder, e.target.value as OrderStatus)}
                          className="bg-white/10 border-white/20 text-white h-10"
                        >
                          <option value="new">جديد</option>
                          <option value="processing">تحت التنفيذ</option>
                          <option value="ready">جاهز</option>
                          <option value="delivered">مُسلم</option>
                        </Select>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                          {getNextStatusAction(selectedOrder.status) && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              icon={getNextStatusAction(selectedOrder.status)?.icon}
                              onClick={() => handleQuickStatusChange(selectedOrder, getNextStatusAction(selectedOrder.status)!.status)}
                              className="bg-white text-[#111111] hover:bg-[#F3F4F6]"
                            >
                              {getNextStatusAction(selectedOrder.status)?.label}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={<MessageCircle className="w-3.5 h-3.5" />}
                            onClick={() => handleQuickWhatsApp(selectedOrder)}
                            className="bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
                          >
                            إرسال واتساب
                          </Button>
                        </div>
                        <p className="text-[10px] font-bold text-white/60 mt-2 leading-relaxed">
                          تفتح الرسالة جاهزة في واتساب، ويبقى الضغط على إرسال النهائي من الموظف.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {selectedOrder.notes && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                      <h4 className="text-[11px] font-black text-amber-800 uppercase mb-2 flex items-center gap-1.5">
                        <Notebook className="w-3.5 h-3.5" />
                        ملاحظات
                      </h4>
                      <p className="text-xs font-bold text-amber-900 leading-relaxed">{selectedOrder.notes}</p>
                    </div>
                  )}
                </div>
                </div>
              </div>
            ) : detailTab === 'measurements' ? (
              <>
                <MeasurementsTableForm
                  measurements={(measurementDraft || selectedOrder).measurements}
                  onChange={(m) => setMeasurementDraft((current) => ({ ...(current || selectedOrder), measurements: m }))}
                  styleDetails={(measurementDraft || selectedOrder).styleDetails}
                  onStyleChange={(s) => setMeasurementDraft((current) => ({ ...(current || selectedOrder), styleDetails: s }))}
                  customerName={selectedOrder.customerName}
                  customerPhone={selectedOrder.customerPhone}
                  draftScope={selectedOrder.id}
                  saveLabel="تحديث المقاسات"
                  onSave={() => void handleSaveMeasurementDraft()}
                />

                <div className="mt-6 rounded-2xl border border-[#D9D9D9] bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Notebook className="w-4 h-4 text-[#111111]" />
                    <label className="text-sm font-black text-[#111111]">ملاحظات الخياط</label>
                  </div>
                  <textarea
                    value={(measurementDraft || selectedOrder).styleDetails?.tailorNotes || ''}
                    onChange={(e) => setMeasurementDraft((current) => ({
                      ...(current || selectedOrder),
                      styleDetails: { ...(current || selectedOrder).styleDetails, tailorNotes: e.target.value }
                    }))}
                    placeholder="اكتب التعليمات الفنية الخاصة بالخياط أو المقص دار..."
                    rows={4}
                    className="w-full rounded-xl border-2 border-[#E5E7EB] bg-[#FAFAF8] px-4 py-3 text-sm font-bold text-[#111111] outline-none transition focus:border-[#111111] resize-y"
                  />
                  <p className="mt-2 text-[11px] font-bold text-[#6B7280]">تظهر هذه الملاحظات في أسفل الفاتورة المطبوعة.</p>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-5">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-[#111111]">التسلسل الزمني للطلب</h3>
                    <p className="mt-1 text-[11px] font-bold text-[#6B7280]">يسجل النظام العمليات تلقائيًا دون تعطيل عمل الموظف.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadOrderEvents(selectedOrder.id)} disabled={isEventsLoading}>
                    {isEventsLoading ? 'جارٍ التحديث...' : 'تحديث السجل'}
                  </Button>
                </div>
                {isEventsLoading && orderEvents.length === 0 ? (
                  <div className="py-12 text-center text-xs font-bold text-[#6B7280]">جارٍ تحميل سجل الأحداث...</div>
                ) : orderEvents.length === 0 ? (
                  <div className="py-12 text-center text-xs font-bold text-[#6B7280]">لا توجد أحداث مسجلة لهذا الطلب حتى الآن.</div>
                ) : (
                  <div className="relative space-y-4 before:absolute before:right-[15px] before:top-3 before:bottom-3 before:w-px before:bg-[#D9D9D9]">
                    {orderEvents.map((event) => (
                      <div key={event.id} className="relative flex gap-3 pr-1">
                        <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#D9D9D9] bg-white text-[#111111]">
                          {event.type === 'payment' ? <CircleDollarSign className="h-4 w-4" /> : event.type === 'inventory' ? <Warehouse className="h-4 w-4" /> : event.type === 'whatsapp' ? <Send className="h-4 w-4" /> : event.type === 'status_changed' ? <PackageCheck className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h4 className="text-xs font-black text-[#111111]">{event.title}</h4>
                            <time className="text-[10px] font-bold text-[#9CA3AF]" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('ar-SA')}</time>
                          </div>
                          <p className="mt-1 text-xs font-bold leading-relaxed text-[#4B5563]">{event.description}</p>
                          {(event.fromStatus || event.toStatus) && (
                            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-black text-[#4B5563]">
                              <span>{event.fromStatus ? getStatusText(event.fromStatus as OrderStatus) : 'بداية'}</span>
                              <span>←</span>
                              <span>{event.toStatus ? getStatusText(event.toStatus as OrderStatus) : 'غير محدد'}</span>
                            </div>
                          )}
                          {event.actor && <div className="mt-2 text-[10px] font-bold text-[#9CA3AF]">بواسطة: {event.actor}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* DELETE CONFIRMATION */}
      <ConfirmModal
        isOpen={!!orderToCancel}
        onCancel={() => { setOrderToCancel(null); setCancellationReason(''); }}
        onConfirm={handleCancelOrder}
        title="إلغاء الطلب"
        message={`سيتم إلغاء الطلب رقم #${orderToCancel?.orderNumber} وإجراء التسوية النظامية إن وجدت. هل تريد المتابعة؟`}
        confirmLabel="تأكيد إلغاء الطلب"
        reason={cancellationReason}
        reasonLabel="سبب الإلغاء"
        onReasonChange={setCancellationReason}
      />

      <ConfirmModal
        isOpen={!!orderToDelete}
        onClose={() => setOrderToDelete(null)}
        onConfirm={() => {
          if (orderToDelete && onDeleteOrder) {
            onDeleteOrder(orderToDelete.id);
            setOrderToDelete(null);
            setIsDetailModalOpen(false);
            showToast('تم حذف الطلب بنجاح', 'success');
          }
        }}
        title="حذف الطلب"
        message={`هل أنت متأكد من حذف الطلب رقم #${orderToDelete?.orderNumber}؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="نعم، احذف الطلب"
        variant="danger"
      />

      <ConfirmModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setIsNewOrderModalOpen(false);
        }}
        title="تجاهل التعديلات؟"
        message="يوجد تعديلات غير محفوظة على هذا الطلب. إذا رجعت الآن سيتم فقدانها. هل تريد المتابعة؟"
        confirmLabel="تجاهل والرجوع"
        variant="danger"
      />
    </div>
  );
};
