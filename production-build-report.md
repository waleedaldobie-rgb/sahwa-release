# تقرير Production Build وWindows Desktop Installer

**المنتج:** صهوة للخياطة

**الإصدار:** `1.0.0`

**تاريخ البناء:** 16 أغسطس 2026

## مخرجات الإصدار

تم إنشاء مثبت Windows بصيغة NSIS بنجاح عبر Electron Builder:

```text
release/صهوة للخياطة Setup 1.0.0.exe
```

كما تم إنشاء نسخة التطبيق المفكوكة للاختبار داخل:

```text
release/win-unpacked/
```

ويتضمن المجلد التنفيذي:

```text
release/win-unpacked/صهوة للخياطة.exe
```

## مواصفات التغليف

| العنصر | القيمة |
|---|---|
| Electron | 43.3.0 |
| Electron Builder | 25.1.8 |
| Target | Windows NSIS x64 |
| Installer mode | oneClick=false |
| Installation directory | قابل للتغيير من المستخدم |
| Desktop shortcut | مفعّل |
| Start Menu shortcut | مفعّل |
| SQLite native module | better-sqlite3 مع win32-x64 داخل الحزمة |
| Database location | `app.getPath('userData')/database` |
| Code signing | غير مفعّل؛ لا توجد شهادة توقيع متاحة |

## فحوصات ما قبل التغليف

تم تشغيل `npm run lint` و`npm test -- --run`، وكانت النتيجة **20/20 اختبارًا ناجحًا**. كما تم تشغيل Production Vite build وElectron build واختبار التكامل الحقيقي عبر Electron IPC وSQLite بنجاح.

تم التحقق من وجود `build/icon.ico`، وتضمينه في إعدادات Windows. كما تم التحقق من أن الحزمة المفكوكة تحتوي على `app.asar` ونسخة Windows x64 من `better-sqlite3` داخل `app.asar.unpacked`.

## التحقق من ملف المثبت

الملف الناتج تعرفه أدوات النظام كالتالي:

```text
PE32 executable (GUI) Intel 80386, Nullsoft Installer self-extracting archive
```

وحجم المثبت يقارب **135 MB**. قيمة SHA-256:

```text
1bc2f0b0bdb59b7f6fa2b3e240d32fcc5e3c5410edbda00c9f8dfa9237d0a8fa
```

كما تم إنشاء blockmap للتحديثات المستقبلية:

```text
release/صهوة للخياطة Setup 1.0.0.exe.blockmap
```

## ملاحظة بيئة البناء

تم إنشاء المثبت داخل بيئة Linux باستخدام Wine prefix مهيأ. بسبب عدم توفر بيئة Windows أصلية وشهادة توقيع، تم تعطيل خطوة `rcedit` الخاصة بتعديل موارد الملف التنفيذي (`signAndEditExecutable=false`) حتى يكتمل بناء NSIS. هذا لا يمنع تشغيل المثبت، لكنه يعني أن النسخة غير موقعة رقميًا، وقد يعرض Windows تحذير «ناشر غير معروف».

للحصول على النسخة النهائية المثالية للتسليم، يُفضّل إعادة البناء على GitHub Actions Windows أو جهاز Windows، ثم تفعيل توقيع Code Signing إن توفرت الشهادة.

## حالة الجاهزية

**Production Build وNSIS Installer جاهزان للتجربة والتسليم الداخلي.** قبل التسليم التجاري النهائي يجب اختبار `Setup.exe` على جهاز Windows فعلي، تثبيته فوق نسخة قديمة، التحقق من بقاء قاعدة `userData`، تجربة التشغيل والطباعة، ثم حساب SHA-256 للملف النهائي بعد أي إعادة بناء أو توقيع.
