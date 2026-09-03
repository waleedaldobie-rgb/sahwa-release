// @ts-nocheck
import React, { useState, useRef } from 'react';
import { Modal, Button, Card } from './ui';
import { Download, Upload, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

export interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
  showToast: (msg: string, type: 'success' | 'danger' | 'warning' | 'info') => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  showToast
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [importFileContent, setImportFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const jsonStr = await window.electronAPI.exportBackup();
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.setAttribute('download', `sahwa_tailoring_backup_${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('تم تصدير النسخة الاحتياطية بنجاح!', 'success');
    } catch (e) {
      showToast('فشل في تصدير البيانات. يرجى المحاولة لاحقاً.', 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showToast('يرجى اختيار ملف بملحق .json حصراً', 'danger');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportFileContent(content);
      setConfirmImport(true);
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (!importFileContent) return;
    try {
      setIsImporting(true);
      const res = await window.electronAPI.importBackup(importFileContent);
      if (res.success) {
        showToast('تم استعادة النسخة الاحتياطية بنجاح!', 'success');
        onRefreshData();
        setConfirmImport(false);
        setImportFileContent(null);
        onClose();
      } else {
        showToast(res.error || 'الملف المرفق غير متوافق.', 'danger');
      }
    } catch (e) {
      showToast('حدث خطأ غير متوقع أثناء الاستيراد.', 'danger');
    } finally {
      setIsImporting(false);
    }
  };

  const executeReset = async () => {
    try {
      setIsResetting(true);
      const success = await window.electronAPI.clearAllData();
      if (success) {
        showToast('تم تصفير قاعدة البيانات بنجاح والبدء من جديد!', 'success');
        onRefreshData();
        setConfirmReset(false);
        onClose();
      } else {
        showToast('فشل في تصفير البيانات. يرجى المحاولة لاحقاً.', 'danger');
      }
    } catch (e) {
      showToast('حدث خطأ غير متوقع أثناء تصفير البيانات.', 'danger');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إدارة النسخ الاحتياطي والبيانات"
      maxWidth="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          إغلاق
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Export Card */}
        <Card
          title="تصدير نسخة احتياطية"
          subtitle="حفظ جميع بيانات العملاء، المقاسات، والطلبات في ملف JSON آمن"
          headerIcon={<Download className="w-5 h-5 text-amber-500" />}
        >
          <p className="text-xs text-slate-600 leading-relaxed mb-4">
            ينصح بتصدير نسخة احتياطية بشكل دوري لحماية بيانات المحل وإمكانية نقلها لأي جهاز آخر فوراً.
          </p>
          <Button
            variant="primary"
            onClick={handleExport}
            isLoading={isExporting}
            icon={<Download className="w-4 h-4" />}
          >
            تنزيل النسخة الاحتياطية الان (.json)
          </Button>
        </Card>

        {/* Import Card */}
        <Card
          title="استعادة نسخة احتياطية"
          subtitle="استبدال البيانات الحالية بملف نسخة احتياطية سابقة"
          headerIcon={<Upload className="w-5 h-5 text-amber-500" />}
        >
          <input
            data-testid="backup-file-input"
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />

          {!confirmImport ? (
            <div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                قم باختيار ملف JSON يحتوي على بيانات محل صهوة للخياطة. سيتم التحقق من صحة وقراءة البيانات قبل التطبيق.
              </p>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                icon={<Upload className="w-4 h-4 text-amber-600" />}
              >
                اختيار ملف النسخة الاحتياطية...
              </Button>
            </div>
          ) : (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5 text-rose-900">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <h5 className="text-sm font-bold">تحذير هام قبل الاستبدال!</h5>
                  <p className="text-xs mt-1 text-rose-700 leading-relaxed">
                    أنت على وشك استبدال كامل البيانات الحالية بالملف الخارجي ({fileName}). هذا الإجراء سيمسح البيانات الحالية ولا يمكن التراجع عنه!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-rose-200 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmImport(false);
                    setImportFileContent(null);
                  }}
                >
                  إلغاء
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={executeImport}
                  isLoading={isImporting}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  تأكيد واستبدال البيانات الآن
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Reset Database Card */}
        <Card
          title="تصفير قاعدة البيانات (البدء من الصفر)"
          subtitle="حذف كافة بيانات الأمثلة التجريبية والوهمية الحالية للبدء ببياناتك الحقيقية"
          headerIcon={<Trash2 className="w-5 h-5 text-rose-500" />}
        >
          {!confirmReset ? (
            <div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                يقوم هذا الخيار بحذف كافة العملاء الافتراضيين، والطلبات، والفواتير التجريبية المخزنة حالياً لتتمكن من استخدام التطبيق الفعلي ببيانات حقيقية ونظيفة تماماً.
              </p>
              <Button
                variant="danger"
                onClick={() => setConfirmReset(true)}
                icon={<Trash2 className="w-4 h-4" />}
              >
                تصفير وحذف البيانات الوهمية...
              </Button>
            </div>
          ) : (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5 text-rose-900">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <h5 className="text-sm font-bold">تأكيد الحذف والتصفير الكامل!</h5>
                  <p className="text-xs mt-1 text-rose-700 leading-relaxed">
                    أنت على وشك مسح كامل البيانات الحالية (بما في ذلك كافة العملاء، المقاسات، الطلبات، والفواتير). سيتم إعادة تهيئة قاعدة البيانات فارغة تماماً. هذا الإجراء نهائي ولا يمكن التراجع عنه!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-rose-200 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmReset(false)}
                >
                  إلغاء
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={executeReset}
                  isLoading={isResetting}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  نعم، تصفير والبدء من الصفر الآن
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Modal>
  );
};
