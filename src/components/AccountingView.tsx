// @ts-nocheck
import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, ClipboardList, FilePlus2, PackagePlus, Plus, ReceiptText, WalletCards } from 'lucide-react';
import { AccessoryItem, CashTransaction, CustomerCreditRecord, ExpenseRecord, FabricItem, Invoice, PaymentMethod, PurchaseLine, PurchaseRecord } from '../types';
import { calculateCashDrawerSummary } from '../domain/cashRules';
import { createSafeId } from '../domain/idGenerator';
import { Badge, Button, Card, EmptyState, Input, Select, SegmentedControl } from './ui';

interface AccountingViewProps {
  fabrics: FabricItem[];
  accessories: AccessoryItem[];
  purchases: PurchaseRecord[];
  expenses: ExpenseRecord[];
  cashTransactions: CashTransaction[];
  invoices: Invoice[];
  customerCredits: CustomerCreditRecord[];
  onCreatePurchase: (payload: any) => Promise<boolean | void> | boolean | void;
  onCreateExpense: (payload: any) => Promise<boolean | void> | boolean | void;
  onCreateCashAdjustment: (payload: any) => Promise<boolean | void> | boolean | void;
  showToast: (message: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
}

type AccountingTab = 'purchases' | 'expenses' | 'cash';
type DraftLine = Omit<PurchaseLine, 'id' | 'purchaseId' | 'createdAt'>;

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `${Number(value || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`;
const paymentLabel: Record<PaymentMethod, string> = { cash: 'نقدي', card: 'بطاقة', transfer: 'تحويل' };
const paymentVariant: Record<PaymentMethod, 'emerald' | 'blue' | 'slate'> = { cash: 'emerald', card: 'blue', transfer: 'slate' };

export const AccountingView: React.FC<AccountingViewProps> = ({
  fabrics, accessories, purchases, expenses, cashTransactions, invoices, customerCredits, onCreatePurchase, onCreateExpense, onCreateCashAdjustment, showToast
}) => {
  const [tab, setTab] = useState<AccountingTab>('purchases');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [purchaseMethod, setPurchaseMethod] = useState<PaymentMethod>('cash');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [lineType, setLineType] = useState<'fabric' | 'accessory'>('fabric');
  const [lineItemId, setLineItemId] = useState('');
  const [lineQuantity, setLineQuantity] = useState('');
  const [lineUnitPrice, setLineUnitPrice] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<DraftLine[]>([]);
  const purchaseOperationIdRef = useRef<string | null>(null);

  const [expenseCategory, setExpenseCategory] = useState('تشغيل');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod>('cash');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  const expenseOperationIdRef = useRef<string | null>(null);

  const [cashDirection, setCashDirection] = useState<'in' | 'out'>('in');
  const [cashSourceType, setCashSourceType] = useState<'opening_balance' | 'adjustment' | 'withdrawal'>('adjustment');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(today());
  const [cashMethod, setCashMethod] = useState<PaymentMethod>('cash');
  const [cashReferenceNumber, setCashReferenceNumber] = useState('');
  const [cashDescription, setCashDescription] = useState('');
  const [cashNotes, setCashNotes] = useState('');
  const cashOperationIdRef = useRef<string | null>(null);

  const itemOptions = lineType === 'fabric' ? fabrics : accessories;
  const selectedItem = itemOptions.find((item) => item.id === lineItemId);
  const purchaseTotal = purchaseLines.reduce((sum, line) => sum + line.totalAmount, 0);
  const cashSummary = useMemo(() => calculateCashDrawerSummary(cashTransactions), [cashTransactions]);
  const appliedCustomerPayments = useMemo(() => invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((subtotal, payment) => subtotal + Number(payment.amount || 0), 0), 0), [invoices]);
  const cashReceivedFromCustomers = useMemo(() => cashTransactions.filter((transaction) => transaction.direction === 'in' && transaction.sourceType === 'customer_payment').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0), [cashTransactions]);
  const customerCreditLiability = useMemo(() => customerCredits.reduce((sum, credit) => sum + (credit.entryType === 'created' ? credit.amount : -credit.amount), 0), [customerCredits]);
  const customerCreditRefunds = useMemo(() => customerCredits.filter((credit) => credit.entryType === 'refunded'), [customerCredits]);
  const customerCreditCashRefunds = useMemo(() => customerCreditRefunds.filter((credit) => credit.method === 'cash').reduce((sum, credit) => sum + Number(credit.amount || 0), 0), [customerCreditRefunds]);
  const customerCreditNonCashRefunds = useMemo(() => customerCreditRefunds.filter((credit) => credit.method !== 'cash').reduce((sum, credit) => sum + Number(credit.amount || 0), 0), [customerCreditRefunds]);

  const addLine = () => {
    const quantity = Number(lineQuantity);
    const unitPrice = Number(lineUnitPrice);
    if (!selectedItem || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      showToast('اختر الصنف وأدخل كمية وسعر شراء صحيحين', 'danger');
      return;
    }
    setPurchaseLines((current) => [...current, {
      itemType: lineType, itemId: selectedItem.id, itemName: selectedItem.name, quantity, unit: lineType === 'fabric' ? 'متر' : selectedItem.unit, unitPrice, totalAmount: quantity * unitPrice
    }]);
    setLineItemId(''); setLineQuantity(''); setLineUnitPrice('');
  };

  const savePurchase = async () => {
    if (!supplier.trim() || purchaseLines.length === 0) {
      showToast('أدخل المورد وأضف صنفاً واحداً على الأقل', 'danger');
      return;
    }
    const operationId = purchaseOperationIdRef.current || createSafeId('PUR');
    purchaseOperationIdRef.current = operationId;
    const saved = await onCreatePurchase({ id: operationId, supplier, invoiceNumber, purchaseDate, totalAmount: purchaseTotal, paymentMethod: purchaseMethod, notes: purchaseNotes, lines: purchaseLines });
    if (saved === false) return;
    purchaseOperationIdRef.current = null;
    setSupplier(''); setInvoiceNumber(''); setPurchaseNotes(''); setPurchaseLines([]); setPurchaseDate(today());
  };

  const saveExpense = async () => {
    const amount = Number(expenseAmount);
    if (!expenseDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast('أدخل وصف المصروف ومبلغاً صحيحاً', 'danger');
      return;
    }
    const operationId = expenseOperationIdRef.current || createSafeId('EXP');
    expenseOperationIdRef.current = operationId;
    const saved = await onCreateExpense({ id: operationId, category: expenseCategory, amount, expenseDate, paymentMethod: expenseMethod, description: expenseDescription, notes: expenseNotes });
    if (saved === false) return;
    expenseOperationIdRef.current = null;
    setExpenseAmount(''); setExpenseDescription(''); setExpenseNotes('');
  };

  const saveCashAdjustment = async () => {
    const amount = Number(cashAmount);
    if (!cashDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast('أدخل وصف الحركة ومبلغاً صحيحاً', 'danger');
      return;
    }
    const operationId = cashOperationIdRef.current || createSafeId('CASH');
    cashOperationIdRef.current = operationId;
    const saved = await onCreateCashAdjustment({ id: operationId, direction: cashDirection, sourceType: cashSourceType, amount, transactionDate: cashDate, paymentMethod: cashMethod, referenceNumber: cashReferenceNumber.trim() || undefined, description: cashDescription, notes: cashNotes });
    if (saved === false) return;
    cashOperationIdRef.current = null;
    setCashAmount(''); setCashReferenceNumber(''); setCashDescription(''); setCashNotes('');
  };

  return (
    <div className="view-wrapper space-y-6" dir="rtl">
      <Card
        title="المحاسبة والتدفقات المالية"
        subtitle="المشتريات والمصروفات والصندوق مرتبطة مباشرة بالمخزون والطلبات"
        headerIcon={<WalletCards className="w-5 h-5" />}
        headerOnly
        action={(
          <SegmentedControl
            value={tab}
            onChange={setTab}
            ariaLabel="أقسام المحاسبة والتدفقات المالية"
            options={[
              { value: 'purchases', label: 'المشتريات' },
              { value: 'expenses', label: 'المصروفات' },
              { value: 'cash', label: 'الصندوق' }
            ]}
          />
        )}
      />

      {tab === 'purchases' && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)] gap-6">
        <Card title="اعتماد عملية شراء" subtitle="اعتماد العملية يزيد المخزون ويسجل حركة وصرفاً مالياً واحداً" headerIcon={<FilePlus2 className="w-5 h-5" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="المورد" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="اسم المورد" />
            <Input label="رقم فاتورة الشراء" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="اختياري" />
            <Input label="التاريخ" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            <Select label="طريقة الدفع" value={purchaseMethod} onChange={(e) => setPurchaseMethod(e.target.value as PaymentMethod)}><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select>
          </div>
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <Select label="نوع الصنف" value={lineType} onChange={(e) => { setLineType(e.target.value as 'fabric' | 'accessory'); setLineItemId(''); }}><option value="fabric">قماش</option><option value="accessory">مستلزم / إكسسوار</option></Select>
              <Select label="الصنف" value={lineItemId} onChange={(e) => setLineItemId(e.target.value)}><option value="">اختر الصنف</option>{itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{'color' in item ? ` — ${item.color}` : ''}</option>)}</Select>
              <Input label="الكمية" type="number" min="0" step="0.01" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)} />
              <div className="flex gap-2"><Input label="سعر الوحدة" type="number" min="0" step="0.01" value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} /><Button type="button" size="sm" className="mb-0 h-12" icon={<Plus className="w-4 h-4" />} onClick={addLine}>إضافة</Button></div>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto border border-slate-200 rounded-2xl"><table className="sahwa-table w-full text-sm text-right"><thead className="bg-slate-50 text-xs font-black text-slate-600"><tr><th className="p-3">الصنف</th><th className="p-3">الكمية</th><th className="p-3">سعر الوحدة</th><th className="p-3">الإجمالي</th><th className="p-3"></th></tr></thead><tbody>{purchaseLines.length === 0 ? <tr><td colSpan={5} className="p-7 text-center text-slate-400 font-bold">لم تتم إضافة أصناف بعد</td></tr> : purchaseLines.map((line, index) => <tr key={`${line.itemId}-${index}`} className="border-t border-slate-100"><td className="p-3 font-bold">{line.itemName}</td><td className="p-3">{line.quantity} {line.unit}</td><td className="p-3">{money(line.unitPrice)}</td><td className="p-3 font-black">{money(line.totalAmount)}</td><td className="p-3"><button type="button" className="text-xs font-black text-rose-600" onClick={() => setPurchaseLines((current) => current.filter((_, i) => i !== index))}>حذف</button></td></tr>)}</tbody></table></div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 mt-5 items-end"><Input label="ملاحظات" value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} placeholder="تفاصيل اختيارية" /><div className="text-left"><p className="text-xs text-slate-500 font-bold">إجمالي العملية</p><p className="text-2xl font-black text-[#111111]">{money(purchaseTotal)}</p></div></div>
          <div className="flex justify-end mt-5"><Button type="button" icon={<ClipboardList className="w-4 h-4" />} onClick={savePurchase}>اعتماد وحفظ المشتريات</Button></div>
        </Card>
        <Card title="آخر عمليات الشراء" subtitle="الأسعار محفوظة تاريخياً داخل كل سطر" headerIcon={<ClipboardList className="w-5 h-5" />}>
          <div className="space-y-3">{purchases.length === 0 ? <EmptyState icon={<PackagePlus className="w-6 h-6" />} title="لا توجد مشتريات" description="ستظهر العمليات المعتمدة هنا." /> : purchases.slice(0, 8).map((purchase) => <div key={purchase.id} className="p-4 rounded-2xl border border-slate-200 bg-white"><div className="flex justify-between gap-3"><div><p className="font-black text-sm">{purchase.supplier}</p><p className="text-xs text-slate-500 mt-1">{purchase.purchaseDate} · {purchase.invoiceNumber || purchase.id}</p></div><p className="font-black">{money(purchase.totalAmount)}</p></div><div className="flex flex-wrap gap-2 mt-3">{purchase.lines.map((line) => <Badge key={line.id}>{line.itemName} · {line.quantity} {line.unit}</Badge>)}</div></div>)}</div>
        </Card>
      </div>}

      {tab === 'expenses' && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] gap-6">
        <Card title="تسجيل مصروف" subtitle="يُسجل المصروف كخروج مالي في الصندوق" headerIcon={<ReceiptText className="w-5 h-5" />}>
          <div className="space-y-4"><Select label="التصنيف" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>{['إيجار', 'كهرباء', 'ماء', 'رواتب', 'صيانة', 'نقل', 'تشغيل', 'أخرى'].map((category) => <option key={category}>{category}</option>)}</Select><Input label="المبلغ" type="number" min="0" step="0.01" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} /><Input label="التاريخ" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /><Select label="طريقة الدفع" value={expenseMethod} onChange={(e) => setExpenseMethod(e.target.value as PaymentMethod)}><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select><Input label="الوصف" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} placeholder="مثال: فاتورة كهرباء المحل" /><Input label="ملاحظات" value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} /><div className="flex justify-end"><Button type="button" icon={<ReceiptText className="w-4 h-4" />} onClick={saveExpense}>حفظ المصروف</Button></div></div>
        </Card>
        <Card title="سجل المصروفات" subtitle="يمكن مراجعة التصنيف والوصف وطريقة الدفع" headerIcon={<ClipboardList className="w-5 h-5" />}>
          {expenses.length === 0 ? <EmptyState icon={<ReceiptText className="w-6 h-6" />} title="لا توجد مصروفات" /> : <div className="overflow-x-auto"><table className="sahwa-table w-full text-sm text-right"><thead className="bg-slate-50 text-xs font-black"><tr><th className="p-3">التاريخ</th><th className="p-3">التصنيف</th><th className="p-3">الوصف</th><th className="p-3">الملاحظات</th><th className="p-3">الدفع</th><th className="p-3">المبلغ</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} className="border-t border-slate-100"><td className="p-3">{expense.expenseDate}</td><td className="p-3"><Badge variant="amber">{expense.category}</Badge></td><td className="p-3 font-bold">{expense.description}</td><td className="p-3 text-slate-600">{expense.notes || '—'}</td><td className="p-3"><Badge variant={paymentVariant[expense.paymentMethod]}>{paymentLabel[expense.paymentMethod]}</Badge></td><td className="p-3 font-black">{money(expense.amount)}</td></tr>)}</tbody></table></div>}
        </Card>
      </div>}

      {tab === 'cash' && <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4"><Card title="الرصيد الافتتاحي" headerIcon={<WalletCards className="w-5 h-5" />}><p className="text-2xl font-black">{money(cashSummary.openingBalance)}</p></Card><Card title="إجمالي الدخل" headerIcon={<ArrowDownLeft className="w-5 h-5" />}><p className="text-2xl font-black text-emerald-700">{money(cashSummary.income)}</p></Card><Card title="النقد المستلم من العملاء" headerIcon={<Banknote className="w-5 h-5" />}><p className="text-2xl font-black text-emerald-700">{money(cashReceivedFromCustomers)}</p></Card><Card title="التحصيل المطبق" headerIcon={<ClipboardList className="w-5 h-5" />}><p className="text-2xl font-black">{money(appliedCustomerPayments)}</p></Card><Card title="التزام ائتمان العملاء" headerIcon={<WalletCards className="w-5 h-5" />}><p className="text-2xl font-black text-amber-700">{money(customerCreditLiability)}</p></Card><Card title="إجمالي الخارج" headerIcon={<ArrowUpRight className="w-5 h-5" />}><p className="text-2xl font-black text-rose-700">{money(cashSummary.out)}</p></Card><Card title="الرصيد الحالي" headerIcon={<Banknote className="w-5 h-5" />}><p className="text-2xl font-black">{money(cashSummary.balance)}</p></Card></div>
        <Card title="استردادات رصيد العملاء" subtitle="استردادات الالتزام منفصلة عن التحصيل النقدي والتطبيق على الفواتير" headerIcon={<WalletCards className="w-5 h-5" />} data-testid="customer-credit-refunds-section">
          <span className="sr-only">Customer Credit Refunds</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" data-testid="customer-credit-reporting-summary">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] font-bold text-amber-800">التزام رصيد العملاء</p><p className="text-lg font-black text-amber-800">{money(customerCreditLiability)}</p></div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-[11px] font-bold text-rose-800">استردادات نقدية</p><p className="text-lg font-black text-rose-800">{money(customerCreditCashRefunds)}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-bold text-slate-700">استردادات غير نقدية</p><p className="text-lg font-black text-slate-900">{money(customerCreditNonCashRefunds)}</p></div>
          </div>
          {customerCreditRefunds.length === 0 ? <p className="text-sm font-bold text-slate-500">لا توجد استردادات رصيد عملاء مسجلة.</p> : <div className="overflow-x-auto"><table className="sahwa-table w-full text-sm text-right"><thead className="bg-slate-50 text-xs font-black"><tr><th className="p-3">التاريخ</th><th className="p-3">العميل</th><th className="p-3">المبلغ</th><th className="p-3">الطريقة</th><th className="p-3">السبب</th><th className="p-3">الأثر النقدي</th></tr></thead><tbody>{customerCreditRefunds.map((refund) => <tr key={refund.id} className="border-t border-slate-100"><td className="p-3">{refund.occurredAt || refund.createdAt}</td><td className="p-3 font-bold">{refund.customerId}</td><td className="p-3 font-black text-rose-700">{money(refund.amount)}</td><td className="p-3">{refund.method === 'cash' ? 'نقدي' : refund.method === 'card' ? 'بطاقة' : 'تحويل'}</td><td className="p-3">{refund.reason || refund.notes || '—'}</td><td className="p-3">{refund.method === 'cash' ? 'خروج نقدي' : 'لا يغير الصندوق'}</td></tr>)}</tbody></table></div>}
        </Card>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)] gap-6"><Card title="إضافة حركة مسموحة" subtitle="للبداية أو السحب أو التسوية فقط" headerIcon={<Plus className="w-5 h-5" />}><div className="space-y-4"><Select label="الاتجاه" value={cashDirection} onChange={(e) => setCashDirection(e.target.value as 'in' | 'out')}><option value="in">دخل</option><option value="out">خرج</option></Select><Select label="المصدر" value={cashSourceType} onChange={(e) => setCashSourceType(e.target.value as 'opening_balance' | 'adjustment' | 'withdrawal')}><option value="opening_balance">رصيد افتتاحي</option><option value="adjustment">تسوية مالية</option><option value="withdrawal">سحب</option></Select><Input label="المبلغ" type="number" min="0" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} /><Input label="التاريخ" type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} /><Select label="طريقة الدفع" value={cashMethod} onChange={(e) => setCashMethod(e.target.value as PaymentMethod)}><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></Select><Input label="المرجع" value={cashReferenceNumber} onChange={(e) => setCashReferenceNumber(e.target.value)} placeholder="رقم سند أو مرجع داخلي (اختياري)" /><Input label="الوصف" value={cashDescription} onChange={(e) => setCashDescription(e.target.value)} /><Input label="ملاحظات" value={cashNotes} onChange={(e) => setCashNotes(e.target.value)} /><div className="flex justify-end"><Button type="button" onClick={saveCashAdjustment}>حفظ الحركة</Button></div></div></Card><Card title="سجل الصندوق الموحد" subtitle="الدفعات والمشتريات والمصروفات والتسويات في سجل واحد" headerIcon={<Banknote className="w-5 h-5" />}><div className="overflow-x-auto"><table className="sahwa-table w-full text-sm text-right"><thead className="bg-slate-50 text-xs font-black"><tr><th className="p-3">التاريخ</th><th className="p-3">المصدر</th><th className="p-3">المرجع</th><th className="p-3">الوصف</th><th className="p-3">الطريقة</th><th className="p-3">المبلغ</th></tr></thead><tbody>{cashTransactions.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">لا توجد حركات مالية بعد</td></tr> : cashTransactions.map((tx) => <tr key={tx.id} className="border-t border-slate-100"><td className="p-3">{tx.transactionDate}</td><td className="p-3"><Badge variant={tx.direction === 'in' ? 'emerald' : 'red'}>{tx.sourceType === 'customer_payment' ? 'دفعة عميل' : tx.sourceType === 'purchase' ? 'شراء' : tx.sourceType === 'expense' ? 'مصروف' : tx.sourceType === 'opening_balance' ? 'افتتاحي' : tx.sourceType === 'withdrawal' ? 'سحب' : 'تسوية'}</Badge></td><td className="p-3 font-mono text-xs text-slate-600">{tx.referenceNumber || '—'}</td><td className="p-3 font-bold">{tx.description}</td><td className="p-3"><Badge variant={paymentVariant[tx.paymentMethod]}>{paymentLabel[tx.paymentMethod]}</Badge></td><td className={`p-3 font-black ${tx.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>{tx.direction === 'in' ? '+' : '-'} {money(tx.amount)}</td></tr>)}</tbody></table></div></Card></div>
      </div>}
    </div>
  );
};

export default AccountingView;
