// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { Customer, CustomerCreditOperationResult, CustomerCreditRecord, CustomerMeasurements, CustomerStyleDetails, MeasurementHistoryRecord } from '../types';
import { calculateCustomerCreditBalance } from '../domain/customerCreditRules';
import { createSafeId } from '../domain/idGenerator';
import { EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS } from '../services/shared/measurementDefaults';
import { Card, Button, Input, EmptyState, SortHeader, SortDirection } from './ui';
import { ConfirmModal } from './ConfirmModal';
import { MeasurementsTableForm } from './MeasurementsTableForm';
import { CustomerCreditRefundModal } from './CustomerCreditRefundModal';
import {
  Users,
  Search,
  Ruler,
  History,
  Save,
  Phone,
  User,
  Trash2,
  ArrowLeft,
  Calendar,
  Eye,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export interface CustomersViewProps {
  customers: Customer[];
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onUseMeasurementForOrder?: (customer: Customer, snapshot: MeasurementHistoryRecord | null) => void;
  customerCredits?: CustomerCreditRecord[];
  onCustomerCreditChanged?: () => Promise<void> | void;
  showToast: (msg: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  onSaveCustomer,
  onDeleteCustomer,
  onUseMeasurementForOrder,
  customerCredits = [],
  onCustomerCreditChanged,
  showToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSort, setCustomerSort] = useState<{ key: 'customerNumber' | 'name' | 'createdAt' | 'creditBalance'; direction: SortDirection }>({ key: 'customerNumber', direction: 'asc' });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<'measurements' | 'history'>('measurements');
  const [activeFormStage, setActiveFormStage] = useState<'basic' | 'measurements' | 'details' | 'review'>('basic');
  const [formErrors, setFormErrors] = useState<{ name?: string; phone?: string }>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [refundCustomer, setRefundCustomer] = useState<Customer | null>(null);
  const customerNameInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState<{
    id?: string;
    name: string;
    phone: string;
    measurements: CustomerMeasurements;
    styleDetails: CustomerStyleDetails;
  }>({
    name: '',
    phone: '',
    measurements: { ...EMPTY_MEASUREMENTS },
    styleDetails: { ...EMPTY_STYLE_DETAILS }
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(normalizedSearch) ||
      c.phone.includes(searchTerm.trim()) ||
      String(c.customerNumber ?? '').includes(searchTerm.trim())
  );
  const hasSearch = Boolean(searchTerm.trim());
  const creditEntriesFor = (customerId: string) => customerCredits.filter((entry) => entry.customerId === customerId);
  const creditBalanceFor = (customerId: string) => {
    try { return calculateCustomerCreditBalance(creditEntriesFor(customerId)); }
    catch { return 0; }
  };
  const toggleCustomerSort = (key: typeof customerSort.key) => {
    setCustomerSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  };
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    let comparison = 0;
    if (customerSort.key === 'customerNumber') {
      comparison = (a.customerNumber ?? Number.MAX_SAFE_INTEGER) - (b.customerNumber ?? Number.MAX_SAFE_INTEGER);
    } else if (customerSort.key === 'creditBalance') {
      comparison = creditBalanceFor(a.id) - creditBalanceFor(b.id);
    } else if (customerSort.key === 'createdAt') {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else {
      comparison = a.name.localeCompare(b.name, 'ar');
    }
    if (comparison === 0) comparison = a.id.localeCompare(b.id);
    return customerSort.direction === 'asc' ? comparison : -comparison;
  });
  const handleCustomerCreditSuccess = async (_result: CustomerCreditOperationResult) => {
    await onCustomerCreditChanged?.();
  };

  useEffect(() => {
    if (!isFormOpen) return;
    const frame = window.requestAnimationFrame(() => customerNameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isFormOpen]);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current && hasSearch) {
        setSearchTerm('');
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, [hasSearch]);

  const formatDate = (value?: string) => {
    if (!value) return '--';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ar-SA');
  };

  const handleOpenNewCustomer = () => {
    setSelectedCustomer(null);
    setFormData({ name: '', phone: '', measurements: { ...EMPTY_MEASUREMENTS }, styleDetails: { ...EMPTY_STYLE_DETAILS } });
    setFormErrors({});
    setActiveFormTab('measurements');
    setActiveFormStage('basic');
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      measurements: { ...customer.measurements },
      styleDetails: { ...customer.styleDetails }
    });
    setActiveFormTab('measurements');
    setActiveFormStage('basic');
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    const nextErrors: { name?: string; phone?: string } = {};
    if (!formData.name.trim()) nextErrors.name = 'يرجى إدخال اسم العميل بشكل صحيح';
    if (!formData.phone.trim()) nextErrors.phone = 'يرجى إدخال رقم الجوال بشكل صحيح';

    const phoneTrim = formData.phone.trim();
    const isDuplicatePhone = phoneTrim && customers.some((c) => c.phone === phoneTrim && c.id !== formData.id);
    if (isDuplicatePhone) nextErrors.phone = 'رقم الجوال هذا مسجل بالفعل لعميل آخر';

    if (Object.keys(nextErrors).length > 0) {
      setActiveFormStage('basic');
      setFormErrors(nextErrors);
      showToast('يرجى مراجعة الحقول المحددة قبل الحفظ', 'danger');
      return;
    }
    setActiveFormStage('review');
    setFormErrors({});

    const nowStr = new Date().toISOString();
    const newCust: Customer = {
      id: formData.id || createSafeId('CUST'),
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      createdAt: selectedCustomer ? selectedCustomer.createdAt : nowStr,
      updatedAt: nowStr,
      measurements: formData.measurements,
      styleDetails: formData.styleDetails,
      measurementHistory: selectedCustomer?.measurementHistory || []
    };

    if (!onSaveCustomer) {
      showToast('خدمة حفظ العملاء غير متاحة في هذه النسخة', 'danger');
      return;
    }
    try {
      await onSaveCustomer(newCust);
      showToast(selectedCustomer ? 'تم حفظ المقاس الجديد مع الاحتفاظ بالمقاس السابق' : 'تم حفظ بيانات العميل بنجاح', 'success');
      setIsFormOpen(false);
    } catch {
      // Keep the form open after a failed persistence operation so the user can retry.
    }
  };

  if (isFormOpen) {
    const formSteps = [
      { id: 'basic' as const, label: 'البيانات الأساسية' },
      { id: 'measurements' as const, label: 'المقاسات' },
      { id: 'details' as const, label: 'تفاصيل التفصيل' },
      { id: 'review' as const, label: 'المراجعة والحفظ' }
    ];

    return (
      <div className="view-wrapper customers-form-surface animate-in fade-in duration-300 overflow-x-hidden">
        <div className="customers-form-header sticky top-0 z-20 flex min-w-0 flex-col gap-3 border-b border-[var(--color-border-token)] bg-[var(--color-surface-soft-token)]/95 py-3 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="page-header">
            <button
              type="button"
              aria-label="العودة إلى قائمة العملاء"
              onClick={() => setIsFormOpen(false)}
              className="text-[13px] font-black text-[var(--color-text-muted-token)] hover:text-[var(--brand-black)] flex items-center gap-2 transition-colors mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-token)] focus-visible:ring-offset-2 rounded"
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
              العودة لقائمة العملاء
            </button>
            <h2 className="page-title flex items-center gap-3">
              <User className="w-7 h-7 text-[#111111]" />
              {selectedCustomer ? `تعديل ملف: ${selectedCustomer.name}` : 'تسجيل عميل جديد'}
            </h2>
          </div>

          <div className="customers-form-actions flex shrink-0 flex-wrap items-center gap-3">
            {selectedCustomer && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(true)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                حذف العميل
              </Button>
            )}
            <span className="hidden items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted-token)] sm:inline-flex" aria-live="polite">
              {activeFormStage === 'review' ? <CheckCircle2 className="h-4 w-4 text-[var(--color-success-token)]" /> : <AlertCircle className="h-4 w-4 text-[var(--color-warning-token)]" />}
              {activeFormStage === 'review' ? 'جاهز للحفظ' : 'المسودة قيد التحرير'}
            </span>
          </div>
        </div>

        <ol className="customers-form-progress" aria-label="مراحل تعبئة بيانات العميل والمقاسات">
          {formSteps.map((step, index) => {
            const isActive = step.id === activeFormStage;
            const isComplete = formSteps.findIndex((item) => item.id === activeFormStage) > index;
            return (
              <li key={step.id} data-state={isActive ? 'active' : isComplete ? 'complete' : 'upcoming'} aria-current={isActive ? 'step' : undefined}>
                <span className="customers-form-progress-index">{isComplete ? '✓' : index + 1}</span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="grid grid-cols-1 gap-8">
          <Card id="customer-basic-section" title="البيانات الأساسية" className="h-fit lg:col-span-1" onFocusCapture={() => setActiveFormStage('basic')}>
            <div className="space-y-5">
              <Input
                data-testid="customer-name"
                label="اسم العميل الكامل *"
                ref={customerNameInputRef}
                value={formData.name}
                onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors((prev) => ({ ...prev, name: undefined })); }}
                placeholder="مثال: محمد عبدالله"
                icon={<User className="w-4 h-4" />}
                error={formErrors.name}
              />
              <Input
                data-testid="customer-phone"
                label="رقم الجوال *"
                value={formData.phone}
                onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); setFormErrors((prev) => ({ ...prev, phone: undefined })); }}
                placeholder="05xxxxxxxx"
                icon={<Phone className="w-4 h-4" />}
                error={formErrors.phone}
              />
              {selectedCustomer && (
                <div className="pt-4 mt-4 border-t border-[#F3F4F6] flex items-center justify-between text-[11px] font-bold text-[#9CA3AF]">
                  <span>تاريخ الانضمام:</span>
                  <span className="font-mono text-[#111111]">{selectedCustomer.createdAt}</span>
                </div>
              )}
            </div>
          </Card>

          <div id="customer-measurements-section" className="space-y-6 lg:col-span-2" onFocusCapture={(event) => {
            const sectionTitle = (event.target as HTMLElement).closest<HTMLElement>('.measurement-section')?.querySelector('h4')?.textContent || '';
            setActiveFormStage(sectionTitle.includes('تفاصيل التفصيل') ? 'details' : 'measurements');
          }}>
            <div className="customers-form-tabs" role="tablist" aria-label="محتوى مقاسات العميل">
              <button
                type="button"
                onClick={() => setActiveFormTab('measurements')}
                role="tab"
                aria-selected={activeFormTab === 'measurements'}
                tabIndex={activeFormTab === 'measurements' ? 0 : -1}
                aria-controls="customer-measurements-panel"
                className={`customers-form-tab px-6 py-2.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-token)] focus-visible:ring-offset-2 ${
                  activeFormTab === 'measurements' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
                }`}
              >
                <Ruler className="w-4 h-4" />
                المقاسات الحالية
              </button>
              {selectedCustomer && (
              <button
                type="button"
                onClick={() => setActiveFormTab('history')}
                role="tab"
                aria-selected={activeFormTab === 'history'}
                tabIndex={activeFormTab === 'history' ? 0 : -1}
                aria-controls="customer-history-panel"
                className={`customers-form-tab px-6 py-2.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-token)] focus-visible:ring-offset-2 ${
                    activeFormTab === 'history' ? 'bg-white text-[#111111] shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'
                  }`}
                >
                  <History className="w-4 h-4" />
                  سجل التعديلات ({selectedCustomer.measurementHistory.length})
                </button>
              )}
            </div>

            {activeFormTab === 'measurements' ? (
              <div id="customer-measurements-panel" role="tabpanel" aria-label="المقاسات الحالية">
                {selectedCustomer && (
                  <Card className="border-[#E5E7EB] bg-[#FAFAF8]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Ruler className="w-4 h-4 text-[#111111]" />
                          <h3 className="text-sm font-black text-[#111111]">آخر مقاس محفوظ</h3>
                        </div>
                        <p className="text-[11px] font-bold text-[#6B7280]">
                          آخر تحديث للمقاس: <span className="text-[#111111]">{formatDate(selectedCustomer.updatedAt || selectedCustomer.createdAt)}</span>
                        </p>
                        <p className="mt-2 text-xs font-bold text-[#4B5563]">
                          طول أمام {selectedCustomer.measurements.frontLength || '--'} · الكتف {selectedCustomer.measurements.shoulderWidth || '--'} · الرقبة {selectedCustomer.measurements.neckSize || '--'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onUseMeasurementForOrder?.(selectedCustomer, null)}
                        disabled={!onUseMeasurementForOrder}
                      >
                        استخدام آخر مقاس
                      </Button>
                    </div>
                  </Card>
                )}
                <div className="customers-measurements-scroll">
                  <MeasurementsTableForm
                    measurements={formData.measurements}
                    measurementTestIdPrefix="customer"
                    styleDetails={formData.styleDetails}
                    layoutVariant="orders-original"
                    onChange={(updated) => setFormData({ ...formData, measurements: updated })}
                    onStyleChange={(updated) => setFormData({ ...formData, styleDetails: updated })}
                    customerName={formData.name}
                    customerPhone={formData.phone}
                    draftScope={selectedCustomer?.id || 'customer'}
                  />
                </div>
              </div>
            ) : (
              <div id="customer-history-panel" role="tabpanel" aria-label="سجل تعديلات المقاسات" className="space-y-4">
                {selectedCustomer?.measurementHistory.length === 0 ? (
                  <EmptyState
                    icon={<History className="w-8 h-8" />}
                    title="لا يوجد سجل سابق"
                    description="يتم حفظ نسخة احتياطية تلقائياً لكل تعديل تجريه على مقاسات العميل."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {selectedCustomer?.measurementHistory.map((hist) => (
                      <Card key={hist.id} className="hover:border-[#111111] transition-colors group">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#F3F4F6]">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#111111]">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="text-xs font-black text-[#111111] block">نسخة محفوظة</span>
                              <span className="text-[10px] text-[#9CA3AF] font-bold font-mono">{hist.savedAt}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => onUseMeasurementForOrder?.(selectedCustomer, hist)}
                            disabled={!onUseMeasurementForOrder}
                          >
                            استخدام لهذا الطلب فقط
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">
                            <span className="text-[10px] font-bold text-[#6B7280] block mb-1">طول أمام</span>
                            <span className="text-sm font-black text-[#111111] font-mono">{hist.measurements.frontLength || '--'}</span>
                          </div>
                          <div className="bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">
                            <span className="text-[10px] font-bold text-[#6B7280] block mb-1">الكتف</span>
                            <span className="text-sm font-black text-[#111111] font-mono">{hist.measurements.shoulderWidth || '--'}</span>
                          </div>
                          <div className="bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">
                            <span className="text-[10px] font-bold text-[#6B7280] block mb-1">الكم</span>
                            <span className="text-sm font-black text-[#111111] font-mono">{hist.measurements.sleeveLength || '--'}</span>
                          </div>
                          <div className="bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">
                            <span className="text-[10px] font-bold text-[#6B7280] block mb-1">الرقبة</span>
                            <span className="text-sm font-black text-[#111111] font-mono">{hist.measurements.neckSize || '--'}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="customers-form-savebar sticky bottom-0 z-20 flex w-full flex-col gap-3 border-t border-[var(--color-border-token)] bg-[var(--color-surface-token)]/95 p-3 shadow-[0_-8px_24px_rgb(17_17_17_/_8%)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted-token)]" aria-live="polite">
            {activeFormStage === 'review' ? <CheckCircle2 className="h-4 w-4 text-[var(--color-success-token)]" /> : <AlertCircle className="h-4 w-4 text-[var(--color-warning-token)]" />}
            <span>{activeFormStage === 'review' ? 'راجع البيانات ثم احفظ' : 'يمكنك العودة للتعديل قبل الحفظ'}</span>
          </div>
          <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>إلغاء</Button>
            <Button data-testid="save-customer-measurements" type="button" variant="primary" onClick={handleSave} icon={<Save className="h-5 w-5" />} size="lg" className="w-full sm:w-auto">
              {selectedCustomer ? 'حفظ التغييرات' : 'حفظ العميل والمقاسات'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-view view-wrapper animate-in fade-in duration-300">
      <div className="customers-page-header flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="page-header">
          <h2 className="page-title flex items-center gap-3">
            <Users className="w-7 h-7 text-[var(--brand-black)]" aria-hidden="true" />
            إدارة العملاء والمقاسات
          </h2>
          <p className="page-subtitle">قاعدة بيانات العملاء المسجلين وتاريخ مقاساتهم</p>
        </div>
        <div className="flex items-center gap-2" aria-label="ملخص العملاء">
          <span className="customers-count" aria-live="polite">{customers.length} عميل</span>
          <Button data-testid="customers-add" type="button" variant="primary" size="md" onClick={handleOpenNewCustomer} icon={<User className="w-4 h-4" />}>
            إضافة عميل جديد
          </Button>
        </div>
      </div>

      <Card className="customers-search-card p-3">
        <div className="customers-search-toolbar">
          <div className="relative flex-1 min-w-0">
            <Input
              ref={searchInputRef}
              aria-label="البحث في العملاء برقم العميل أو الاسم أو رقم الجوال"
              placeholder="ابحث برقم العميل أو الاسم أو رقم الجوال"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-5 h-5" aria-hidden="true" />}
              className="h-11"
            />
            <span className="customers-search-hint" aria-hidden="true"><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></span>
          </div>
          {hasSearch && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSearchTerm('')} icon={<X className="w-4 h-4" />}>
              مسح البحث
            </Button>
          )}
        </div>
        <div className="customers-search-meta" aria-live="polite">
          {hasSearch ? `${filteredCustomers.length} نتيجة مطابقة من أصل ${customers.length}` : 'ابحث برقم العميل أو الاسم أو رقم الجوال للوصول السريع إلى ملف العميل'}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title={hasSearch ? 'لم نجد نتائج مطابقة' : 'لا توجد سجلات عملاء بعد'}
            description={hasSearch ? 'جرّب اسمًا مختلفًا أو رقم جوال آخر، أو امسح البحث لعرض جميع العملاء.' : 'أضف أول عميل لحفظ بياناته ومقاساته وربطها بطلباته.'}
            action={hasSearch ? <Button size="sm" variant="secondary" onClick={() => setSearchTerm('')} icon={<X className="w-4 h-4" />}>مسح البحث</Button> : <Button size="md" variant="primary" onClick={handleOpenNewCustomer} icon={<User className="w-4 h-4" />}>إضافة أول عميل</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th aria-sort={customerSort.key === 'customerNumber' ? customerSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="رقم العميل" active={customerSort.key === 'customerNumber'} direction={customerSort.direction} onClick={() => toggleCustomerSort('customerNumber')} align="center" /></th>
                  <th aria-sort={customerSort.key === 'name' ? customerSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="اسم العميل" active={customerSort.key === 'name'} direction={customerSort.direction} onClick={() => toggleCustomerSort('name')} /></th>
                  <th>رقم الجوال</th>
                  <th className="text-center">الطول الأمامي</th>
                  <th className="text-center">عرض الكتف</th>
                  <th className="text-center">نوع الرقبة</th>
                  <th className="text-center" aria-sort={customerSort.key === 'createdAt' ? customerSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="تاريخ التسجيل" active={customerSort.key === 'createdAt'} direction={customerSort.direction} onClick={() => toggleCustomerSort('createdAt')} align="center" /></th>
                  <th className="text-center" aria-sort={customerSort.key === 'creditBalance' ? customerSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><SortHeader label="رصيد العميل" active={customerSort.key === 'creditBalance'} direction={customerSort.direction} onClick={() => toggleCustomerSort('creditBalance')} align="center" /></th>
                  <th className="text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map((cust) => (
                  <tr key={cust.id}>
                    <td className="text-center" data-testid={`customer-number-${cust.id}`}>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-black text-slate-700">{cust.customerNumber ? `#${cust.customerNumber}` : '—'}</span>
                    </td>
                    <td>
                      <div title={cust.name} className="font-black text-[#111111] text-sm">{cust.name}</div>
                    </td>
                    <td title={cust.phone} className="font-black font-mono text-[#4B5563]">{cust.phone}</td>
                    <td className="text-center font-black text-[#111111]">
                      {cust.measurements.frontLength ? (
                        <span className="bg-[#F3F4F6] px-2 py-1 rounded text-xs font-mono">{cust.measurements.frontLength}"</span>
                      ) : '--'}
                    </td>
                    <td className="text-center font-black text-[#111111]">
                      {cust.measurements.shoulderWidth ? (
                        <span className="bg-[#F3F4F6] px-2 py-1 rounded text-xs font-mono">{cust.measurements.shoulderWidth}"</span>
                      ) : '--'}
                    </td>
                    <td title={cust.styleDetails.neckType || undefined} className="text-center font-bold text-[#6B7280]">
                      {cust.styleDetails.neckType || '--'}
                    </td>
                    <td className="text-center text-[#9CA3AF] font-mono text-[11px] font-bold">{cust.createdAt}</td>
                    <td className="text-center" data-testid={`customer-credit-balance-${cust.id}`}>
                      <div className="flex flex-col items-center gap-2">
                        <span className={`rounded-lg px-2.5 py-1 text-xs font-black ${creditBalanceFor(cust.id) > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                          {creditBalanceFor(cust.id).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س
                        </span>
                        {creditEntriesFor(cust.id).length > 0 && (
                          <details className="text-right">
                            <summary className="cursor-pointer text-[10px] font-black text-slate-500">سجل الحركات ({creditEntriesFor(cust.id).length})</summary>
                            <div className="mt-2 min-w-[220px] rounded-xl border border-slate-200 bg-white p-2 text-right shadow-sm" data-testid={`customer-credit-history-${cust.id}`}>
                              {creditEntriesFor(cust.id).map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 last:border-0">
                                  <span className="text-[10px] font-bold text-slate-500">{entry.entryType === 'created' ? 'إنشاء' : entry.entryType === 'applied' ? 'تطبيق' : 'استرداد'}</span>
                                  <span className="font-mono text-[10px] font-black">{entry.entryType === 'created' ? '+' : '−'}{entry.amount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </td>
                    <td className="text-center">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEditModal(cust)}
                          icon={<Eye className="w-3.5 h-3.5" />}
                        >
                          عرض التفاصيل
                        </Button>
                        {creditBalanceFor(cust.id) > 0 && (
                          <Button
                            data-testid={`customer-credit-refund-${cust.id}`}
                            variant="outline-amber"
                            size="sm"
                            onClick={() => setRefundCustomer(cust)}
                          >
                            استرداد الرصيد
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {refundCustomer && (
        <CustomerCreditRefundModal
          isOpen={Boolean(refundCustomer)}
          customer={refundCustomer}
          availableBalance={creditBalanceFor(refundCustomer.id)}
          onClose={() => setRefundCustomer(null)}
          onSuccess={handleCustomerCreditSuccess}
          showToast={showToast}
        />
      )}

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (selectedCustomer) {
            onDeleteCustomer(selectedCustomer.id);
            setIsDeleteConfirmOpen(false);
            setIsFormOpen(false);
            showToast('تم حذف ملف العميل بنجاح', 'success');
          }
        }}
        title="حذف ملف عميل"
        message={`هل أنت متأكد من حذف العميل "${selectedCustomer?.name}"؟ سيؤدي هذا لحذف كافة سجلات مقاساته أيضاً.`}
        confirmLabel="نعم، احذف العميل"
        variant="danger"
      />
    </div>
  );
};
