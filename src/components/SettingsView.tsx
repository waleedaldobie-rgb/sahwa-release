// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { UserPreferences } from '../types';
import { Card, Button, Input } from './ui';
import { Store, Phone, MapPin, ImageUp, Trash2, Save, Printer, CheckCircle2, AlertCircle } from 'lucide-react';
import { SahwaLogo } from './SahwaLogo';

export interface SettingsViewProps {
  preferences: UserPreferences;
  onSaveShopSettings: (prefs: Partial<UserPreferences>) => void | Promise<void>;
  showToast: (msg: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
}

type ShopSettings = Pick<UserPreferences, 'shopName' | 'managerName' | 'shopAddress' | 'shopPhone' | 'shopLogoUrl'>;
type SettingsErrors = Partial<Record<'shopName' | 'managerName' | 'shopPhone', string>>;

const DEFAULT_SHOP_NAME = 'مَشْغَلْ صَهْوَةْ لِلْخِيَاطَةِ الرَّجَالِيَّةِ';
const DEFAULT_MANAGER_NAME = 'حاتم محمد الدبعي';
const DEFAULT_SHOP_ADDRESS = 'نجران شارع الفيصليه';
const DEFAULT_SHOP_PHONE = '0500000000';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const settingsFromPreferences = (preferences: UserPreferences): ShopSettings => ({
  shopName: preferences.shopName || DEFAULT_SHOP_NAME,
  managerName: preferences.managerName || DEFAULT_MANAGER_NAME,
  shopAddress: preferences.shopAddress || DEFAULT_SHOP_ADDRESS,
  shopPhone: preferences.shopPhone || DEFAULT_SHOP_PHONE,
  shopLogoUrl: preferences.shopLogoUrl
});

const validateSettings = (settings: ShopSettings): SettingsErrors => {
  const normalisedPhone = (settings.shopPhone || '').replace(/[\s-]/g, '');
  const errors: SettingsErrors = {};
  if ((settings.shopName || '').trim().length < 3) errors.shopName = 'اكتب اسم المحل بثلاثة أحرف على الأقل.';
  if ((settings.managerName || '').trim().length < 2) errors.managerName = 'اكتب اسم المسؤول الظاهر في الفواتير.';
  if (!/^(05\d{8}|\+9665\d{8})$/.test(normalisedPhone)) {
    errors.shopPhone = 'اكتب رقم جوال صحيحاً مثل 0500000000 أو +966500000000.';
  }
  return errors;
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  preferences,
  onSaveShopSettings,
  showToast
}) => {
  const [initialSettings, setInitialSettings] = useState<ShopSettings>(() => settingsFromPreferences(preferences));
  const [shopName, setShopName] = useState(initialSettings.shopName || '');
  const [managerName, setManagerName] = useState(initialSettings.managerName || '');
  const [shopAddress, setShopAddress] = useState(initialSettings.shopAddress || '');
  const [shopPhone, setShopPhone] = useState(initialSettings.shopPhone || '');
  const [shopLogoUrl, setShopLogoUrl] = useState<string | undefined>(initialSettings.shopLogoUrl);
  const [previewSize, setPreviewSize] = useState<'a5' | 'a4'>('a5');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<SettingsErrors>({});

  useEffect(() => {
    const nextSettings = settingsFromPreferences(preferences);
    setInitialSettings(nextSettings);
    setShopName(nextSettings.shopName || '');
    setManagerName(nextSettings.managerName || '');
    setShopAddress(nextSettings.shopAddress || '');
    setShopPhone(nextSettings.shopPhone || '');
    setShopLogoUrl(nextSettings.shopLogoUrl);
    setErrors({});
  }, [preferences.shopName, preferences.managerName, preferences.shopAddress, preferences.shopPhone, preferences.shopLogoUrl]);

  const currentSettings = useMemo<ShopSettings>(() => ({
    shopName: shopName.trim(),
    managerName: managerName.trim(),
    shopAddress: shopAddress.trim(),
    shopPhone: shopPhone.trim(),
    shopLogoUrl
  }), [shopName, managerName, shopAddress, shopPhone, shopLogoUrl]);

  const hasUnsavedChanges = JSON.stringify(currentSettings) !== JSON.stringify(initialSettings);

  const updateField = <K extends keyof ShopSettings>(field: K, value: ShopSettings[K]) => {
    const setters: Record<keyof ShopSettings, (next: any) => void> = {
      shopName: setShopName,
      managerName: setManagerName,
      shopAddress: setShopAddress,
      shopPhone: setShopPhone,
      shopLogoUrl: setShopLogoUrl
    };
    setters[field](value);
    if (field === 'shopName' || field === 'managerName' || field === 'shopPhone') {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('اختر ملف صورة صالحاً للشعار.', 'warning');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      showToast('حجم الشعار يجب ألا يتجاوز 2 ميجابايت.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => updateField('shopLogoUrl', String(reader.result));
    reader.onerror = () => showToast('تعذر قراءة ملف الشعار.', 'danger');
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const nextErrors = validateSettings(currentSettings);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showToast('راجع الحقول المحددة قبل حفظ بيانات المحل.', 'warning');
      return;
    }

    if (!hasUnsavedChanges) return;
    setIsSaving(true);
    try {
      await onSaveShopSettings(currentSettings);
      setInitialSettings(currentSettings);
      showToast('تم حفظ بيانات المحل بنجاح', 'success');
    } catch {
      showToast('تعذر حفظ الإعدادات. لم يتم تغيير البيانات السابقة.', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const previewWidth = previewSize === 'a5' ? 'max-w-[360px]' : 'max-w-[520px]';

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
      <Card
        title="بيانات المحل المطبوعة"
        subtitle="تظهر هذه البيانات في ترويسة الفاتورة A4 وكرت الطباعة A5"
        headerIcon={<Store className="h-4 w-4" />}
        accentBorder="amber"
        className="xl:col-span-3"
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--color-info-token)]/20 bg-[var(--color-info-token)]/5 px-4 py-3 text-xs font-bold text-[var(--color-info-token)]">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>تتغير المعاينة فوراً، وتصبح البيانات فعالة في الفواتير الجديدة بعد الضغط على الحفظ.</p>
            </div>
          </div>

          <Input
            label="اسم المحل (بالتفصيل)"
            value={shopName}
            onChange={(event) => updateField('shopName', event.target.value)}
            placeholder="مثال: مَشْغَلْ صَهْوَةْ لِلْخِيَاطَةِ الرَّجَالِيَّةِ"
            error={errors.shopName}
          />

          <Input
            label="اسم المسؤول الظاهر في الواجهة"
            value={managerName}
            onChange={(event) => updateField('managerName', event.target.value)}
            placeholder="مثال: حاتم محمد الدبعي"
            error={errors.managerName}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="العنوان"
              value={shopAddress}
              onChange={(event) => updateField('shopAddress', event.target.value)}
              placeholder="مثال: نجران شارع الفيصليه"
              icon={<MapPin className="h-4 w-4" />}
            />
            <Input
              label="رقم التواصل"
              value={shopPhone}
              onChange={(event) => updateField('shopPhone', event.target.value)}
              placeholder="مثال: 0500000000"
              icon={<Phone className="h-4 w-4" />}
              dir="ltr"
              error={errors.shopPhone}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-text-token)]">شعار المحل (اختياري)</span>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[var(--brand-black)] bg-[var(--color-surface-soft-token)]">
                {shopLogoUrl ? (
                  <img src={shopLogoUrl} alt="شعار المحل" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--brand-black)] p-2 text-white">
                    <SahwaLogo className="h-full w-full" color="#ffffff" />
                  </div>
                )}
              </div>

              <label className="sahwa-button sahwa-button--secondary inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 px-3.5 text-xs font-bold">
                <ImageUp className="h-4 w-4" />
                رفع شعار جديد
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
              </label>

              {shopLogoUrl && (
                <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => updateField('shopLogoUrl', undefined)}>
                  إزالة الشعار
                </Button>
              )}
            </div>
            <p className="mt-2 text-[10.5px] font-semibold text-[var(--color-text-muted-token)]">PNG أو JPG أو WebP، بحد أقصى 2 ميجابايت. بدون شعار سيظهر الشعار النصي الرسمي «صهوة» تلقائياً.</p>
          </div>

          <div className="flex flex-col justify-between gap-3 border-t border-[var(--color-border-token)] pt-4 sm:flex-row sm:items-center">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-muted-token)]" aria-live="polite">
              {hasUnsavedChanges ? <AlertCircle className="h-4 w-4 text-[var(--color-warning-token)]" /> : <CheckCircle2 className="h-4 w-4 text-[var(--color-success-token)]" />}
              {hasUnsavedChanges ? 'توجد تعديلات غير محفوظة' : 'كل التعديلات محفوظة'}
            </p>
            <Button icon={<Save className="h-4 w-4" />} onClick={() => void handleSave()} isLoading={isSaving} disabled={!hasUnsavedChanges}>
              {hasUnsavedChanges ? 'حفظ بيانات المحل' : 'تم الحفظ'}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="معاينة الترويسة المطبوعة"
        subtitle="مثال توضيحي يتحدث مباشرة مع البيانات التي تكتبها"
        headerIcon={<Printer className="h-4 w-4" />}
        className="xl:col-span-2"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-[var(--color-text-token)]">حجم المعاينة</p>
            <p className="mt-1 text-[10px] font-bold text-[var(--color-text-muted-token)]">لا تمثل هذه المعاينة فاتورة حقيقية.</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border-token)] bg-[var(--color-surface-soft-token)] p-1" role="group" aria-label="حجم المعاينة">
            {(['a5', 'a4'] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={previewSize === size}
                onClick={() => setPreviewSize(size)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-black transition ${previewSize === size ? 'bg-[var(--brand-black)] text-white' : 'text-[var(--color-text-muted-token)] hover:text-[var(--color-text-token)]'}`}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-border-token)] bg-[var(--color-surface-soft-token)] p-4">
          <div className={`mx-auto w-full ${previewWidth} border-2 border-[var(--brand-black)] bg-white p-3 transition-all`}>
            <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--brand-black)] pb-2">
              <div className="flex items-center gap-3 text-center sm:text-right">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-[var(--brand-black)] bg-[var(--color-surface-soft-token)]">
                  {shopLogoUrl ? <img src={shopLogoUrl} alt={shopName || 'شعار المحل'} className="h-full w-full object-contain" referrerPolicy="no-referrer" /> : <div className="flex h-full w-full items-center justify-center bg-[var(--brand-black)] p-2"><SahwaLogo className="h-full w-full" color="#ffffff" /></div>}
                </div>
                <div className="space-y-0.5">
                  <div className="text-[13px] font-black leading-tight text-black">{shopName || 'اسم المحل'}</div>
                  <div className="text-[9px] font-bold leading-tight text-[#242424]">{shopAddress || 'عنوان المحل'}</div>
                  <div className="text-[9px] font-bold leading-tight text-[#242424]">رقم التواصل: <span className="dir-ltr inline-block font-mono">{shopPhone || '0500000000'}</span></div>
                </div>
              </div>
              <div className="shrink-0 text-center">
                <div className="bg-[var(--brand-black)] px-2.5 py-1 font-mono text-[10px] font-black tracking-widest text-white">معاينة</div>
                <div className="mt-1 text-[8px] font-bold text-[var(--color-text-muted-token)]">رقم تجريبي</div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[10px] font-semibold text-[var(--color-text-muted-token)]">الترويسة تتحدث مباشرة مع ما تكتبه أعلاه، ويثبتها زر الحفظ في الفواتير الجديدة.</p>
        </div>
      </Card>
    </div>
  );
};
