// @ts-nocheck
import React, { useState } from 'react';
import { AppData } from '../types';
import { calculateReportProjection, formatReportStatus } from '../domain/reportMetrics';
import { DataRevision } from '../state/appDataStore';
import { getCachedDerivedValue } from '../services/derivedDataCache';
import { Button, Badge, Card, EmptyState, SegmentedControl, getOrderStatusBadgeVariant } from './ui';
import {
  BarChart3,
  FileSpreadsheet,
  Printer,
  DollarSign,
  TrendingUp,
  Scissors,
  Wallet,
  FileText
} from 'lucide-react';

export interface ReportsViewProps {
  data: AppData;
  showToast: (msg: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
  dataRevision: DataRevision;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ data, dataRevision, showToast }) => {
  const [periodFilter, setPeriodFilter] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { orders, invoices, fabrics, accessories, purchases, expenses, cashTransactions, stockMovements, customerCredits, orderEvents, orderMaterialUsages } = data;
  const reportCacheKey = `reports:${dataRevision.global}:${periodFilter}:${startDate}:${endDate}`;
  const inventoryStats = React.useMemo(() => getCachedDerivedValue(`inventory:${dataRevision.inventory}`, () => ({
    inventoryValue: fabrics.reduce((sum, fabric) => sum + (fabric.quantityMeters * (fabric.purchasePrice || 0)), 0) + accessories.reduce((sum, accessory) => sum + (accessory.quantity * (accessory.purchasePrice || 0)), 0),
    lowStockItems: [
      ...fabrics.filter((fabric) => fabric.quantityMeters <= fabric.minStockMeters).map((fabric) => fabric.name),
      ...accessories.filter((accessory) => accessory.quantity <= accessory.minStock).map((accessory) => accessory.name)
    ]
  })), [accessories, dataRevision.inventory, fabrics]);

  const reportStats = React.useMemo(() => getCachedDerivedValue(reportCacheKey, () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const range = periodFilter === 'today'
      ? { startDate: today, endDate: today }
      : periodFilter === 'week'
        ? { startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), endDate: today }
        : periodFilter === 'month'
          ? { startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), endDate: today }
          : periodFilter === 'year'
            ? { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` }
            : { startDate, endDate };
    const projection = calculateReportProjection({
      orders,
      invoices,
      cashTransactions,
      customerCredits,
      purchases,
      expenses,
      stockMovements,
      orderEvents,
      orderMaterialUsages,
      ...range
    });
    const consumptionByItem = projection.filteredMovements.filter((movement) => movement.direction === 'sale').reduce((result: Record<string, number>, movement) => {
      result[movement.itemName] = (result[movement.itemName] || 0) + movement.quantity;
      return result;
    }, {} as Record<string, number>);
    const topConsumption = Object.entries(consumptionByItem).sort(([, first], [, second]) => Number(second) - Number(first)).slice(0, 5);
    return {
      projection,
      filteredOrders: projection.details.map((row) => row.order),
      filteredCash: projection.filteredCash,
      filteredMovements: projection.filteredMovements,
      totalOrdersCount: projection.totalOrdersCount,
      cancelledOrdersCount: projection.cancelledOrdersCount,
      settledByCancellationCount: projection.settledByCancellationCount,
      totalSales: projection.salesBooked,
      actualRevenue: projection.recognizedRevenue,
      collectedAmount: projection.appliedCollected,
      cashReceived: projection.cashReceived,
      overpaymentCreated: projection.overpaymentCreated,
      overpaymentApplied: projection.overpaymentApplied,
      overpaymentRefunded: projection.overpaymentRefunded,
      customerCreditCashRefunds: projection.customerCreditCashRefunds,
      customerCreditNonCashRefunds: projection.customerCreditNonCashRefunds,
      closingCustomerCreditLiability: projection.closingCustomerCreditLiability,
      cancellationWriteoff: projection.cancellationWriteoff,
      remainingAmount: projection.activeOutstanding,
      totalPurchases: projection.totalPurchases,
      totalExpenses: projection.totalExpenses,
      materialCost: projection.recognizedMaterialCost,
      grossProfit: projection.grossProfit,
      netProfit: projection.netProfit,
      avgOrderValue: projection.salesOrdersCount > 0 ? Math.round(projection.salesBooked / projection.salesOrdersCount) : 0,
      inventoryValue: inventoryStats.inventoryValue,
      lowStockItems: inventoryStats.lowStockItems,
      topConsumption
    };
  }), [customerCredits, expenses, invoices, inventoryStats, orderEvents, orderMaterialUsages, orders, periodFilter, purchases, reportCacheKey, startDate, endDate, stockMovements, cashTransactions]);

  const {
    projection,
    filteredOrders,
    filteredCash,
    filteredMovements,
    totalOrdersCount,
    cancelledOrdersCount,
    settledByCancellationCount,
    totalSales,
    actualRevenue,
    collectedAmount,
    cashReceived,
    overpaymentCreated,
    overpaymentApplied,
    overpaymentRefunded,
    customerCreditCashRefunds,
    customerCreditNonCashRefunds,
    closingCustomerCreditLiability,
    cancellationWriteoff,
    remainingAmount,
    totalPurchases,
    totalExpenses,
    materialCost,
    grossProfit,
    netProfit,
    avgOrderValue,
    inventoryValue,
    lowStockItems,
    topConsumption
  } = reportStats;
  const reportDetails = projection.details;

  const getExportDateRange = () => {
    const now = new Date();
    const toIsoDate = (date: Date) => date.toISOString().split('T')[0];
    if (periodFilter === 'today') return { start: toIsoDate(now), end: toIsoDate(now) };
    if (periodFilter === 'week') return { start: toIsoDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)), end: toIsoDate(now) };
    if (periodFilter === 'month') return { start: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: toIsoDate(now) };
    if (periodFilter === 'year') return { start: toIsoDate(new Date(now.getFullYear(), 0, 1)), end: toIsoDate(new Date(now.getFullYear(), 11, 31)) };
    return { start: startDate, end: endDate };
  };

  // Export through the real Electron/SQLite path so the visible report cannot diverge from persisted data.
  const handleExportExcel = async () => {
    try {
      if (!window.electronAPI.exportExcelReport) throw new Error('Excel export is unavailable');
      const { start, end } = getExportDateRange();
      const reportBase64 = await window.electronAPI.exportExcelReport(start, end);
      if (!reportBase64) throw new Error('Excel report returned no data');

      const binary = atob(reportBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sahwa_financial_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('تم تصدير ملف التقرير Excel بنجاح!', 'success');
    } catch (e) {
      showToast('تعذر إنشاء ملف Excel. يرجى المحاولة لاحقاً.', 'danger');
    }
  };

  // Export to CSV using standard browser Blob APIs
  const handleExportCSV = () => {
    try {
      const headers = ['م', 'رقم العميل', 'رقم الفاتورة', 'رقم الطلب', 'اسم العميل', 'رقم الجوال', 'نوع الثوب', 'القماش', 'تاريخ الطلب', 'الحالة', 'حالة التسوية', 'داخل المبيعات', 'applied_paid (ر.س)', 'cash_received (ر.س)', 'overpayment (ر.س)', 'cancellation writeoff (ر.س)', 'الإجمالي (ر.س)', 'المتبقي (ر.س)', 'تكلفة المواد (ر.س)', 'الربح المعترف به (ر.س)'];
      const rows = reportDetails.map((detail, idx) => {
        const ord = detail.order;
        const customer = data.customers.find((item) => item.id === ord.customerId);
        const invoice = invoices.find((item) => item.orderId === ord.id);
        const visibleInvoiceNumber = invoice?.visibleInvoiceNumber ? `INV-${invoice.visibleInvoiceNumber}` : invoice?.invoiceNumber || '';
        return [
          idx + 1,
          customer?.customerNumber || '',
          visibleInvoiceNumber,
          ord.orderNumber,
          `"${ord.customerName}"`,
          ord.customerPhone,
          `"${ord.thobeTypeName}"`,
          `"${ord.fabricName}"`,
          ord.orderDate,
          ord.status === 'cancelled' ? 'ملغى' : ord.status === 'delivered' ? 'مُسلم' : ord.status === 'ready' ? 'جاهز' : ord.status === 'processing' ? 'تحت التنفيذ' : 'جديد',
          formatReportStatus(detail.settlementStatus),
          detail.includedInSales ? 'نعم' : 'لا',
          detail.appliedPaid,
          detail.cashReceived,
          detail.overpaymentAmount,
          detail.cancellationWriteoffAmount,
          ord.totalAmount,
          ord.remainingAmount,
          detail.materialCost || 0,
          detail.includedInRecognizedRevenue ? (ord.totalAmount || 0) - (detail.materialCost || 0) : 0
        ];
      });

      const customerCreditSection = [
        [],
        ['Customer Credit Section'],
        ['metric', 'value', 'net_profit_impact', 'cash_received_impact', 'applied_collected_impact', 'recognized_revenue_impact'],
        ['overpayment_created', projection.overpaymentCreated, 0, 0, 0, 0],
        ['overpayment_applied', projection.overpaymentApplied, 0, 0, 0, 0],
        ['overpayment_refunded', projection.overpaymentRefunded, 0, 0, 0, 0],
        ['customer_credit_cash_refunds', customerCreditCashRefunds, 0, 0, 0, 0],
        ['customer_credit_non_cash_refunds', customerCreditNonCashRefunds, 0, 0, 0, 0],
        ['closing_customer_credit_liability', closingCustomerCreditLiability, 0, 0, 0, 0]
      ];
      const csvContent = [headers.join(','), ...rows.map(r => r.join(',')), ...customerCreditSection.map(r => r.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sahwa_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('تم تصدير ملف CSV عبر Blob APIs بنجاح!', 'success');
    } catch (e) {
      showToast('حدث خطأ أثناء تصدير ملف CSV', 'danger');
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Printable Report Header */}
      <div className="hidden print:block printable-area bg-white text-black p-8 font-['Tajawal'] dir-rtl">
        <div className="border-2 border-black p-6 space-y-4">
          <div className="flex justify-between items-center border-b-2 border-black pb-4">
            <div>
              <h1 className="text-2xl font-black">صهوة للخياطة الرجالية</h1>
              <p className="text-xs font-bold">تقرير الأداء المالي والمبيعات التفصيلي</p>
            </div>
            <span className="text-xs">{new Date().toLocaleString('ar-SA')}</span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs border border-black p-3 bg-gray-50">
            <div>إجمالي الطلبات: <strong>{totalOrdersCount}</strong></div>
            <div>الإيرادات المُسلّمة: <strong>{actualRevenue} ر.س</strong></div>
            <div>تكلفة القماش: <strong>{Math.round(materialCost)} ر.س</strong></div>
            <div>صافي الربح: <strong>{Math.round(netProfit)} ر.س</strong></div>
          </div>

          <table className="w-full text-xs border-collapse border border-black text-right mt-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border border-black">#</th>
                <th className="p-2 border border-black">العميل</th>
                <th className="p-2 border border-black">نوع الثوب</th>
                <th className="p-2 border border-black">تاريخ التسليم</th>
                <th className="p-2 border border-black">السعر الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((ord) => (
                <tr key={ord.id} className="border-b border-black">
                  <td className="p-2 border border-black">#{ord.orderNumber}</td>
                  <td className="p-2 border border-black">{ord.customerName}</td>
                  <td className="p-2 border border-black">{ord.thobeTypeName}</td>
                  <td className="p-2 border border-black">{ord.deliveryDate}</td>
                  <td className="p-2 border border-black font-bold">{ord.totalAmount} ر.س</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Header */}
      <Card
        title="التقارير والإحصائيات المالية"
        subtitle="متابعة الأداء المالي، الإيرادات والمبيعات حسب النطاق الزمني"
        headerIcon={<BarChart3 className="w-5 h-5" />}
        headerOnly
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={handleExportExcel}
              icon={<FileSpreadsheet className="w-4 h-4" />}
            >
              تصدير Excel
            </Button>
            <Button
              variant="secondary"
              onClick={handleExportCSV}
              icon={<FileSpreadsheet className="w-4 h-4 text-amber-700" />}
            >
              تصدير CSV (Blob)
            </Button>
            <Button
              variant="secondary"
              onClick={handlePrintReport}
              icon={<Printer className="w-4 h-4 text-slate-700" />}
            >
              طباعة التقرير
            </Button>
          </div>
        )}
      />

      {/* Date Filter Toolbar Card */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-[#DEDEDA] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <SegmentedControl
          value={periodFilter as 'today' | 'week' | 'month' | 'year' | 'custom'}
          onChange={setPeriodFilter}
          ariaLabel="تصفية الفترة الزمنية للتقرير"
          options={[
            { value: 'today', label: 'اليوم' },
            { value: 'week', label: 'هذا الأسبوع' },
            { value: 'month', label: 'هذا الشهر' },
            { value: 'year', label: 'هذا العام' },
            { value: 'custom', label: 'فترة مخصصة' }
          ]}
        />

        {/* Custom Range Picker */}
        {periodFilter === 'custom' && (
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-600">من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
            />
            <span className="text-xs font-bold text-slate-600">إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
            />
          </div>
        )}
      </div>

      {/* Financial Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Total Orders */}
        <div className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">إجمالي الطلبات</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">{totalOrdersCount}</div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">طلب مسجل في الفترة</span>
        </div>

        {/* 2. Actual Delivered Revenue */}
        <div className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">الإيرادات الفعلية</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">{actualRevenue} ر.س</div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">الإيراد المعترف به وفق تاريخ التسليم</span>
        </div>

        {/* 3. Fabric Cost */}
        <div className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">تكلفة الأقمشة</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-700">
              <Scissors className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">{Math.round(materialCost)} ر.س</div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">تقدير الأمتار المستهلكة</span>
        </div>

        {/* 4. Net Profit */}
        <div className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">صافي الربح التقديري</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">{Math.round(netProfit)} ر.س</div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">الإيراد المعترف به ناقص المواد والمصروفات</span>
        </div>

        {/* 5. Average Order Value */}
        <div className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500">متوسط قيمة الطلب</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">{avgOrderValue} ر.س</div>
          <span className="text-[11px] text-slate-400 font-medium block mt-1">لكل ثوب</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ['المبيعات المسجلة', totalSales, 'الطلبات غير الملغاة حسب تاريخ الطلب', 'text-slate-900'],
          ['الإيراد المعترف به', actualRevenue, 'الطلبات المُسلّمة حسب تاريخ التسليم', 'text-emerald-700'],
          ['التحصيل المطبق', collectedAmount, 'التحصيل المطبق وفق تاريخ الدفعة', 'text-emerald-700'],
          ['النقد المستلم', cashReceived, 'يشمل المبالغ الزائدة المستلمة نقداً فقط', 'text-slate-900'],
          ['التزام ائتمان العملاء', closingCustomerCreditLiability, 'الرصيد المنشأ ناقص المطبق والمسترد', 'text-amber-700'],
          ['تسوية الإلغاء غير النقدية', cancellationWriteoff, 'لا تدخل في الربح أو النقد', 'text-amber-700'],
          ['المبالغ المتبقية', remainingAmount, 'على الطلبات النشطة', 'text-amber-700'],
          ['إجمالي المشتريات', totalPurchases, 'مخزون تم اعتماده', 'text-rose-700'],
          ['إجمالي المصروفات', totalExpenses, 'خارج الصندوق', 'text-rose-700'],
          ['قيمة المخزون', inventoryValue, 'بسعر الشراء الحالي', 'text-slate-900']
        ].map(([label, value, note, tone]) => (
          <div key={label as string} className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <p className={`text-2xl font-black font-mono mt-3 ${tone}`}>{Number(value).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س</p>
            <p className="text-[11px] text-slate-400 font-medium mt-1">{note}</p>
          </div>
        ))}
        <div className="bg-white border border-[#DEDEDA] rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500">أصناف منخفضة المخزون</p>
          <p className="text-2xl font-black font-mono mt-3 text-rose-700">{lowStockItems.length}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">{lowStockItems.slice(0, 4).map((item) => <Badge key={item} variant="red">{item}</Badge>)}{lowStockItems.length > 4 && <Badge variant="slate">+{lowStockItems.length - 4}</Badge>}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="customer-credit-reporting-section">
        <span className="sr-only">Customer Credit liability Overpayment created Cash refunds Non-cash refunds</span>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5"><span className="text-xs font-bold text-amber-800">التزام رصيد العملاء</span><div className="text-2xl font-black text-amber-800 font-mono mt-2">{closingCustomerCreditLiability} ر.س</div><span className="text-[11px] text-amber-700 block mt-1">لا يدخل في صافي الربح أو الإيراد المعترف به</span></div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5"><span className="text-xs font-bold text-slate-600">المبالغ الزائدة المنشأة</span><div className="text-2xl font-black text-slate-900 font-mono mt-2">{overpaymentCreated} ر.س</div><span className="text-[11px] text-slate-500 block mt-1">التزام منفصل للعميل</span></div>
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5"><span className="text-xs font-bold text-rose-800">الاستردادات النقدية</span><div className="text-2xl font-black text-rose-800 font-mono mt-2">{customerCreditCashRefunds} ر.س</div><span className="text-[11px] text-rose-700 block mt-1">خروج نقدي منفصل</span></div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5"><span className="text-xs font-bold text-slate-600">الاستردادات غير النقدية</span><div className="text-2xl font-black text-slate-900 font-mono mt-2">{customerCreditNonCashRefunds} ر.س</div><span className="text-[11px] text-slate-500 block mt-1">لا يغير رصيد الصندوق</span></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="الأكثر استهلاكاً"
          subtitle="حسب حركات صرف المواد في الفترة"
          headerIcon={<Scissors className="w-5 h-5" />}
          bodyClassName="space-y-3"
        >
          {topConsumption.length === 0 ? <p className="text-sm text-slate-400 font-bold">لا توجد حركات صرف في الفترة.</p> : topConsumption.map(([name, quantity], index) => <div key={name} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><span className="text-sm font-black">{index + 1}. {name}</span><Badge variant="slate">{quantity} وحدة صرف</Badge></div>)}
        </Card>
        <Card
          title="ملخص الفترة"
          subtitle="المبيعات ناقص المواد والمصروفات"
          headerIcon={<Wallet className="w-5 h-5" />}
          bodyClassName="grid grid-cols-2 gap-4 text-sm"
        >
          <div><span className="text-slate-500 font-bold">الربح الإجمالي المعترف به</span><p className="font-black text-lg mt-1">{Math.round(grossProfit)} ر.س</p></div><div><span className="text-slate-500 font-bold">صافي الربح</span><p className={`font-black text-lg mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{Math.round(netProfit)} ر.س</p></div><div><span className="text-slate-500 font-bold">التزام ائتمان العملاء</span><p className="font-black text-lg mt-1">{closingCustomerCreditLiability} ر.س</p></div><div><span className="text-slate-500 font-bold">تسوية الإلغاء غير النقدية</span><p className="font-black text-lg mt-1">{cancellationWriteoff} ر.س</p></div><div><span className="text-slate-500 font-bold">حركات الصندوق</span><p className="font-black text-lg mt-1">{filteredCash.length}</p></div><div><span className="text-slate-500 font-bold">حركات المخزون</span><p className="font-black text-lg mt-1">{filteredMovements.length}</p></div>
        </Card>
      </div>

      {/* Orders Performance Table */}
      <Card
        title="سجل الأداء المالي والطلبات"
        subtitle={`إجمالي الحركات في النطاق المحدد: ${filteredOrders.length} طلب`}
        headerIcon={<BarChart3 className="w-5 h-5" />}
        bodyClassName="p-0"
        className="overflow-hidden"
      >

        {filteredOrders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              icon={<BarChart3 className="w-8 h-8 text-slate-400" />}
              title="لا توجد بيانات للفترة المحددة"
              description="يرجى تغيير نطاق التاريخ أو اختيار فترة مختلفة لعرض الإحصائيات."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sahwa-table w-full text-right text-xs">
              <thead className="bg-[#F0F0EE]/70 border-b border-[#DEDEDA] text-[#242424] font-bold">
                <tr>
                  <th className="p-3.5 text-center w-20">رقم الطلب</th>
                  <th className="p-3.5">العميل</th>
                  <th className="p-3.5">نوع الثوب والقماش</th>
                  <th className="p-3.5">تاريخ الطلب</th>
                  <th className="p-3.5">تاريخ التسليم</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5 text-left pl-6">إجمالي المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-[#F0F0EE]/50 transition-colors">
                    <td title={ord.orderNumber} className="p-3.5 text-center font-black text-slate-900 font-mono">#{ord.orderNumber}</td>
                    <td title={ord.customerName} className="p-3.5 font-extrabold text-slate-900">{ord.customerName}</td>
                    <td className="p-3.5 text-slate-600 font-medium">
                      <div title={ord.thobeTypeName}>{ord.thobeTypeName}</div>
                      <div title={ord.fabricName} className="text-[11px] text-slate-400">{ord.fabricName}</div>
                    </td>
                    <td className="p-3.5 text-slate-600 font-mono">{ord.orderDate}</td>
                    <td className="p-3.5 text-slate-600 font-mono">{ord.deliveryDate}</td>
                    <td className="p-3.5">
                      <Badge variant={getOrderStatusBadgeVariant(ord.status, ord.cancellationWriteoffAmount)}>
                        {formatReportStatus(reportDetails.find((detail) => detail.order.id === ord.id)?.settlementStatus || 'none')}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-left pl-6 font-black text-slate-900 font-mono text-sm">
                      {ord.totalAmount} ر.س
                    </td>
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
