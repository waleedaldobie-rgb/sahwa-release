# إعداد حزمة Windows NSIS — Sahwa

## الإعداد المعتمد

تم إنشاء `electron-builder.json` ليكون المصدر الوحيد لإعدادات التغليف. يستهدف الإعداد Windows x64 باستخدام NSIS، ويخرج الملفات داخل `release/`، ويستخدم ASAR مع فك ضغط `better-sqlite3` بسبب كونه native module.

| الإعداد | القيمة |
|---|---|
| `appId` | `com.sahwa.tailoring` |
| اسم المنتج | `صهوة للخياطة` |
| اسم الملف التنفيذي | `sahwa-tailoring.exe` |
| ملف التثبيت | `Sahwa-Tailoring-Setup-1.3.3.exe` وفق الإصدار الحالي |
| النظام | Windows x64 |
| الهدف | NSIS |
| نوع التثبيت | قابل لاختيار مجلد التثبيت، وليس one-click |
| الاختصارات | Desktop وStart Menu |
| حذف بيانات المستخدم عند الإزالة | لا؛ `deleteAppDataOnUninstall: false` |
| التوقيع | غير مفعّل حاليًا؛ يلزم Code Signing Certificate قبل التوزيع العام |

## أوامر التشغيل

لبناء Installer Windows النهائي على جهاز Windows أو Windows CI:

```bash
npm ci
npm run quality
npm run test
npm run build:electron:renderer
npm run build:electron
npm run dist:windows -- --publish never
```

ينتج الأمر ملف Setup داخل `release/` بالاسم `Sahwa-Tailoring-Setup-<version>.exe`.

## التحقق المنفذ

تم التحقق من صحة JSON، وتحميل الإعداد بواسطة electron-builder، وبناء نسخة Windows unpacked بنجاح باستخدام `--dir`. كما تم التحقق من وجود الملف التنفيذي `sahwa-tailoring.exe` داخل `release/win-unpacked/`.

تعذر إنتاج NSIS Installer كامل داخل بيئة Linux الحالية لأن electron-builder يحتاج Wine عند بناء هدف Windows NSIS. هذا قيد بيئة البناء وليس خطأ في ملف الإعداد؛ سير العمل الموجود في `.github/workflows/windows-packaged-acceptance.yml` يستخدم `windows-2022` ومهيأ لبناء المثبت والتثبيت والاختبار.

## ملاحظة native modules

تم إبقاء `npmRebuild: true` في الإعداد النهائي، لأن البناء الصحيح على Windows يجب أن يعيد بناء `better-sqlite3` مع Electron ABI المناسب. استخدم التحقق المحلي `--config.npmRebuild=false` فقط لتجاوز cross-compilation من Linux أثناء اختبار بنية الحزمة، ولا تستخدم هذا override في إصدار Windows النهائي.

## قبل الإصدار العام

يلزم توفير شهادة توقيع Windows، ثم تغيير `signAndEditExecutable` إلى `true` أو اعتماد إعدادات الشهادة المناسبة في CI دون تخزين الأسرار داخل المستودع. كما ينبغي تشغيل اختبار Windows packaged acceptance على المثبت الناتج، وحساب SHA-256، وتجربة التثبيت والترقية والإزالة مع التأكد من بقاء قاعدة بيانات المستخدم والنسخ الاحتياطية.
