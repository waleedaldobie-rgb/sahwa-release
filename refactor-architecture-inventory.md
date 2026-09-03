# جرد معماري قبل إعادة الهيكلة

## النطاق الحالي

المشروع يستخدم React + TypeScript + Electron + SQLite + better-sqlite3 + IPC. لا توجد حاليًا طبقات Services أو Repositories مستقلة داخل `src/electron`؛ الملفان الرئيسيان هما `ipcHandlers.ts` و`db.ts`، بينما يعمل `electronMock.ts` كطبقة محاكاة وطبقة منطق أعمال ثانية.

## القياسات الحالية

| الملف | الحجم التقريبي | المسؤوليات الفعلية |
|---|---:|---|
| `src/electron/ipcHandlers.ts` | 1291 سطرًا | قنوات IPC، التحقق، SQL، المعاملات، منطق الطلبات والمخزون والمحاسبة. |
| `src/electron/db.ts` | 887 سطرًا | فتح SQLite، المخطط والترقيات التوافقية، النسخ والاستعادة والتقارير. |
| `src/services/electronMock.ts` | 1222 سطرًا | LocalStorage fallback، التطبيع، CRUD، منطق الطلبات والمخزون والمشتريات والمصروفات والصندوق. |
| `src/electron/schema.ts` | 266 سطرًا | DDL والجداول والفهارس وإصدار المخطط. |
| `src/types.ts` | 416 سطرًا | الأنواع المشتركة بين الواجهة وElectron والمحاكاة. |

يوجد في `ipcHandlers.ts` نحو 96 استخدامًا لـ`db.prepare/db.exec/db.transaction`، وفي `db.ts` نحو 69 استخدامًا، ما يؤكد أن SQL مختلط حاليًا مع طبقة التحكم ومنطق الأعمال.

## القنوات الحالية

القنوات موزعة إلى العملاء، الأقمشة، الإكسسوارات، المخزون، المشتريات، المصروفات، الصندوق، أنواع الثوب والألوان، الطلبات، الفواتير والدفعات، النسخ الاحتياطي، التقارير، الإعدادات، وواتساب. المسارات الأكثر حساسية هي `orders:create` و`orders:update` و`orders:updateStatus` و`invoices:addPayment` و`purchases:create` لأنها تجمع تغييرات متعددة داخل معاملات.

## مصادر الحقيقة المقترحة

| المجال | المصدر المقترح | ما لا ينبغي تكراره |
|---|---|---|
| التطبيع والقوالب | `src/services/shared/measurementDefaults.ts` | عدم إبقاء التطبيع في `electronMock.ts` فقط. |
| SQL الخاص بالطلبات | `src/electron/repositories/orderRepository.ts` | عدم وضع SQL جديد داخل handler. |
| SQL الخاص بالمخزون | `src/electron/repositories/inventoryRepository.ts` | عدم تكرار تحديث الكمية وحركة المخزون. |
| SQL الخاص بالصندوق والمحاسبة | `src/electron/repositories/accountingRepository.ts` | عدم تكرار إدخال حركات الصندوق. |
| قواعد الطلب المركبة | `src/electron/services/orderService.ts` | يبقى handler مسؤولًا عن استقبال المدخل واستدعاء الخدمة. |
| قواعد الدفع | `src/electron/services/paymentService.ts` | مصدر واحد لمنع تكرار الدفع وتحديث الفاتورة والصندوق. |
| قواعد الشراء والمصروفات | `src/electron/services/accountingService.ts` | إبقاء الربط بين المخزون والصندوق داخل خدمة واحدة. |
| migrations | `src/electron/migrations/00x_*.ts` | عدم توسيع `ensureCompatibilityMigrations` لكل تغيير جديد. |

## قرار المرحلة الأولى

لن يتم نقل كل النظام دفعة واحدة. البداية الآمنة هي استخراج الوحدات المشتركة غير المرتبطة بقاعدة البيانات، ثم إنشاء Repositories صغيرة لاستخدامها من Service واحدة في مسار حساس، وبعد نجاح الاختبارات يُنقل handler التالي. سيبقى المسار القديم قابلًا للمقارنة أثناء كل مرحلة ولن يُحذف أي منطق غير موثق.

## المخاطر التي يجب مراقبتها

أكبر مخاطر إعادة الهيكلة هي اختلاف المسار الحقيقي عن المحاكاة، وتغيير ترتيب المعاملات، وكسر idempotency، واختلاف صيغ JSON للمقاسات والتفاصيل، أو فقدان ترتيب الأحداث. لذلك يجب أن تكون كل خطوة مصحوبة بفحص TypeScript وبناء واختبارات العمليات الأساسية، مع اختبار SQLite عبر Electron runtime بدل Node النظام بسبب ABI الخاص بـ better-sqlite3.
