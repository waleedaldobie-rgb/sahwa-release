// @ts-nocheck
import React, { useMemo } from 'react';
import { AppData, Order } from '../types';
import { formatReportStatus } from '../domain/reportMetrics';
import { DataRevision } from '../state/appDataStore';
import { getCachedDerivedValue } from '../services/derivedDataCache';
import { Card, Badge, Button, EmptyState, getOrderStatusBadgeVariant } from './ui';
import {
  Scissors,
  Clock,
  CheckCircle2,
  PackageCheck,
  AlertTriangle,
  Calendar,
  Package,
  Plus,
  LayoutDashboard,
  RefreshCw,
  CircleAlert,
  ArrowLeft
} from 'lucide-react';

export interface DashboardViewProps {
  data: AppData;
  dataRevision?: DataRevision;
  onNavigateTab: (tab: string) => void;
  onSelectOrder: (order: Order) => void;
  onOpenNewOrderModal: () => void;
  onRefreshDashboard?: () => Promise<void>;
  isRefreshing?: boolean;
  lastUpdatedAt?: number | null;
}

interface DashboardSummary {
  newCount: number;
  processingCount: number;
  readyCount: number;
  deliveredCount: number;
  cancelledCount: number;
  settledByCancellationCount: number;
  dueOrders: Order[];
  lowStockFabrics: AppData['fabrics'];
  lowStockAccessories: AppData['accessories'];
  recentOrders: Order[];
}

const formatArabicDate = (value: Date) => value.toLocaleDateString('ar-SA', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
});

const formatUpdatedAt = (timestamp?: number | null) => {
  if (!timestamp) return 'لم يتم التحديث بعد';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'الآن';
  if (seconds < 60) return `منذ ${seconds} ثوانٍ`;
  const minutes = Math.floor(seconds / 60);
  return `منذ ${minutes} دقيقة`;
};

