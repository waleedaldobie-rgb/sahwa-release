import { dialog, WebContents } from 'electron';
import fs from 'node:fs/promises';

export interface PrinterSummary {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
}

// Electron printer sizes are expressed in microns: 150mm × 210mm.
export const PRINT_PAGE_SIZE: Electron.Size = { width: 150000, height: 210000 };
export type PrintPageSize = '15x21';

export type PrintFailureCode =
  | 'NO_PRINTER'
  | 'PRINTER_NOT_FOUND'
  | 'PRINT_FAILED'
  | 'PRINT_CANCELED'
  | 'DIALOG_FAILED'
  | 'PDF_FAILED';

export interface PrintResult {
  success: boolean;
  printerName: string;
  mode: 'direct' | 'dialog' | 'pdf';
}

export class PrintingService {
  constructor(
    private readonly getSavedPrinterName: () => string | undefined,
    private readonly savePrinterName: (name: string) => void,
  ) {}

  async listPrinters(webContents: WebContents): Promise<PrinterSummary[]> {
    const printers = await webContents.getPrintersAsync() as Array<Electron.PrinterInfo & { status?: number; isDefault?: boolean }>;
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      description: printer.description || '',
      status: printer.status ?? 0,
      isDefault: printer.isDefault ?? false,
    }));
  }

  async printDirect(
    webContents: WebContents,
    options: { deviceName?: string; pageSize?: PrintPageSize; allowDialogFallback?: boolean } = {},
  ): Promise<PrintResult> {
    const printers = await this.listPrinters(webContents);
    if (printers.length === 0) throw this.error('NO_PRINTER', 'لم يتم العثور على أي طابعة مثبتة في Windows');

    const requested = options.deviceName?.trim() || this.getSavedPrinterName()?.trim() || '';
    const printer = requested
      ? printers.find((item) => item.name === requested || item.displayName === requested)
      : printers.find((item) => item.isDefault) || printers[0];
    const effective = printer || printers.find((item) => item.isDefault) || printers[0];
    if (!effective) throw this.error('PRINTER_NOT_FOUND', 'تعذر تحديد طابعة متاحة');

    const directResult = await this.print(webContents, {
      silent: true,
      deviceName: effective.name,
      pageSize: PRINT_PAGE_SIZE,
      printBackground: true,
      margins: { marginType: 'none' },
    });

    if (directResult.success) {
      this.savePrinterName(effective.name);
      return { success: true, printerName: effective.displayName, mode: 'direct' };
    }

    if (options.allowDialogFallback !== false) {
      try {
        return await this.printWithDialog(webContents, options.pageSize || '15x21');
      } catch (error) {
        throw error instanceof Error
          ? error
          : this.error('DIALOG_FAILED', directResult.failureReason || 'تعذر إكمال الطباعة');
      }
    }

    throw this.error('PRINT_FAILED', directResult.failureReason || 'تعذر إرسال الفاتورة إلى الطابعة');
  }

  async printWithDialog(webContents: WebContents, _pageSize: PrintPageSize = '15x21'): Promise<PrintResult> {
    const printers = await this.listPrinters(webContents);
    if (printers.length === 0) throw this.error('NO_PRINTER', 'لم يتم العثور على أي طابعة مثبتة في Windows');

    const result = await this.print(webContents, {
      silent: false,
      pageSize: PRINT_PAGE_SIZE,
      printBackground: true,
      margins: { marginType: 'none' },
    });
    if (!result.success) {
      const reason = result.failureReason || 'تعذر إكمال الطباعة من نافذة Windows';
      const code: PrintFailureCode = /cancel/i.test(reason) ? 'PRINT_CANCELED' : 'DIALOG_FAILED';
      throw this.error(code, reason);
    }
    return { success: true, printerName: 'الطابعة المحددة من Windows', mode: 'dialog' };
  }

  async saveCurrentPageAsPdf(webContents: WebContents): Promise<{ success: boolean; path?: string; canceled?: boolean }> {
    try {
      const pdf = await webContents.printToPDF({
        pageSize: PRINT_PAGE_SIZE,
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      const result = await dialog.showSaveDialog({
        title: 'حفظ الفاتورة كملف PDF',
        defaultPath: 'فاتورة-صهوة.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      await fs.writeFile(result.filePath, pdf);
      return { success: true, path: result.filePath };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'تعذر إنشاء ملف PDF';
      throw this.error('PDF_FAILED', reason);
    }
  }

  private print(webContents: WebContents, options: Electron.WebContentsPrintOptions): Promise<{ success: boolean; failureReason?: string }> {
    return new Promise((resolve) => {
      webContents.print(options, (success, failureReason) => resolve({ success, failureReason }));
    });
  }

  private error(code: PrintFailureCode, message: string): Error & { code: PrintFailureCode } {
    const error = new Error(message) as Error & { code: PrintFailureCode };
    error.code = code;
    return error;
  }
}
