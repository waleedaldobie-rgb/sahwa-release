<div align="center">

<img src="build/icon.png" alt="شعار صهوة للخياطة" width="150" />

# صهوة للخياطة

### نظام مكتبي عربي لإدارة محلات الخياطة الرجالية

إدارة العملاء والمقاسات والطلبات والفواتير والمخزون والمحاسبة والنسخ الاحتياطي من خلال تطبيق Windows محلي وآمن.

[![CI](https://github.com/waleedaldobie-rgb/sahwa-release/actions/workflows/ci.yml/badge.svg)](https://github.com/waleedaldobie-rgb/sahwa-release/actions/workflows/ci.yml)
[![Windows Build](https://github.com/waleedaldobie-rgb/sahwa-release/actions/workflows/build-windows-installer.yml/badge.svg)](https://github.com/waleedaldobie-rgb/sahwa-release/actions/workflows/build-windows-installer.yml)
[![Latest Release](https://img.shields.io/github/v/release/waleedaldobie-rgb/sahwa-release?display_name=tag)](https://github.com/waleedaldobie-rgb/sahwa-release/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4)](https://github.com/waleedaldobie-rgb/sahwa-release/releases)

[تنزيل أحدث إصدار](https://github.com/waleedaldobie-rgb/sahwa-release/releases/latest)
·
[الإبلاغ عن مشكلة](https://github.com/waleedaldobie-rgb/sahwa-release/issues)
·
[سجل عمليات البناء](https://github.com/waleedaldobie-rgb/sahwa-release/actions)

</div>

---

## نبذة عن المشروع

**صهوة للخياطة** هو تطبيق مكتبي عربي مخصص لإدارة أعمال الخياطة الرجالية. يعمل التطبيق محليًا باستخدام Electron ويحفظ البيانات في قاعدة بيانات SQLite على جهاز المستخدم.

يوفر النظام واجهة RTL عربية لإدارة دورة العمل كاملة، بداية من تسجيل العميل والمقاسات، مرورًا بإنشاء الطلب ومتابعة حالته، ووصولًا إلى الفاتورة والدفع والتسليم والتقارير.

> التطبيق مصمم أساسًا للعمل على Windows. لا يحتاج تشغيل النسخة المكتبية إلى خادم خارجي أو اتصال دائم بالإنترنت، باستثناء الميزات الخارجية مثل فتح رسائل WhatsApp.

---

## المزايا

### إدارة العملاء والمقاسات

- تسجيل بيانات العملاء وأرقام التواصل.
- حفظ مقاسات كل عميل.
- الاحتفاظ بسجل تاريخي للمقاسات.
- استخدام مقاس سابق عند إنشاء طلب جديد.
- البحث والوصول السريع إلى بيانات العميل.

### إدارة الطلبات

- إنشاء وتعديل طلبات الخياطة.
- ربط الطلب بالعميل ونوع الثوب والقماش.
- تحديد عدد القطع وتاريخ الطلب والتسليم.
- متابعة حالة الطلب:
  - جديد.
  - قيد التنفيذ.
  - جاهز.
  - تم التسليم.
  - ملغي.
- تسجيل أحداث الطلب والتغييرات المهمة.

### الفواتير والمدفوعات

- إنشاء الفاتورة وربطها بالطلب.
- تسجيل الدفعات النقدية أو البطاقة أو التحويل.
- حساب المدفوع والمتبقي.
- دعم الرصيد الدائن للعميل.
- طباعة الفواتير بنمط تفصيلي أو مختصر.

### المخزون

- إدارة الأقمشة والإكسسوارات.
- إدارة أنواع الثياب والألوان.
- تسجيل حركات الإدخال والإخراج والتسويات.
- تسجيل المشتريات ومرتجعاتها.
- تنبيهات انخفاض المخزون.
- حساب تكلفة المواد المستخدمة في الطلب.

### المحاسبة والصندوق

- تسجيل المشتريات والمصروفات.
- تسجيل حركات الصندوق.
- متابعة المقبوضات والتسويات.
- ربط الحركات المالية بالطلبات والفواتير.
- الحفاظ على تكامل البيانات المالية.

### التقارير

- لوحة تحكم لمتابعة حالة العمل.
- تقارير المبيعات والإيرادات.
- تقارير المخزون والحركات المالية.
- تصدير تقارير Excel ضمن نطاق زمني.

### النسخ الاحتياطي والاستعادة

- إنشاء نسخ احتياطية تلقائية.
- إنشاء نسخة عند تشغيل التطبيق وإغلاقه.
- نسخ احتياطية دورية حسب الإعدادات.
- الاحتفاظ بعدد محدد من النسخ.
- تصدير البيانات بصيغة JSON.
- فحص سلامة قاعدة البيانات.
- استعادة البيانات من نسخة احتياطية.

### WhatsApp

- تجهيز رسالة متابعة للعميل.
- فتح الرسالة في WhatsApp باستخدام المتصفح الخارجي.
- تسجيل نتيجة محاولة فتح الرسالة ضمن إشعارات وأحداث الطلب.

---

## التقنيات المستخدمة

| التقنية | الاستخدام |
|---|---|
| Electron | تشغيل التطبيق كتطبيق مكتبي |
| React | بناء واجهة المستخدم |
| TypeScript | التحقق من الأنواع وتحسين جودة الكود |
| Vite | التطوير وتجميع واجهة التطبيق |
| Tailwind CSS | تنسيق الواجهة |
| SQLite | تخزين البيانات محليًا |
| better-sqlite3 | التعامل مع قاعدة البيانات |
| Zod | التحقق من البيانات عند حدود IPC |
| Vitest | اختبارات الوحدات |
| Playwright | اختبارات الواجهة والنسخة المثبتة |
| electron-builder | إنشاء مثبت Windows |
| GitHub Actions | الاختبارات والبناء والإصدارات |

---

## متطلبات التطوير

- Node.js `22.13` أو أحدث ضمن سلسلة Node 22.
- npm.
- Git.
- Windows 10 أو Windows 11 لبناء واختبار المثبّت.
- Python وVisual Studio Build Tools عند الحاجة لإعادة بناء الوحدات الأصلية مثل `better-sqlite3`.

للتحقق من الإصدارات:

```bash
node --version
npm --version
git --version
```

---

## تثبيت المشروع

```bash
git clone https://github.com/waleedaldobie-rgb/sahwa-release.git
cd sahwa-release
npm ci
```

> لا يحتاج المشروع إلى `GEMINI_API_KEY` لتشغيل نظام الخياطة الحالي.

---

## تشغيل نسخة الويب للتطوير

```bash
npm run dev
```

ثم افتح:

```text
http://localhost:3000
```

نسخة الويب تستخدم محاكيًا محليًا و`localStorage` بدل قاعدة بيانات Electron، ولذلك تُستخدم للمعاينة والتطوير وليست بديلًا عن النسخة المكتبية الإنتاجية.

---

## تشغيل Electron أثناء التطوير

```bash
npm run electron:dev
```

يقوم هذا الأمر بـ:

1. بناء ملفات Electron الرئيسية وPreload.
2. تشغيل Vite على المنفذ `3000`.
3. انتظار جاهزية خادم التطوير.
4. تشغيل تطبيق Electron.

---

## بناء المشروع

### بناء واجهة الويب

```bash
npm run build
```

### بناء ملفات Electron

```bash
npm run build:electron
```

### إنشاء مثبت Windows

```bash
npm run dist:windows
```

ستظهر ملفات الإصدار داخل:

```text
release/
```

واسم المثبّت يكون بالشكل التالي:

```text
Sahwa-Tailoring-Setup-X.Y.Z.exe
```

---

## أوامر الجودة والاختبارات

### فحص TypeScript وESLint

```bash
npm run quality
```

### تشغيل اختبارات الوحدات

```bash
npm test
```

### تشغيل اختبارات التكامل

```bash
npm run test:integration
```

### فحص استدعاءات IPC القديمة

```bash
npm run check:legacy-ipc
npm run test:legacy-ipc
```

### اختبار القيم الحدّية

```bash
npm run test:p2:boundaries
```

### اختبارات العرض المكتبي

```bash
npm run test:visual:desktop
```

### اختبارات الطباعة

```bash
npm run test:print:desktop
```

---

## أهم أوامر npm

| الأمر | الوصف |
|---|---|
| `npm run dev` | تشغيل واجهة Vite |
| `npm run electron:dev` | تشغيل التطبيق المكتبي في وضع التطوير |
| `npm run build` | بناء واجهة الإنتاج |
| `npm run build:electron` | بناء Electron main وpreload |
| `npm run dist:windows` | إنشاء مثبت Windows |
| `npm run quality` | تشغيل فحوصات الجودة |
| `npm test` | تشغيل اختبارات الوحدات |
| `npm run test:integration` | تشغيل اختبارات SQLite وElectron |
| `npm run preview` | معاينة بناء Vite |
| `npm run perf:report` | إنشاء تقرير أداء |

---

## بنية المشروع

```text
sahwa-release/
├── .github/workflows/       # GitHub Actions
├── build/                   # الأيقونات وإعدادات المثبّت
├── docs/                    # مستندات المشروع
├── public/                  # الخطوط والملفات العامة
├── scripts/                 # اختبارات وأدوات البناء والأداء
├── src/
│   ├── application/         # Controllers وProviders وبوابة البيانات
│   ├── components/          # مكونات وواجهات React
│   ├── domain/              # قواعد العمل والحسابات
│   ├── electron/
│   │   ├── database/        # تشغيل SQLite والنسخ والاستعادة
│   │   ├── ipc/             # معالجات IPC
│   │   ├── repositories/    # الوصول إلى البيانات
│   │   ├── security/        # حماية IPC والتنقل
│   │   ├── services/        # خدمات Electron
│   │   ├── main.ts          # Electron main process
│   │   └── preload.ts       # الجسر الآمن للواجهة
│   ├── services/            # الخدمات والمحاكيات المشتركة
│   ├── state/               # إدارة حالة البيانات
│   ├── styles/              # الأنماط
│   ├── utils/               # الدوال المساعدة
│   ├── App.tsx
│   └── main.tsx
├── electron-builder.json
├── package.json
├── playwright.config.ts
└── vite.config.ts
```

---

## تخزين البيانات

تستخدم النسخة المكتبية قاعدة بيانات SQLite باسم:

```text
sahwa_tailoring.db
```

ويتم تخزينها داخل:

```text
app.getPath("userData")/database/
```

وتوجد النسخ الاحتياطية داخل:

```text
app.getPath("userData")/backups/
```

> لا تعدّل ملفات قاعدة البيانات يدويًا أثناء تشغيل التطبيق.

### تنبيه خصوصية

تحتوي قاعدة البيانات والنسخ الاحتياطية على بيانات العملاء والمقاسات والهواتف والحسابات. يجب حفظها في جهاز موثوق وعدم مشاركة ملفات النسخ الاحتياطية مع أطراف غير مخولة.

---

## أمان Electron

يستخدم التطبيق حاليًا:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- جسر محدود عبر `contextBridge`
- تحقق من مصدر طلبات IPC
- تحقق Zod من المدخلات
- منع فتح النوافذ الداخلية غير المسموحة
- فتح روابط WhatsApp في المتصفح الخارجي

عند اكتشاف مشكلة أمنية، يُفضّل عدم نشر بيانات العملاء أو النسخ الاحتياطية داخل Issue عام.

---

## إنشاء إصدار جديد

قبل إنشاء الإصدار، يجب أن تتطابق الأرقام التالية:

```text
package.json version = Git tag = installer version
```

مثال لإصدار `1.3.6`:

```bash
npm version 1.3.6 --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: v1.3.6"
git tag v1.3.6
git push origin main
git push origin v1.3.6
```

عند دفع الوسم، يقوم GitHub Actions ببناء مثبت Windows وتشغيل اختبارات القبول قبل إنشاء الإصدار.

---

## تنزيل التطبيق

يمكن تنزيل أحدث نسخة من صفحة الإصدارات:

[تنزيل أحدث إصدار من صهوة للخياطة](https://github.com/waleedaldobie-rgb/sahwa-release/releases/latest)

قد يعرض Windows رسالة `Unknown Publisher` لأن النسخة الحالية غير موقعة رقميًا. تحقّق من قيمة SHA-256 المنشورة مع الإصدار قبل تثبيت الملف.

---

## المساهمة

قبل إرسال Pull Request:

```bash
npm ci
npm run quality
npm test
npm run build:electron:renderer
npm run build:electron
```

يرجى أن يتضمن طلب الدمج:

- وصف المشكلة أو الميزة.
- شرح التعديلات.
- نتائج الاختبارات.
- صور قبل وبعد عند تعديل الواجهة.
- توضيح أي تغيير في قاعدة البيانات أو Schema.

---

## حالة المشروع

المشروع تحت تطوير نشط. يُنصح بأخذ نسخة احتياطية قبل تثبيت إصدار جديد أو إجراء تغييرات كبيرة على قاعدة البيانات.

---

## الترخيص

لا يحتوي المستودع حاليًا على ترخيص مفتوح المصدر.

جميع الحقوق محفوظة لصهوة للخياطة ما لم تتم إضافة ملف `LICENSE` يحدد خلاف ذلك.