const getInventorySeverity = (quantity: number, minimum: number): 'critical' | 'low' => {
  if (quantity <= 0 || (minimum > 0 && quantity / minimum < 0.5)) return 'critical';
  return 'low';
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  dataRevision,
  onNavigateTab,
  onSelectOrder,
  onOpenNewOrderModal,
  onRefreshDashboard,
  isRefreshing = false,
  lastUpdatedAt
}) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const cacheKey = [
    'dashboard',
    dataRevision?.orders ?? data.orders.length,
    dataRevision?.inventory ?? data.fabrics.length + data.accessories.length,
    dataRevision?.accounting ?? data.invoices.length
  ].join(':');

  const summary = useMemo<DashboardSummary>(() => getCachedDerivedValue(cacheKey, () => {
    const dueOrders = data.orders
      .filter((order) => order.status !== 'delivered' && order.status !== 'cancelled' && order.deliveryDate <= todayStr)
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

    return {
      newCount: data.orders.filter((order) => order.status === 'new').length,
      processingCount: data.orders.filter((order) => order.status === 'processing').length,
      readyCount: data.orders.filter((order) => order.status === 'ready').length,
      deliveredCount: data.orders.filter((order) => order.status === 'delivered').length,
      cancelledCount: data.orders.filter((order) => order.status === 'cancelled').length,
      settledByCancellationCount: data.orders.filter((order) => order.status === 'cancelled' && Number(order.cancellationWriteoffAmount || 0) > 0).length,
      dueOrders,
      lowStockFabrics: data.fabrics.filter((item) => item.quantityMeters <= item.minStockMeters),
      lowStockAccessories: data.accessories.filter((item) => item.quantity <= item.minStock),
      recentOrders: [...data.orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6)
    };
  }), [cacheKey, data, todayStr]);

  const getStatusBadge = (order: Order) => {
    const hasWriteoff = Number(order.cancellationWriteoffAmount || 0) > 0;
    const label = hasWriteoff
      ? formatReportStatus('settled_by_cancellation')
      : order.status === 'cancelled'
        ? formatReportStatus('cancelled')
        : order.status === 'new'
          ? 'جديد'
          : order.status === 'processing'
            ? 'تحت التنفيذ'
            : order.status === 'ready'
              ? 'جاهز للتسليم'
              : 'تم التسليم';
    return <Badge variant={getOrderStatusBadgeVariant(order.status, order.cancellationWriteoffAmount)}>{label}</Badge>;
  };

  const metrics = [
    {
      id: 'due',
      label: 'تحتاج إجراء اليوم',
      count: summary.dueOrders.length,
      description: summary.dueOrders.length > 0 ? 'طلبات مستحقة أو متأخرة' : 'لا توجد طلبات متأخرة',
      icon: <CircleAlert className="h-6 w-6" />,
      tone: summary.dueOrders.length > 0 ? 'danger' : 'success'
    },
    {
      id: 'ready',
      label: 'جاهزة للتسليم',
      count: summary.readyCount,
      description: 'بانتظار حضور العميل',
      icon: <CheckCircle2 className="h-6 w-6" />,
      tone: 'success'
    },
    {
      id: 'processing',
      label: 'تحت التنفيذ',
      count: summary.processingCount,
      description: 'عند الخياطين حالياً',
      icon: <Clock className="h-6 w-6" />,
      tone: 'warning'
    },
    {
      id: 'new',
      label: 'طلبات جديدة',
      count: summary.newCount,
      description: 'بانتظار التجهيز والقص',
      icon: <Scissors className="h-6 w-6" />,
      tone: 'neutral'
    },
    {
      id: 'cancelled',
      label: 'ملغاة / مسواة',
      count: summary.cancelledCount,
      description: summary.settledByCancellationCount > 0 ? `${summary.settledByCancellationCount} بتسوية غير نقدية` : 'مستبعدة من الإجراءات التشغيلية',
      icon: <CircleAlert className="h-6 w-6" />,
      tone: 'neutral'
    }
  ] as const;

  return (
    <div className="view-wrapper">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="page-header">
          <h2 className="page-title flex items-center gap-3">
            <LayoutDashboard className="h-7 w-7 text-[var(--color-text-token)]" />
            لوحة التحكم
          </h2>
          <p className="page-subtitle">ملخص التشغيل ليوم {formatArabicDate(today)}</p>
          <p className="mt-1 text-[11px] font-bold text-[var(--color-text-muted-token)]" aria-live="polite">
            آخر تحديث: {formatUpdatedAt(lastUpdatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefreshDashboard && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onRefreshDashboard()}
              isLoading={isRefreshing}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              تحديث البيانات
            </Button>
          )}
          <Button
            variant="primary"
            onClick={onOpenNewOrderModal}
            icon={<Plus className="h-5 w-5" />}
            size="lg"
          >
            تسجيل طلب جديد
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ملخص حالة الطلبات">
        {metrics.map((metric) => (
          <button
            key={metric.id}
            type="button"
            onClick={() => onNavigateTab('orders')}
            className="sahwa-card w-full text-right transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--color-focus-token)]"
            aria-label={`${metric.label}: ${metric.count}`}
          >
            <div className="flex items-start justify-between gap-3 p-5">
              <div>
                <span className="block text-[13px] font-black text-[var(--color-text-muted-token)]">{metric.label}</span>
                <strong className="mt-2 block font-mono text-3xl leading-none text-[var(--color-text-token)]">{metric.count}</strong>
              </div>
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                metric.tone === 'danger'
                  ? 'bg-rose-50 text-rose-600'
                  : metric.tone === 'success'
                    ? 'bg-emerald-50 text-emerald-600'
                    : metric.tone === 'warning'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-[var(--color-surface-soft-token)] text-[var(--color-text-token)]'
              }`}>
                {metric.icon}
              </div>
            </div>
            <p className="flex items-center gap-1.5 px-5 pb-5 text-[11px] font-bold text-[var(--color-text-muted-token)]">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
              {metric.description}
              <ArrowLeft className="mr-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            </p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="طلبات تحتاج إجراء"
          subtitle={`المستحقة أو المتأخرة حتى ${todayStr}`}
          headerIcon={<Calendar className="h-5 w-5" />}
          action={<Button variant="secondary" size="sm" onClick={() => onNavigateTab('orders')}>عرض الطلبات</Button>}
        >
          {summary.dueOrders.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6" />}
              title="لا توجد طلبات متأخرة"
              description="جميع الطلبات تسير وفق جدول التسليم المحدد."
              className="my-0"
            />
          ) : (
            <div className="space-y-3">
              {summary.dueOrders.slice(0, 5).map((order) => {
                const overdue = order.deliveryDate < todayStr;
                return (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => onSelectOrder(order)}
                    aria-label={`عرض تفاصيل الطلب ${order.orderNumber} للعميل ${order.customerName}`}
                    className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-[var(--color-border-token)] bg-[var(--color-surface-token)] p-4 text-right transition-all duration-200 hover:border-[var(--color-focus-token)] hover:bg-[var(--color-surface-soft-token)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-token)] focus-visible:ring-offset-2"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-soft-token)] text-xs font-black text-[var(--color-text-token)] group-hover:bg-[var(--brand-black)] group-hover:text-white">#{order.orderNumber}</div>
                      <div>
                        <h4 className="text-sm font-black text-[var(--color-text-token)]">{order.customerName}</h4>
                        <p className="mt-0.5 text-[11px] font-bold text-[var(--color-text-muted-token)]">{order.thobeTypeName} • {order.fabricName}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-left">
                      <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-black ${overdue ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
                        {overdue ? 'متأخر' : 'اليوم'} · {order.deliveryDate}
                      </span>
                      {getStatusBadge(order)}
                    </div>
                  </button>
                );
              })}
              {summary.dueOrders.length > 5 && <p className="text-center text-xs font-bold text-[var(--color-text-muted-token)]">يوجد {summary.dueOrders.length - 5} طلبات أخرى في شاشة الطلبات.</p>}
            </div>
          )}
        </Card>

        <Card
          title="نواقص المخزون"
          subtitle="الأصناف التي وصلت إلى الحد الأدنى أو أقل"
          headerIcon={<AlertTriangle className="h-5 w-5 text-rose-500" />}
          action={<Button variant="secondary" size="sm" onClick={() => onNavigateTab('inventory')}>إدارة المخزون</Button>}
        >
          {summary.lowStockFabrics.length === 0 && summary.lowStockAccessories.length === 0 ? (
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="المخزون بمستوى ممتاز"
              description="جميع الأقمشة والإكسسوارات متوفرة بنسب كافية."
              className="my-0"
            />
          ) : (
            <div className="space-y-3">
              {summary.lowStockFabrics.map((fabric) => {
                const severity = getInventorySeverity(fabric.quantityMeters, fabric.minStockMeters);
                return (
                  <div key={fabric.id} className={`flex items-center justify-between rounded-xl border p-4 ${severity === 'critical' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white ${severity === 'critical' ? 'border-rose-200 text-rose-500' : 'border-amber-200 text-amber-600'}`}><Package className="h-5 w-5" /></div>
                      <div>
                        <span className="block text-sm font-black text-[var(--color-text-token)]">قماش: {fabric.name}</span>
                        <span className="text-[11px] font-bold text-[var(--color-text-muted-token)]">اللون: {fabric.color}</span>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className={`block font-mono text-sm font-black ${severity === 'critical' ? 'text-rose-600' : 'text-amber-700'}`}>{fabric.quantityMeters} متر</span>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted-token)]">الحد: {fabric.minStockMeters} متر</span>
                    </div>
                  </div>
                );
              })}
              {summary.lowStockAccessories.map((accessory) => {
                const severity = getInventorySeverity(accessory.quantity, accessory.minStock);
                return (
                  <div key={accessory.id} className={`flex items-center justify-between rounded-xl border p-4 ${severity === 'critical' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white ${severity === 'critical' ? 'border-rose-200 text-rose-500' : 'border-amber-200 text-amber-600'}`}><Scissors className="h-5 w-5" /></div>
                      <div>
                        <span className="block text-sm font-black text-[var(--color-text-token)]">{accessory.name}</span>
                        <span className="text-[11px] font-bold text-[var(--color-text-muted-token)]">{accessory.category}</span>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className={`block font-mono text-sm font-black ${severity === 'critical' ? 'text-rose-600' : 'text-amber-700'}`}>{accessory.quantity} {accessory.unit}</span>
                      <span className="text-[10px] font-bold text-[var(--color-text-muted-token)]">الحد: {accessory.minStock} {accessory.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="آخر الطلبات المسجلة" subtitle="متابعة سريعة لأحدث العمليات" headerIcon={<Scissors className="h-5 w-5" />} className="p-0">
        {summary.recentOrders.length === 0 ? (
          <EmptyState
            icon={<Scissors className="h-6 w-6" />}
            title="لا توجد طلبات مسجلة"
            description="ابدأ بإضافة طلب جديد من الزر أعلاه."
            action={<Button variant="primary" size="sm" onClick={onOpenNewOrderModal} icon={<Plus className="h-4 w-4" />}>تسجيل طلب جديد</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table" aria-label="آخر الطلبات المسجلة">
              <thead>
                <tr>
                  <th className="w-24 text-center">رقم الطلب</th>
                  <th>العميل</th>
                  <th>نوع الثوب</th>
                  <th>تاريخ التسليم</th>
                  <th>المبلغ المتبقي</th>
                  <th>الحالة</th>
                  <th className="text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="text-center font-black text-[var(--color-text-token)]"><span className="rounded-lg bg-[var(--color-surface-soft-token)] px-2.5 py-1 text-xs">#{order.orderNumber}</span></td>
                    <td><div className="font-black text-[var(--color-text-token)]">{order.customerName}</div><div className="mt-0.5 font-mono text-[10px] font-bold text-[var(--color-text-muted-token)]">{order.customerPhone}</div></td>
                    <td className="font-bold text-[var(--color-text-muted-token)]">{order.thobeTypeName}</td>
                    <td className="font-mono font-black text-[var(--color-text-muted-token)]">{order.deliveryDate}</td>
                    <td className="font-black">{order.status === 'cancelled' ? getStatusBadge(order) : order.remainingAmount > 0 ? <span className="font-mono text-rose-600">{order.remainingAmount} ر.س</span> : <Badge variant="emerald">مدفوع</Badge>}</td>
                    <td>{getStatusBadge(order)}</td>
                    <td className="text-center"><Button variant="secondary" size="sm" onClick={() => onSelectOrder(order)}>عرض</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
