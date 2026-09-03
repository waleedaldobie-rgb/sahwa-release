# ملاحظات انتقالية لعقد SahwaGateway

البوابة تغطي عمليات النقل المشتركة بين Electron والـ Mock. الدوال التالية موجودة على `window.electronAPI` وخارج العقد الحالي:

| الدالة | السبب |
|---|---|
| `getPreferences` / `savePreferences` | تفضيلات الواجهة وليست بيانات أعمال |
| `getDashboardSummary` | ملخص مجمّع أُضيف في المرحلة 5 |
| `getOrderEvents` / `getOrderMaterialUsages` | شرائح تفصيلية للقراءة |
| `getStockMovements` / `adjustStock` / `returnPurchase` | حركات مخزون تُستدعى من شاشات المخزون |
| `customerCredits.diagnostics` / `getOperation` | تشخيص وتشغيل رصيد عميل |
| `sendWhatsAppNotice` / `printDocument` | آثار جانبية في الواجهة |
| `checkDatabaseIntegrity` | فحص نظام |
| `automationStorageInfo` / `automationPrintToPDF` | قنوات أتمتة |

ستُضاف دوال الأرشفة/الاستعادة/الحذف التفصيلية في المرحلة 7.4 بنفس النمط.
