// @ts-nocheck
import React from 'react';
import { Invoice, Order, UserPreferences } from '../types';
import { SahwaLogo } from './SahwaLogo';
import { NeckDrawing, PocketDrawing, JabzourTypeDrawing, JabzourShapeDrawing, InvoiceDrawingProps } from './InvoiceDrawings';

export interface PrintableInvoiceProps {
  invoice: Invoice;
  order?: Order | null;
  preferences?: UserPreferences | null;
  showOnScreen?: boolean;
}

const valueOf = (obj: Record<string, unknown> | undefined, key: string, fallback = '') => {
  const value = obj?.[key];
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
};

const MeasurementCell = ({ label, value, className = "" }: { label: string; value: string; className?: string }) => {
  const isThobeType = label === 'نوع الثوب';
  return (
    <div className={`invoice-measure-cell-new measurement-grid-row ${className}`}>
      <span className="invoice-label-new">{label}</span>
      <span className={isThobeType ? "invoice-value-new bg-black text-white px-3" : "invoice-value-new"}>
        {value || '--'}
      </span>
    </div>
  );
};

const DrawingBox = ({ label, value, Drawing, subContent, neckShape, drawingType, drawingShape, pocketWidth, pocketDrop, showDimensions, showValue = true }: { label: string; value: string; Drawing?: React.ComponentType<InvoiceDrawingProps>; subContent?: React.ReactNode; neckShape?: string; drawingType?: string; drawingShape?: string; pocketWidth?: string; pocketDrop?: string; showDimensions?: boolean; showValue?: boolean }) => (
  <div className="invoice-drawing-card">
    <div className="invoice-drawing-header">
      <span className="invoice-label-new">{label}</span>
      {showValue && <span className="invoice-value-new">{value || '--'}</span>}
    </div>
    <div className="invoice-drawing-body">
      {Drawing && (
        <div className={`invoice-main-drawing ${label === 'الجيب' ? 'pocket-dimension-drawing' : ''}`}>
          <Drawing 
              type={drawingType || value}
              neckType={label === 'الرقبة' ? value : undefined} 
              neckShape={label === 'الرقبة' ? neckShape : undefined}
              shape={drawingShape}
              pocketWidth={pocketWidth}
              pocketDrop={pocketDrop}
              showDimensions={showDimensions}
          />
        </div>
      )}
      {subContent}
    </div>
  </div>
);

const MiniDrawingBox = ({ label, Drawing, drawingType, drawingShape }: { label: string; Drawing: React.ComponentType<InvoiceDrawingProps>; drawingType?: string; drawingShape?: string }) => (
  <div className="invoice-mini-drawing-card">
    <div className="invoice-mini-drawing-label">{label}</div>
    <div className="invoice-mini-drawing-body">
      <Drawing type={drawingType} shape={drawingShape} />
    </div>
  </div>
);

