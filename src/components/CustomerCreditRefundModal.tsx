// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, RefreshCw, RotateCcw, ShieldCheck, WalletCards } from 'lucide-react';
import { Customer, CustomerCreditOperationResult, CustomerCreditOperationState, CustomerCreditRefundRequest } from '../types';
import { createSafeId } from '../domain/idGenerator';
import { formatIpcErrorMessage } from '../utils/ipcError';
import { Button, Input, Modal, Select } from './ui';

interface CustomerCreditRefundModalProps {
  isOpen: boolean;
  customer: Customer;
  availableBalance: number;
  onClose: () => void;
  onSuccess: (result: CustomerCreditOperationResult) => Promise<void> | void;
  showToast: (message: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
}

const money = (value: number) => `${Number(value || 0).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س`;

export const CustomerCreditRefundModal: React.FC<CustomerCreditRefundModalProps> = ({
  isOpen,
  customer,
  availableBalance,
  onClose,
  onSuccess,
  showToast
}) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [reason, setReason] = useState('');
  const [state, setState] = useState<CustomerCreditOperationState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<CustomerCreditOperationResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const idempotencyKeyRef = useRef('');
  const submitLockRef = useRef(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      idempotencyKeyRef.current = createSafeId('CREDIT-REFUND-REQUEST');
      setAmount('');
      setMethod('cash');
      setReason('');
      setState('idle');
      setErrorMessage('');
      setResult(null);
      setIsConfirming(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const numericAmount = Number(amount);
  const amountIsValid = Number.isFinite(numericAmount) && numericAmount > 0 && numericAmount <= availableBalance;
  const reasonIsValid = Boolean(reason.trim());
  const canContinue = amountIsValid && reasonIsValid && state !== 'submitting';
  const remainingAfter = Math.max(0, availableBalance - (Number.isFinite(numericAmount) ? numericAmount : 0));

  const classifyError = (error: unknown): CustomerCreditOperationState => {
    const message = formatIpcErrorMessage(error);
    if (/تغير|تعارض|conflict|concurrent/i.test(message)) return 'conflict';
    if (/مبلغ|سبب|طريقة|رصيد|idempotency|عميل|فاتورة/i.test(message)) return 'validation_error';
    return 'server_error';
  };

  const submit = async () => {
    if (submitLockRef.current) return;
    if (!canContinue) {
      setState('validation_error');
      setErrorMessage(!reasonIsValid ? 'سبب الاسترداد مطلوب.' : 'أدخل مبلغاً أكبر من صفر ولا يتجاوز الرصيد المتاح.');
      return;
    }
    submitLockRef.current = true;
    setState('submitting');
    setErrorMessage('');
    try {
      const request: CustomerCreditRefundRequest = {
        customerId: customer.id,
        amount: numericAmount,
        method,
        idempotencyKey: idempotencyKeyRef.current,
        reason: reason.trim()
      };
      const refund = window.electronAPI.customerCredits?.refund;
      if (!refund) throw new Error('خدمة استرداد رصيد العميل غير متاحة في هذه النسخة');
      const operationResult = await refund(request);
      setResult(operationResult);
      setState(operationResult.idempotent ? 'already_processed' : 'success');
      await onSuccess(operationResult);
      showToast(operationResult.idempotent ? 'تم عرض نتيجة الاسترداد السابقة دون إنشاء حركة جديدة' : 'تم تسجيل استرداد رصيد العميل بنجاح', 'success');
    } catch (error) {
      setState(classifyError(error));
      setErrorMessage(formatIpcErrorMessage(error));
    } finally {
      submitLockRef.current = false;
      setIsConfirming(false);
    }
  };

  const close = () => {
    if (state !== 'submitting') onClose();
  };

  const footer = state === 'success' || state === 'already_processed' ? (
    <Button variant="primary" onClick={close} icon={<CheckCircle2 className="w-4 h-4" />}>إغلاق</Button>
  ) : (
    <div className="flex items-center justify-end gap-3">
      <Button variant="ghost" onClick={close} disabled={state === 'submitting'}>إلغاء</Button>
      <Button variant="primary" onClick={() => setIsConfirming(true)} disabled={!canContinue} isLoading={state === 'submitting'} icon={<ShieldCheck className="w-4 h-4" />}>
        مراجعة الاسترداد
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={close} title={`استرداد رصيد العميل — ${customer.name}`} maxWidth="md" footer={footer}>
      {state === 'success' || state === 'already_processed' ? (
        <div className="space-y-5" data-testid="customer-credit-refund-result">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6" /><p className="font-black">{state === 'already_processed' ? 'هذه نتيجة العملية السابقة' : 'تم تسجيل الاسترداد بنجاح'}</p></div>
            <p className="mt-2 text-sm font-bold">لم يتم إنشاء حركة مكررة، وتم الاحتفاظ بسجل العملية كما هو.</p>
          </div>
          {result && <div className="grid grid-cols-2 gap-3 text-sm" data-testid="customer-credit-refund-result-summary">
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-bold text-slate-500">المبلغ</span><strong>{money(result.amount)}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-bold text-slate-500">الرصيد بعد العملية</span><strong>{money(result.balanceAfter)}</strong></div>
            <div className="col-span-2 rounded-xl bg-slate-50 p-3"><span className="block text-xs font-bold text-slate-500">رقم العملية</span><strong className="font-mono text-xs">{result.operationId}</strong></div>
          </div>}
        </div>
      ) : (
        <div className="space-y-5" data-testid="customer-credit-refund-form">
          <div className="rounded-2xl bg-slate-900 p-5 text-white">
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-300">العميل</span><strong>{customer.name}</strong></div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4"><span className="text-xs font-bold text-slate-300">الرصيد المتاح</span><strong className="text-2xl text-amber-300">{money(availableBalance)}</strong></div>
          </div>

          {state === 'validation_error' || state === 'conflict' || state === 'server_error' ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800" data-testid="customer-credit-refund-error">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{state === 'conflict' ? 'تغير الرصيد أثناء العملية. أعد المحاولة بعد التحقق من الرصيد الحالي.' : errorMessage}</div>
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={submit} icon={<RefreshCw className="h-4 w-4" />}>إعادة المحاولة بنفس رقم العملية</Button>
            </div>
          ) : null}

          <Input label="المبلغ المسترد (ر.س) *" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={state === 'submitting'} icon={<WalletCards className="h-4 w-4" />} />
          {amount && !amountIsValid && <p className="text-xs font-bold text-rose-600" data-testid="customer-credit-refund-amount-error">المبلغ يجب أن يكون أكبر من صفر ولا يتجاوز الرصيد المتاح.</p>}

          <Select label="طريقة الاسترداد *" value={method} onChange={(event) => setMethod(event.target.value as 'cash' | 'card' | 'transfer')} disabled={state === 'submitting'}>
            <option value="cash">نقدي</option>
            <option value="card">بطاقة</option>
            <option value="transfer">تحويل</option>
          </Select>

          {method === 'cash' ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900" data-testid="customer-credit-cash-warning">
              <Banknote className="mt-0.5 h-5 w-5 shrink-0" />
              <span>سيتم تسجيل خروج نقدي واحد من الصندوق. هذا الاسترداد ليس دفعة ولا يزيد cash_received.</span>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700" data-testid="customer-credit-noncash-note">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
              <span>لن يتغير Cash Drawer. سيُسجل الاسترداد في Customer Credit Ledger فقط.</span>
            </div>
          )}

          <Input label="سبب الاسترداد *" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="اكتب سبباً واضحاً للاسترداد" disabled={state === 'submitting'} />
          {!reasonIsValid && reason.length > 0 && <p className="text-xs font-bold text-rose-600">سبب الاسترداد مطلوب.</p>}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm" data-testid="customer-credit-refund-impact-summary">
            <div className="mb-2 flex items-center gap-2 font-black"><RotateCcw className="h-4 w-4" />ملخص الأثر المتوقع</div>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-600"><span>الرصيد قبل</span><strong className="text-left text-slate-900">{money(availableBalance)}</strong><span>الرصيد بعد</span><strong className="text-left text-slate-900">{money(remainingAfter)}</strong><span>Cash Drawer</span><strong className="text-left text-slate-900">{method === 'cash' ? `− ${money(Number.isFinite(numericAmount) ? numericAmount : 0)}` : 'لا يتغير'}</strong></div>
          </div>

          {isConfirming && (
            <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-5" data-testid="customer-credit-refund-confirmation">
              <p className="font-black text-slate-900">تأكيد استرداد الرصيد</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700">سيتم استرداد {money(numericAmount)} للعميل {customer.name} بطريقة {method === 'cash' ? 'نقدية' : method === 'card' ? 'بطاقة' : 'تحويل'}، وسيصبح الرصيد {money(remainingAfter)}. السبب: {reason.trim()}</p>
              <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setIsConfirming(false)} disabled={state === 'submitting'}>تعديل</Button><Button variant="danger" size="sm" onClick={submit} isLoading={state === 'submitting'}>تأكيد التنفيذ</Button></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default CustomerCreditRefundModal;
