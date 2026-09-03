// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CustomerMeasurements, CustomerStyleDetails } from '../types';
import { Check, Ruler, Scissors } from 'lucide-react';
import { NeckDrawing, JabzourTypeDrawing, JabzourShapeDrawing, PocketDrawing } from './InvoiceDrawings';
import { Button } from './ui';

interface MeasurementsTableFormProps {
  measurements: CustomerMeasurements;
  onChange: (updated: CustomerMeasurements) => void;
  styleDetails?: CustomerStyleDetails;
  onStyleChange?: (updated: CustomerStyleDetails) => void;
  customerName?: string;
  customerPhone?: string;
  draftScope?: string;
  draftKey?: string;
  autoSaveDraft?: boolean;
  garmentCount?: number;
  showSyncCheckbox?: boolean;
  syncWithCustomer?: boolean;
  onSyncChange?: (sync: boolean) => void;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  layoutVariant?: 'orders-original' | 'customers-responsive';
  measurementTestIdPrefix?: 'customer' | 'order';
}

const CONTROL_H = 'h-10'; 
const inputClass = `${CONTROL_H} sahwa-measure-input ux-measure-input px-2 text-center text-[15px] font-black transition-all duration-200`;

const rowClass = 'sahwa-measurement-row measurement-row flex items-center gap-3 flex-wrap sm:flex-nowrap py-[14px] last:border-b-0 min-w-0 group';
const labelClass = 'sahwa-measure-label text-[13px] font-black whitespace-nowrap shrink-0';

const emptyStyleDetails = (): CustomerStyleDetails => ({
  neckSizeHeader: '', neckHeightHeader: '', neckType: '', neckShape: '', neckPadding: '', neckLining: '', neckNotes: '',
  buttonsType: '', habroorType: '', habroorPadding: '', habroorLining: '', habroorStyle: '', habroorLength: '', habroorBottom: '',
  sleeveCuffLength: '', sleevePlainLength: '', sleeveType: '', sleevePadding: '', sleeveShape: '', sleeveLining: '', pleatsStyle: '', sleeveNotes: '',
  chestPocketDrop: '', chestPocketWidth: '', chestPocketPadding: '', chestPocketStyle: '', chestLining: '', pocketNotes: '',
  sidePockets: '', mobilePocketRight: '', mobilePocketLeft: '', penPocketStyle: '', rightSide: '', leftSide: '', bottomHemShape: '',
  cuff1: '', cuff2: '', cuff3: '', cuff4: '', cuff5: '', stitchingType: '', richieMark: '', generalNotes: '', additionalNotes: '',
});

const OptionChip: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({ label, selected, onClick }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    data-selected={selected}
    className={`sahwa-option-chip ${CONTROL_H} px-4 text-[11px] font-black whitespace-nowrap inline-flex items-center gap-2 transition-all duration-200 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-token)] focus-visible:ring-offset-2 ${selected ? 'shadow-md' : ''}`}
  >
    {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
    {label}
  </button>
);

const DrawingBox: React.FC<{ children: React.ReactNode; className?: string; active?: boolean }> = ({ children, className = '', active = false }) => (
  <div data-active={active} className={`sahwa-drawing-box drawing-box shrink-0 w-24 h-28 flex items-center justify-center p-2 transition-colors ${active ? 'drawing-box-active' : ''} ${className}`}>
    {children}
  </div>
);

const Section: React.FC<{ title: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  title,
  icon,
  className = '',
  children,
}) => (
  <section className={`sahwa-form-section measurement-section min-w-0 overflow-visible transition-all duration-300 ${className}`}>
    <h4 className="sahwa-form-section-header measurement-section-header flex items-center gap-3 text-[14px] font-black p-4">
      {icon}
      {title}
    </h4>
    <div className="sahwa-form-section-body measurement-section-body p-6 space-y-1">{children}</div>
  </section>
);

export const draftKeyFor = (customerName?: string, customerPhone?: string, scope: string = 'new') =>
  `sahwa_measurements_draft:${scope}:${(customerName || 'new').trim()}:${(customerPhone || '').trim()}`;

