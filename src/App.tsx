import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Loader2, RotateCcw, Upload } from 'lucide-react';
import { UserPreferences, Customer, Order, MeasurementHistoryRecord } from './types';
import { VALIDATION_SCHEMAS, validateEntity, validateEntityErrors } from './domain/validation';
import { useToastContext } from './application/ToastProvider';
import { useAppDataContext } from './application/AppDataProvider';
import { usePreferencesContext } from './application/PreferencesProvider';
import { useAppBootstrap } from './application/useAppBootstrap';
import { useBackupController } from './application/useBackupController';
import { useCustomersController } from './application/useCustomersController';
import { useOrdersController } from './application/useOrdersController';
import { useInventoryController } from './application/useInventoryController';
import { useAccountingController } from './application/useAccountingController';
import { useNotificationsController } from './application/useNotificationsController';
import { AppSession } from './application/sessionTypes';

export { VALIDATION_SCHEMAS, validateEntity, validateEntityErrors };

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Button, Toast, LoadingSpinner } from './components/ui';
import { ornamentPatternSoft } from './components/Ornaments';
import { BackupModal } from './components/BackupModal';
import { NotificationsModal } from './components/NotificationsModal';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const DashboardView = React.lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const CustomersView = React.lazy(() => import('./components/CustomersView').then((m) => ({ default: m.CustomersView })));
const OrdersView = React.lazy(() => import('./components/OrdersView').then((m) => ({ default: m.OrdersView })));
const InvoicesView = React.lazy(() => import('./components/InvoicesView').then((m) => ({ default: m.InvoicesView })));
const InventoryView = React.lazy(() => import('./components/InventoryView').then((m) => ({ default: m.InventoryView })));
const ReportsView = React.lazy(() => import('./components/ReportsView').then((m) => ({ default: m.ReportsView })));
const AccountingView = React.lazy(() => import('./components/AccountingView').then((m) => ({ default: m.AccountingView })));
const SettingsView = React.lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));