export const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({ invoice, order, preferences, showOnScreen = false }) => {
  if (!invoice) return null;

  const shopName = preferences?.shopName || 'صهوة للخياطة الرجالية';
  const shopLogoUrl = preferences?.shopLogoUrl;
  const shopPhone = preferences?.shopPhone?.trim() || '';
  const shopAddress = preferences?.shopAddress?.trim() || '';
  const contactDetails = [
    shopPhone ? { label: 'هاتف', value: shopPhone } : null,
    shopAddress ? { label: 'العنوان', value: shopAddress } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const m = (order?.measurements || {}) as unknown as Record<string, unknown>;
  const sd = (order?.styleDetails || {}) as unknown as Record<string, unknown>;

  const displayInvoiceNumber = invoice.visibleInvoiceNumber ? `INV-${invoice.visibleInvoiceNumber}` : invoice.invoiceNumber;
  const customerNumber = order?.customerNumber ? `#${order.customerNumber}` : '--';
  const customerPhone = order?.customerPhone || invoice.customerPhone || '--';
  const invoiceDate = order?.orderDate || invoice.orderDate || '--';
  const deliveryDate = order?.deliveryDate || '--';
  const thobeType = order?.thobeTypeName || '--';
  const fabricName = order?.fabricName?.trim() || '--';
  const handType = valueOf(sd, 'sleeveType', '--');
  const handMeasure = valueOf(m, 'sleeveLength', '--');
  const handOptions = ['cuff1', 'cuff2', 'cuff3', 'cuff4', 'cuff5'].map((key, index) => ({
    key,
    number: index + 1,
    value: valueOf(sd, key, '--')
  }));

  const neckType = valueOf(sd, 'neckType', '--');
  const neckShape = valueOf(sd, 'neckShape', '--');
  const neckDisplay = neckShape !== '--' && (neckType === 'قلاب' || neckType === 'سادة')
    ? `${neckType} ${neckShape}`
    : neckType;
  const neckSize = valueOf(m, 'neckSize', '--');
  const neckHeight = valueOf(m, 'neckHeight', '--');
  const neckPadding = valueOf(sd, 'neckPadding', '--');
  const pocketDrop = valueOf(sd, 'chestPocketDrop', '--');
  const pocketWidth = valueOf(sd, 'chestPocketWidth', '--');
  const jabzourType = valueOf(sd, 'habroorType', '');
  const jabzourShape = valueOf(sd, 'bottomHemShape', '');
  const jabzourLength = valueOf(sd, 'habroorLength', jabzourShape || valueOf(sd, 'habroorStyle', '--'));
  const notes = order?.notes || '';
  const tailorNotes = valueOf(sd, 'tailorNotes', '');

  return (
    <div className={`invoice-luxury-container printable-area-ticket ${showOnScreen ? 'invoice-screen-preview' : ''}`} dir="rtl">
      {/* Header Section */}
      <div className="invoice-luxury-header">
        <div className="header-brand">
          {shopLogoUrl ? (
            <img src={shopLogoUrl} alt={shopName} className="header-logo" />
          ) : (
            <SahwaLogo className="header-logo" color="#000000" />
          )}
          <div className="header-titles">
            <h1 className="shop-name-title">{shopName}</h1>
            <p className="shop-subtitle">للخياطة الرجالية الراقية</p>
            {contactDetails.length > 0 && (
              <div className="header-contact-row" aria-label="بيانات التواصل">
                {contactDetails.map((item) => (
                  <span className="header-contact-item" key={item.label}>
                    <span className="header-contact-label">{item.label}</span>
                    <span className="header-contact-value">{item.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="header-meta-box">
          <div className="meta-item"><span className="meta-label">رقم الفاتورة:</span> <span className="meta-value">#{displayInvoiceNumber}</span></div>
          <div className="meta-item"><span className="meta-label">التاريخ:</span> <span className="meta-value">{invoiceDate}</span></div>
          <div className="meta-item"><span className="meta-label">موعد التسليم:</span> <span className="meta-value">{deliveryDate}</span></div>
        </div>
      </div>

      {/* Customer & Payment Info */}
      <div className="invoice-info-grid-new">
        <div className="info-card invoice-grid-card">
          <div className="info-row-new"><span>اسم العميل</span><strong>{invoice.customerName || '--'}</strong></div>
          <div className="info-row-new"><span>رقم الجوال</span><strong>{customerPhone}</strong></div>
          <div className="info-row-new"><span>رقم العميل</span><strong>{customerNumber}</strong></div>
        </div>
        <div className="info-card invoice-grid-card">
          <div className="info-row-new highlight-black"><span>إجمالي المبلغ</span><strong>{invoice.totalAmount} ر.س</strong></div>
          <div className="info-row-new"><span>المبلغ المدفوع</span><strong>{invoice.paidAmount} ر.س</strong></div>
          <div className="info-row-new highlight-gray"><span>المبلغ المتبقي</span><strong>{invoice.remainingAmount} ر.س</strong></div>
        </div>
      </div>

      {/* Main Content Columns */}
      <div className="invoice-main-layout">
        {/* Right Column: Basic Measurements */}
        <section className="layout-column side-column invoice-section-block basic-measurements-section">
          <h3 className="column-title">القياسات الأساسية</h3>
          <div className="measurements-group measurements-grid-card">
            <MeasurementCell label="طول أمام" value={valueOf(m, 'frontLength')} />
            <MeasurementCell label="طول خلف" value={valueOf(m, 'backLength')} />
            <MeasurementCell label="الكتف" value={valueOf(m, 'shoulderWidth')} />
            
            <div className="combined-measure-box">
              <div className="measure-row-inline hand-measure-row">
                <div className="hand-measure-pair">
                  <span className="invoice-label-new">اليد</span>
                  <span className="invoice-value-new">{handMeasure}</span>
                </div>
                <div className="hand-measure-pair">
                  <span className="invoice-label-new">نوع اليد</span>
                  <span className="invoice-value-new">{handType}</span>
                </div>
              </div>
              <div className="hand-cuffs-grid">
                {handOptions.map((opt) => (
                  <div key={opt.key} className="cuff-box">
                    <span className="cuff-num">{opt.number}</span>
                    <span className="cuff-val">{opt.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="combined-measure-box">
              <div className="measure-row-inline">
                <span className="invoice-label-new">الرقبة</span>
                <span className="invoice-value-new">{neckSize}</span>
              </div>
              <div className="measure-row-inline border-t border-gray-100">
                <span className="invoice-label-new">نوع الرقبة</span>
                <span className="invoice-value-new">{neckDisplay}</span>
              </div>
            </div>

            <MeasurementCell label="الوسع" value={valueOf(m, 'bottomSweep')} />
            <MeasurementCell label="نوع الثوب" value={thobeType} />
            <MeasurementCell label="اسم القماش" value={fabricName} />
          </div>
        </section>

        {/* Center Column: Remaining Measurements */}
        <section className="layout-column center-column invoice-section-block remaining-measurements-section">
          <h3 className="column-title">باقي القياسات</h3>
          <div className="measurements-group measurements-grid-card">
            <MeasurementCell label="التخاليص" value={valueOf(m, 'clearances')} />
            <MeasurementCell label="ميلان الكتف" value={valueOf(m, 'shoulderSlope')} />
            <MeasurementCell label="الورك" value={valueOf(m, 'hipSize')} />
            <MeasurementCell label="الصدر" value={valueOf(m, 'chestSize')} />
            <div className="step-measure-card mt-4">
              <span className="invoice-label-new">الخطوة</span>
              <div className="step-value-large">{valueOf(m, 'stepSize', '--')}</div>
            </div>
          </div>
        </section>

        {/* Left Column: Drawings & Details */}
        <section className="layout-column side-column invoice-section-block drawings-section">
          <h3 className="column-title">التفصيل والرسومات</h3>
          <div className="drawings-stack">
            <div className="jabzour-composite-card">
              <div className="invoice-drawing-header">
                <span className="invoice-label-new">طول الجبزور</span>
                <span className="invoice-value-new">{jabzourLength || '--'}</span>
              </div>
              <div className="jabzour-drawing-pair">
                <MiniDrawingBox
                  label="النوع"
                  drawingType={jabzourType || jabzourShape}
                  Drawing={JabzourTypeDrawing}
                />
                <MiniDrawingBox
                  label="الشكل"
                  drawingShape={jabzourShape}
                  Drawing={JabzourShapeDrawing}
                />
              </div>
            </div>
            <DrawingBox
              label="الرقبة"
              value={neckDisplay}
              Drawing={NeckDrawing}
              neckShape={neckShape}
              showValue={false}
              subContent={(
                              <div className="neck-drawing-specs" aria-label="تفاصيل الرقبة الفنية">
                <div className="neck-drawing-spec-row neck-drawing-spec-row-combined">
                  <span className="invoice-label-new">ارتفاع الرقبة</span>
                  <span className="invoice-value-new">{neckHeight}</span>
                  <span className="invoice-value-new">{neckPadding}</span>
                </div>
              </div>

              )}
            />
            <div className="drawing-group-card">
              <div className="pocket-dimensions-row">
                <span className="invoice-label-new">أبعاد الجيب</span>
                <div className="pocket-dimensions-values">
                  <span className="pocket-dimension-chip">العرض {pocketWidth}</span>
                  <span className="pocket-dimension-chip">النزول {pocketDrop}</span>
                </div>
              </div>
              <DrawingBox
                label="الجيب"
                value={valueOf(sd, 'chestPocketStyle')}
                pocketWidth={pocketWidth}
                pocketDrop={pocketDrop}
                showDimensions={false}
                showValue={false}
                Drawing={PocketDrawing}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Notes Section */}
      {(notes || tailorNotes) && (
        <div className="invoice-luxury-notes">
          {notes && (
            <div className="mb-4">
              <h3 className="column-title">ملاحظات الطلب</h3>
              <div className="notes-content-box">{notes}</div>
            </div>
          )}
          {tailorNotes && (
            <div className="tailor-notes-box">
              <h3 className="column-title">ملاحظات الخياط</h3>
              <div className="notes-content-box">{tailorNotes}</div>
            </div>
          )}
        </div>
      )}

      {/* Footer Branding */}
      <div className="invoice-luxury-footer">
        <p>نظام صهوة للخياطة الرجالية الراقية - دقة في التنفيذ وفخامة في المظهر</p>
      </div>
    </div>
  );
};