export const MeasurementsTableForm = React.memo<MeasurementsTableFormProps>(({
  measurements,
  onChange,
  styleDetails,
  onStyleChange,
  customerName,
  customerPhone,
  draftScope,
  draftKey,
  autoSaveDraft = true,
  onSave,
  onCancel,
  saveLabel = 'حفظ',
  isSaving = false,
  layoutVariant = 'orders-original',
  measurementTestIdPrefix,
}) => {
  const details = useMemo(() => styleDetails || emptyStyleDetails(), [styleDetails]);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'restored'>('idle');
  const [activeDrawing, setActiveDrawing] = useState<'neck' | 'jabzour' | 'pocket' | null>(null);
  const draftHydratedKeyRef = useRef<string | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedDraftKey = useMemo(() => {
    if (!autoSaveDraft) return null;
    if (draftKey?.trim()) return draftKey.trim();
    if (!customerName?.trim() && !customerPhone?.trim() && !draftScope?.trim()) return null;
    return draftKeyFor(customerName, customerPhone, draftScope || 'new');
  }, [autoSaveDraft, customerName, customerPhone, draftKey, draftScope]);

  // استعادة مسودة الإدخال فقط؛ لا يتم إنشاء عميل أو طلب ولا تعديل SQLite هنا.
  useEffect(() => {
    if (!resolvedDraftKey || typeof window === 'undefined') return;
    draftHydratedKeyRef.current = null;
    try {
      const rawDraft = window.localStorage.getItem(resolvedDraftKey);
      const draft = rawDraft ? JSON.parse(rawDraft) as {
        version?: number;
        measurements?: Partial<CustomerMeasurements>;
        styleDetails?: Partial<CustomerStyleDetails>;
      } : null;
      if (draft?.version === 1 && draft.measurements && draft.styleDetails) {
        const hasCurrentValues = Object.values(measurements).some(Boolean)
          || Object.values(details).some(Boolean);
        if (!hasCurrentValues) {
          onChange({ ...measurements, ...draft.measurements });
          onStyleChange?.({ ...details, ...draft.styleDetails });
          setDraftStatus('restored');
        }
      }
    } catch {
      // مسودة تالفة لا تمنع فتح النموذج؛ الإدخال الحالي يبقى سليماً.
    } finally {
      draftHydratedKeyRef.current = resolvedDraftKey;
    }
  }, [resolvedDraftKey]);

  // حفظ مؤجل 350ms لمنع الكتابة مع كل ضغطة، مع بقاء الحفظ النهائي منفصلاً.
  useEffect(() => {
    if (!resolvedDraftKey || typeof window === 'undefined' || draftHydratedKeyRef.current !== resolvedDraftKey) return;
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    setDraftStatus('saving');
    draftSaveTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(resolvedDraftKey, JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          measurements,
          styleDetails: details,
        }));
        setDraftStatus('saved');
      } catch {
        setDraftStatus('idle');
      }
    }, 350);
    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    };
  }, [resolvedDraftKey, measurements, details]);

  const clearDraft = () => {
    if (!resolvedDraftKey || typeof window === 'undefined') return;
    window.localStorage.removeItem(resolvedDraftKey);
    setDraftStatus('idle');
  };

  const handleSave = () => {
    onSave?.();
    clearDraft();
  };

  const handleCancel = () => {
    clearDraft();
    onCancel?.();
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') {
      (target as HTMLInputElement).select();
      const drawing = target.dataset.drawing as 'neck' | 'jabzour' | 'pocket' | undefined;
      setActiveDrawing(drawing || null);
    }
  };

  const handleFocusExit = (e: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget as Node | null;
    if (!nextTarget || !e.currentTarget.contains(nextTarget)) setActiveDrawing(null);
  };

  const draftStatusText = {
    idle: '',
    saving: 'جاري حفظ المسودة محلياً…',
    saved: 'تم حفظ المسودة محلياً',
    restored: 'تمت استعادة مسودة سابقة',
  }[draftStatus];

  const updateField = (field: keyof CustomerMeasurements, value: string) => {
    onChange({ ...measurements, [field]: value });
  };

  const updateStyle = (field: keyof CustomerStyleDetails, value: string) => {
    onStyleChange?.({ ...details, [field]: value });
  };

  const updateStyleMany = (patch: Partial<CustomerStyleDetails>) => {
    onStyleChange?.({ ...details, ...patch });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT') return;
    e.preventDefault();
    const inputs = Array.from(e.currentTarget.querySelectorAll('input')) as HTMLInputElement[];
    const index = inputs.indexOf(target as HTMLInputElement);
    if (index >= 0 && index + 1 < inputs.length) inputs[index + 1].focus();
  };

  const NumberRow = (label: string, field: keyof CustomerMeasurements, tooltip?: string, drawing?: 'neck' | 'jabzour' | 'pocket') => (
    <div className={rowClass}>
      <label className={labelClass} title={tooltip}>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={measurements[field] || ''}
        onChange={(e) => updateField(field, e.target.value)}
        data-drawing={drawing}
        data-testid={measurementTestIdPrefix ? `${measurementTestIdPrefix}-measurement-${field}` : undefined}
        className={`${inputClass} w-24 mx-2`}
      />
      <div className="flex-1 border-b-2 border-dotted border-[#111111]/20 group-hover:border-[#111111]/40 transition-colors mt-1" />
    </div>
  );

  const neckType = details.neckType || '';
  const isLegacyCollarChoice = neckType === 'ملكي' || neckType === 'فرنسي';
  const isLegacyPlainChoice = neckType === 'سادة مدور' || neckType === 'سادة مربع' || neckType === 'سادة عادي';
  const isCollar = neckType === 'قلاب' || isLegacyCollarChoice;
  const isPlain = neckType === 'سادة' || isLegacyPlainChoice;
  const collarShape = isLegacyCollarChoice ? neckType : (details.neckShape || '');
  const plainShape = neckType === 'سادة عادي'
    ? 'سادة مربع'
    : isLegacyPlainChoice
      ? neckType
      : details.neckShape === 'سادة عادي'
        ? 'سادة مربع'
        : (details.neckShape || '');
  const baseNeckType = isCollar ? 'قلاب' : isPlain ? 'سادة' : '';

  const jabzourOptions: { value: string; label: string }[] = [
    { value: 'باين', label: 'باين' },
    { value: 'وزار مخفي', label: 'وزار مخفي' },
    { value: 'سحاب مخفي', label: 'سحاب مخفي' },
  ];
  const pocketOptions: { value: string; label: string }[] = [
    { value: 'جيب عادي', label: 'جيب عادي' },
    { value: 'جيب مربع', label: 'جيب مربع' },
  ];

  const measurementsGridClass = layoutVariant === 'customers-responsive'
    ? 'measurements-ux-grid grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_minmax(0,1.8fr)] xl:gap-5 items-start'
    : 'measurements-ux-grid grid grid-cols-1 xl:grid-cols-[2.5fr_1.5fr_1.8fr] gap-8 items-start';

  return (
    <div onKeyDown={handleKeyDown} onFocusCapture={handleInputFocus} onBlurCapture={handleFocusExit} dir="rtl" className={`measurements-ux-form ${layoutVariant === 'orders-original' ? 'measurements-ux-form--orders' : 'measurements-ux-form--customers'} space-y-8 animate-in fade-in duration-500`}>
      <div className={measurementsGridClass}>
        {/* RIGHT COLUMN — القياسات الأساسية */}
        <Section title="القياسات الأساسية" icon={<Ruler className="w-5 h-5" />} className="orders-measurement-basic">
          {NumberRow('طول أمام', 'frontLength')}
          {NumberRow('طول خلف', 'backLength')}
          {NumberRow('الكتف', 'shoulderWidth')}

          <div className="space-y-3 py-4 border-b border-[#D9D9D9] min-w-0 group">
            <div className={rowClass}>
              <label className={labelClass}>اليد</label>
              <input
                type="text"
                inputMode="decimal"
                value={measurements.sleeveLength || ''}
                onChange={(e) => updateField('sleeveLength', e.target.value)}
                data-testid={measurementTestIdPrefix ? `${measurementTestIdPrefix}-measurement-sleeveLength` : undefined}
                className={`${inputClass} w-20 mx-2`}
              />
              <div className="flex-1 min-w-[40px] border-b-2 border-solid border-[#E5E7EB] mt-1" />
            </div>
            <div className="flex flex-wrap items-center gap-2 pr-1">
              <span className="text-[11px] font-black text-[#6B7280] whitespace-nowrap">نوع اليد:</span>
              {(['سادة', 'كبك'] as const).map((type) => (
                <OptionChip key={type} label={type} selected={details.sleeveType === type} onClick={() => updateStyle('sleeveType', type)} />
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2 pr-1">
              {(['cuff1', 'cuff2', 'cuff3', 'cuff4', 'cuff5'] as const).map((field, index) => (
                <div key={field} className="w-12 shrink-0">
                  <label className="block text-[9px] font-black text-[#9CA3AF] text-center mb-1">{index + 1}</label>
                  <input
                    type="text"
                    value={details[field] || ''}
                    onChange={(e) => updateStyle(field, e.target.value)}
                    className={`${inputClass} w-full px-1 text-xs`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 py-4 border-b border-[#D9D9D9] min-w-0 group">
            <div className={rowClass}>
              <label className={labelClass}>الرقبة</label>
              <input
                type="text"
                inputMode="decimal"
                value={measurements.neckSize || ''}
                onChange={(e) => updateField('neckSize', e.target.value)}
                data-drawing="neck"
                className={`${inputClass} w-20 mx-2`}
              />
              <div className="flex-1 min-w-[40px] border-b-2 border-solid border-[#E5E7EB] mt-1" />
            </div>
            <div className="flex flex-wrap items-center gap-2 pr-1">
              <span className="text-[11px] font-black text-[#6B7280] whitespace-nowrap">نوع الرقبة:</span>
              {(['سادة', 'قلاب'] as const).map((type) => (
                <OptionChip
                  key={type}
                  label={type}
                  selected={baseNeckType === type}
                  onClick={() => updateStyleMany(
                    type === 'سادة'
                      ? { neckType: 'سادة', neckShape: plainShape || 'سادة مدور' }
                      : { neckType: 'قلاب', neckShape: collarShape || 'ملكي' }
                  )}
                />
              ))}
            </div>
            {isPlain && (
              <div className="flex flex-wrap items-center gap-2 pr-1 mr-2 border-r-2 border-[#D9D9D9]">
                <span className="text-[11px] font-black text-[#6B7280] whitespace-nowrap">نوع السادة:</span>
                {(['سادة مدور', 'سادة مربع'] as const).map((type) => (
                  <OptionChip
                    key={type}
                    label={type}
                    selected={plainShape === type}
                    onClick={() => updateStyleMany({ neckType: 'سادة', neckShape: type })}
                  />
                ))}
              </div>
            )}
            {isCollar && (
              <div className="flex flex-wrap items-center gap-2 pr-1 mr-2 border-r-2 border-[#D9D9D9]">
                <span className="text-[11px] font-black text-[#6B7280] whitespace-nowrap">نوع القلاب:</span>
                {(['ملكي', 'فرنسي'] as const).map((type) => (
                  <OptionChip
                    key={type}
                    label={type}
                    selected={collarShape === type}
                    onClick={() => updateStyleMany({ neckType: 'قلاب', neckShape: type })}
                  />
                ))}
              </div>
            )}
          </div>


          <div className={rowClass}>
            <label className={labelClass}>الوسع</label>
            <input
              type="text"
              inputMode="decimal"
              value={measurements.bottomSweep || ''}
              onChange={(e) => updateField('bottomSweep', e.target.value)}
              className={`${inputClass} w-24 mx-2`}
            />
            <div className="flex-1 min-w-[40px] border-b-2 border-solid border-[#E5E7EB] mt-1" />
          </div>
        </Section>

        {/* MIDDLE COLUMN — تفاصيل التفصيل والرسومات */}
        <Section title="تفاصيل التفصيل" icon={<Scissors className="w-5 h-5" />} className="orders-measurement-details xl:order-3">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-[#6B7280] uppercase tracking-wider">الجبزور</label>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {jabzourOptions.map((opt) => (
                    <OptionChip key={opt.value} label={opt.label} selected={details.habroorType === opt.value} onClick={() => updateStyle('habroorType', opt.value)} />
                  ))}
                </div>
              </div>
              <div className="space-y-3 pt-3 border-t border-[#E5E7EB]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black text-[#6B7280] whitespace-nowrap">الشكل:</span>
                  {(['جبزور مثلث', 'جبزور مربع'] as const).map((shape) => (
                    <OptionChip
                      key={shape}
                      label={shape}
                      selected={details.bottomHemShape === shape}
                      onClick={() => updateStyle('bottomHemShape', shape)}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-start gap-3" aria-label="رسومات الجبزور المختار">
                  <div className="space-y-1.5">
                    <span className="block text-center text-[10px] font-black text-[#6B7280]">نوع الجبزور</span>
                    <DrawingBox className="w-28 h-32" active={activeDrawing === 'jabzour'}>
                      <JabzourTypeDrawing type={details.habroorType} />
                    </DrawingBox>
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-center text-[10px] font-black text-[#6B7280]">شكل الجبزور</span>
                    <DrawingBox className="w-28 h-32" active={activeDrawing === 'jabzour'}>
                      <JabzourShapeDrawing shape={details.bottomHemShape} />
                    </DrawingBox>
                  </div>
                </div>
                <div className="flex w-full items-center justify-start gap-3 pt-1 pr-1">
                  <label className="text-[11px] font-black text-[#111111] whitespace-nowrap">طول الجبزور:</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={details.habroorLength || ''}
                    onChange={(e) => updateStyle('habroorLength', e.target.value)}
                    data-drawing="jabzour"
                    className={`${inputClass} w-20`}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t-2 border-[#E5E7EB]">
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-[#6B7280] uppercase tracking-wider">الجيب</label>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {pocketOptions.map((opt) => (
                    <OptionChip key={opt.value} label={opt.label} selected={details.chestPocketStyle === opt.value} onClick={() => updateStyle('chestPocketStyle', opt.value)} />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-[#111111] whitespace-nowrap">عرض الجيب:</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={details.chestPocketWidth || ''}
                      onChange={(e) => updateStyle('chestPocketWidth', e.target.value)}
                      data-drawing="pocket"
                      className={`${inputClass} w-20`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-[#111111] whitespace-nowrap">نزل الجيب:</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={details.chestPocketDrop || ''}
                      onChange={(e) => updateStyle('chestPocketDrop', e.target.value)}
                      data-drawing="pocket"
                      className={`${inputClass} w-20`}
                    />
                  </div>
                </div>
                <DrawingBox active={activeDrawing === 'pocket'}>
                  <PocketDrawing
                    type={details.chestPocketStyle}
                    pocketWidth={details.chestPocketWidth}
                    pocketDrop={details.chestPocketDrop}
                    highlighted={activeDrawing === 'pocket'}
                  />
                </DrawingBox>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t-2 border-[#E5E7EB]">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <label className="text-[11px] font-black text-[#6B7280] uppercase tracking-wider whitespace-nowrap">الرقبة</label>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-[11px] font-black text-[#111111] whitespace-nowrap">ارتفاع الرقبة:</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={measurements.neckHeight || ''}
                    onChange={(e) => updateField('neckHeight', e.target.value)}
                    data-drawing="neck"
                    className={`${inputClass} w-20`}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(['بلاستيك مخفي', 'بلاستيك حديد'] as const).map((type) => (
                      <OptionChip key={type} label={type} selected={details.neckPadding === type} onClick={() => updateStyle('neckPadding', type)} />
                    ))}
                  </div>
                </div>
              </div>
              <DrawingBox active={activeDrawing === 'neck'}><NeckDrawing neckType={neckType} neckShape={details.neckShape} highlighted={activeDrawing === 'neck'} /></DrawingBox>
            </div>

          </div>
        </Section>

        {/* LEFT COLUMN — باقي القياسات */}
        <Section title="باقي القياسات" className="orders-measurement-other h-full xl:order-2">
          <div className="flex flex-col h-full">
            {NumberRow('التخاليص', 'clearances')}
            {NumberRow('ميلان الكتف', 'shoulderSlope')}
            {NumberRow('الورك', 'hipSize')}
            {NumberRow('الصدر', 'chestSize')}
            
            <div className="mt-auto pt-6">
              <div className="bg-[#111111] text-white p-5 rounded-2xl text-center shadow-lg transform hover:scale-[1.02] transition-transform">
                <label className="block text-[11px] font-black opacity-60 uppercase tracking-widest mb-2">الخطوة</label>
                <input
                  type="text"
                  value={measurements.stepSize || ''}
                  onChange={(e) => updateField('stepSize', e.target.value)}
                  className="bg-white/10 border-2 border-white/20 rounded-xl w-full h-12 text-center text-2xl font-black text-white focus:bg-white focus:text-[#111111] focus:border-white outline-none transition-all"
                  placeholder="00"
                />
              </div>
            </div>
          </div>
        </Section>
      </div>

      {(draftStatusText || onSave) && (
        <div className="measurements-action-bar flex flex-wrap items-center justify-between gap-4 pt-6 border-t-4 border-[#111111]">
          <div className="draft-status min-h-5 text-[11px] font-bold text-[#6B7280]" aria-live="polite">
            {draftStatusText}
          </div>
          {onSave && (
            <div className="flex items-center justify-end gap-4">
              {onCancel && <Button variant="ghost" onClick={handleCancel}>إلغاء</Button>}
              <Button variant="primary" size="lg" onClick={handleSave} isLoading={isSaving} icon={<Check className="w-5 h-5" />}>
                {saveLabel}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