export default function App() {
  const { data, setData, dataRevision, setDataRevision, lastUpdatedAt, setLastUpdatedAt, gateway } = useAppDataContext();
  const { prefs, setPrefs } = usePreferencesContext();
  const { toast, showToast, executeCrud, crudProgress, undoTimerRef, handleCloseToast } = useToastContext();
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [triggerNewOrderModal, setTriggerNewOrderModal] = useState(false);
  const [customerForNewOrder, setCustomerForNewOrder] = useState<Customer | null>(null);
  const [measurementForNewOrder, setMeasurementForNewOrder] = useState<MeasurementHistoryRecord | null>(null);
  const { loadAppData, persistData, refreshSlices } = useAppBootstrap({
    data,
    setData,
    setPrefs,
    setIsLoading,
    setDataRevision,
    setLastUpdatedAt,
    setBootstrapError,
    gateway,
  });
  const { offerDeleteUndo } = useBackupController(loadAppData, showToast, gateway);

  const session: AppSession = {
    data,
    showToast,
    executeCrud,
    loadAppData,
    persistData,
    refreshSlices,
    offerDeleteUndo,
    gateway,
  };

  const { handleSaveCustomer, handleDeleteCustomer } = useCustomersController(session);
  const {
    handleSaveOrder,
    handleUpdateOrderStatus,
    handleDeleteOrder,
    handleAddPayment,
    handleSendWhatsAppNotice,
  } = useOrdersController(session);
  const {
    handleSaveFabric,
    handleDeleteFabric,
    handleSaveAccessory,
    handleDeleteAccessory,
    handleAdjustStock,
    handleSaveThobeType,
    handleSaveColor,
    handleDeleteThobeType,
    handleDeleteColor,
  } = useInventoryController(session);
  const { handleCreatePurchase, handleCreateExpense, handleCreateCashAdjustment } = useAccountingController(session);
  const { handleMarkAllNotificationsRead, handleClearNotifications } = useNotificationsController(session);

  useEffect(() => {
    void loadAppData();
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, [loadAppData, undoTimerRef]);

  const handleTabChange = useCallback((tabId: string) => {
    setPrefs((prev) => ({ ...prev, activeTab: tabId }));
    void window.electronAPI.savePreferences({ activeTab: tabId });
    setSelectedOrderForDetail(null);
    setTriggerNewOrderModal(false);
    setCustomerForNewOrder(null);
    setMeasurementForNewOrder(null);
  }, []);

  const handleUseMeasurementForOrder = (customer: Customer, snapshot: MeasurementHistoryRecord | null) => {
    setCustomerForNewOrder(customer);
    setMeasurementForNewOrder(snapshot);
    setSelectedOrderForDetail(null);
    setPrefs((prev) => ({ ...prev, activeTab: 'orders' }));
    void window.electronAPI.savePreferences({ activeTab: 'orders' });
    setTriggerNewOrderModal(true);
    window.setTimeout(() => {
      setTriggerNewOrderModal(false);
      setCustomerForNewOrder(null);
      setMeasurementForNewOrder(null);
    }, 0);
    showToast(snapshot ? 'تم تجهيز الطلب بالمقاس التاريخي المختار فقط' : 'تم تجهيز الطلب بآخر مقاس محفوظ فقط', 'info');
  };

  const handleUpdateInvoiceMode = useCallback((mode: 'detailed' | 'summary') => {
    setPrefs((prev) => ({ ...prev, invoicePrintMode: mode }));
    void window.electronAPI.savePreferences({ invoicePrintMode: mode });
  }, []);

  const handleSaveShopSettings = useCallback(async (shopPrefs: Partial<UserPreferences>) => {
    const saved = await window.electronAPI.savePreferences(shopPrefs);
    if (saved === false) throw new Error('تعذر حفظ إعدادات المحل');
    setPrefs((prev) => ({ ...prev, ...shopPrefs }));
  }, []);

  const handleRefreshDashboard = useCallback(async () => {
    setIsDashboardRefreshing(true);
    try {
      await refreshSlices(['orders', 'invoices', 'fabrics', 'accessories', 'notifications']);
    } finally {
      setIsDashboardRefreshing(false);
    }
  }, [refreshSlices]);

  const handleOpenBackupModal = useCallback(() => setIsBackupModalOpen(true), []);
  const handleOpenNotifications = useCallback(() => setIsNotificationsModalOpen(true), []);
  const handlePrintScreen = useCallback(() => window.print(), []);

  const unreadNotifCount = useMemo(
    () => data?.notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0) ?? 0,
    [data?.notifications]
  );

  const overdueOrdersCount = useMemo(
    () => (data?.orders ?? []).filter((order) =>
      order.status !== 'delivered' &&
      order.status !== 'cancelled' &&
      order.deliveryDate &&
      order.deliveryDate <= new Date().toISOString().slice(0, 10)
    ).length,
    [data?.orders]
  );

  const headerInfo = useMemo(() => {
    switch (prefs.activeTab) {
      case 'dashboard': return { title: 'لوحة التحكم والمتابعة', description: 'نظرة عامة على الطلبات، التنبيهات، ونواقص المخزون' };
      case 'customers': return { title: 'إدارة العملاء والمقاسات', description: 'سجل كامل لمقاسات وتفاصيل موديلات خياطة كل عميل' };
      case 'orders': return { title: 'إدارة طلبات الخياطة', description: 'متابعة مراحل التنفيذ، التسليم، وطباعة الكروت' };
      case 'invoices': return { title: 'الفواتير وسجل الحسابات', description: 'تسديد الدفعات، متابعة المتبقي، ومعاينة الفواتير' };
      case 'inventory': return { title: 'إدارة المخزون والأصناف', description: 'أصول الأقمشة، الإكسسوارات، موديلات الثياب، والألوان' };
      case 'accounting': return { title: 'المحاسبة والمشتريات والصندوق', description: 'ربط المشتريات والمصروفات والدفعات بالرصيد والتقارير' };
      case 'reports': return { title: 'التقارير والإحصائيات المالية', description: 'متابعة المبيعات، الإيرادات، وتصدير التقارير لـ Excel' };
      case 'settings': return { title: 'إعدادات المحل والطباعة', description: 'بيانات المحل التي تظهر في ترويسة الفواتير وكروت الطباعة' };
      default: return { title: 'صهوة للخياطة', description: 'نظام إدارة الخياطة الرجالية' };
    }
  }, [prefs.activeTab]);

  const handleRetryBootstrap = useCallback(() => {
    void loadAppData();
  }, [loadAppData]);

  const handleOpenBackupFolder = useCallback(async () => {
    try {
      const info = await window.electronAPI.automationStorageInfo?.();
      if (info?.backupDir) {
        try {
          await navigator.clipboard.writeText(info.backupDir);
        } catch {
          /* clipboard may be unavailable */
        }
        window.alert(`مجلد النسخ الاحتياطية:\n${info.backupDir}`);
        return;
      }
    } catch {
      /* automationStorageInfo is unavailable outside packaged automation */
    }
    backupFileInputRef.current?.click();
  }, []);

  const handleRestoreBackupFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsRestoringBackup(true);
    try {
      const content = await file.text();
      const result = await gateway.restoreFromJson(content) as { success?: boolean; error?: string };
      if (result && result.success === false) {
        setBootstrapError(result.error || 'تعذر استعادة النسخة الاحتياطية');
        return;
      }
      await loadAppData();
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : 'تعذر استعادة النسخة الاحتياطية');
    } finally {
      setIsRestoringBackup(false);
    }
  }, [gateway, loadAppData]);

  if (bootstrapError && !isLoading) {
    return (
      <div dir="rtl" className="h-screen bg-[var(--ui-charcoal)] flex items-center justify-center p-6">
        <div role="alert" className="w-full max-w-lg rounded-2xl border border-rose-200 bg-[var(--ui-ivory)] p-8 text-center shadow-xl">
          <h1 className="text-xl font-black text-rose-900">تعذر تحميل نظام صهوة</h1>
          <p className="mt-3 text-sm font-bold leading-7 text-slate-700">
            حدث خطأ أثناء قراءة البيانات. يمكنك إعادة المحاولة، فتح مجلد النسخ الاحتياطية، أو استعادة نسخة احتياطية.
          </p>
          <p className="mt-3 text-xs font-bold text-rose-800">{bootstrapError}</p>
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleRestoreBackupFile}
          />
          <div className="mt-6 flex flex-col gap-3">
            <Button variant="primary" icon={<RotateCcw className="w-4 h-4" />} onClick={handleRetryBootstrap}>
              إعادة المحاولة
            </Button>
            <Button variant="secondary" icon={<FolderOpen className="w-4 h-4" />} onClick={() => void handleOpenBackupFolder()}>
              فتح مجلد النسخ الاحتياطية
            </Button>
            <Button
              variant="outline-dark"
              icon={<Upload className="w-4 h-4" />}
              isLoading={isRestoringBackup}
              onClick={() => backupFileInputRef.current?.click()}
            >
              استعادة نسخة احتياطية
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="h-screen bg-[var(--ui-charcoal)] flex items-center justify-center">
        <LoadingSpinner label="جاري تحميل نظام صهوة للخياطة..." />
      </div>
    );
  }

  return (
    <div dir="rtl" className="h-screen overflow-hidden bg-[var(--ui-ivory)] text-slate-900 flex flex-row dir-rtl font-['Tajawal']">
      <Toast toast={toast} onClose={handleCloseToast} />

      <Sidebar
        activeTab={prefs.activeTab}
        onTabChange={handleTabChange}
        onOpenBackupModal={handleOpenBackupModal}
        unreadNotifCount={unreadNotifCount}
        overdueOrdersCount={overdueOrdersCount}
        managerName={prefs.managerName}
      />

      <main
        className="flex-1 flex flex-col min-w-0 overflow-y-auto h-full"
        aria-busy={isDashboardRefreshing}
        style={{ backgroundImage: ornamentPatternSoft, backgroundSize: '96px 96px' }}
      >
        <Header
          title={headerInfo.title}
          description={headerInfo.description}
          unreadNotifCount={unreadNotifCount}
          onOpenNotifications={handleOpenNotifications}
          onPrintScreen={handlePrintScreen}
        />

        <div className="p-6">
          <AppErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner label="جاري تحميل الصفحة..." /></div>}>
          {prefs.activeTab === 'dashboard' && (
            <DashboardView
              data={data}
              dataRevision={dataRevision}
              onNavigateTab={handleTabChange}
              onRefreshDashboard={handleRefreshDashboard}
              isRefreshing={isDashboardRefreshing}
              lastUpdatedAt={lastUpdatedAt}
              onSelectOrder={(ord) => {
                setSelectedOrderForDetail(ord);
                handleTabChange('orders');
              }}
              onOpenNewOrderModal={() => {
                handleTabChange('orders');
                setTriggerNewOrderModal(true);
              }}
            />
          )}

          {prefs.activeTab === 'customers' && (
            <CustomersView
              customers={data.customers}
              onSaveCustomer={handleSaveCustomer}
              onDeleteCustomer={handleDeleteCustomer}
              onUseMeasurementForOrder={handleUseMeasurementForOrder}
              customerCredits={data.customerCredits || []}
              onCustomerCreditChanged={async () => { await loadAppData(); }}
              showToast={showToast}
            />
          )}

          {prefs.activeTab === 'orders' && (
            <OrdersView
              orders={data.orders}
              invoices={data.invoices}
              customers={data.customers}
              fabrics={data.fabrics}
              accessories={data.accessories}
              thobeTypes={data.thobeTypes}
              userPreferences={prefs}
              onSaveOrder={handleSaveOrder}
              onSaveCustomer={async (customer) => { await handleSaveCustomer(customer); }}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onDeleteOrder={handleDeleteOrder}
              onSendWhatsAppNotice={handleSendWhatsAppNotice}
              showToast={showToast}
              initialSelectedOrder={selectedOrderForDetail}
              openNewOrderTrigger={triggerNewOrderModal}
              initialCustomerForOrder={customerForNewOrder}
              initialMeasurementForOrder={measurementForNewOrder}
            />
          )}

          {prefs.activeTab === 'invoices' && (
            <InvoicesView
              invoices={data.invoices}
              orders={data.orders}
              invoicePrintMode={prefs.invoicePrintMode}
              userPreferences={prefs}
              onUpdateInvoiceMode={handleUpdateInvoiceMode}
              onNavigateTab={handleTabChange}
              onAddPayment={handleAddPayment}
              showToast={showToast}
            />
          )}

          {prefs.activeTab === 'inventory' && (
            <InventoryView
              fabrics={data.fabrics}
              accessories={data.accessories}
              thobeTypes={data.thobeTypes}
              colors={data.colors}
              onSaveFabric={handleSaveFabric}
              onDeleteFabric={handleDeleteFabric}
              onSaveAccessory={handleSaveAccessory}
              onDeleteAccessory={handleDeleteAccessory}
              onSaveThobeType={handleSaveThobeType}
              onDeleteThobeType={handleDeleteThobeType}
              onSaveColor={handleSaveColor}
              onDeleteColor={handleDeleteColor}
              stockMovements={data.stockMovements || []}
              onAdjustStock={handleAdjustStock}
              showToast={showToast}
            />
          )}

          {prefs.activeTab === 'reports' && (
            <ReportsView data={data} dataRevision={dataRevision} showToast={showToast} />
          )}

          {prefs.activeTab === 'accounting' && (
            <AccountingView
              fabrics={data.fabrics}
              accessories={data.accessories}
              purchases={data.purchases || []}
              expenses={data.expenses || []}
              cashTransactions={data.cashTransactions || []}
              invoices={data.invoices}
              customerCredits={data.customerCredits || []}
              onCreatePurchase={handleCreatePurchase}
              onCreateExpense={handleCreateExpense}
              onCreateCashAdjustment={handleCreateCashAdjustment}
              showToast={showToast}
            />
          )}

          {prefs.activeTab === 'settings' && (
            <SettingsView
              preferences={prefs}
              onSaveShopSettings={handleSaveShopSettings}
              showToast={showToast}
            />
          )}
            </Suspense>
          </AppErrorBoundary>
        </div>
      </main>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onRefreshData={loadAppData}
        showToast={showToast}
      />

      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        notifications={data.notifications}
        onMarkAllAsRead={handleMarkAllNotificationsRead}
        onClearNotifications={handleClearNotifications}
      />

      {crudProgress.isExecuting && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all no-print">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center gap-3 min-w-[280px] max-w-sm text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">{crudProgress.label}</h4>
              <p className="text-xs text-slate-500 mt-1 font-semibold">جاري تنفيذ العملية والتواصل مع قاعدة البيانات...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
