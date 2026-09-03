# بناء Sahwa تلقائيًا على Windows وإضافة icon.ico

## الوضع الحالي في المشروع

المشروع يحتوي أصلًا على Workflow متكامل في `.github/workflows/windows-packaged-acceptance.yml`. هذا الـWorkflow يعمل على `windows-2022`، يثبت Node.js وPython وMSVC، يشغل الجودة والاختبارات، يبني renderer وElectron، ينشئ NSIS Installer، يثبت المثبت داخل مجلد معزول، يشغل اختبارات packaged acceptance، يحسب SHA-256، ثم يرفع ملفات الإصدار كـartifact.

بعد إنشاء `electron-builder.json` أصبحت خطوة البناء الأساسية:

```powershell
npm run dist:windows -- --publish never
```

وفي Workflow الحالي يمكن إبقاء:

```powershell
npm run dist -- --publish never
```

لأن `dist` مربوط بالفعل بملف `electron-builder.json`.

## Workflow مبسط من الصفر

إذا احتجتم Workflow مستقلًا أبسط من الاختبارات المعبأة، أنشئوا الملف `.github/workflows/windows-build.yml` بالمحتوى التالي. لا تنشئوه إذا كان Workflow الحالي هو المسار المعتمد؛ استخدموا الملف الحالي لتجنب تشغيل بنائين متزامنين بلا حاجة.

```yaml
name: Sahwa Windows Build

on:
  workflow_dispatch:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: read

jobs:
  build-windows:
    runs-on: windows-2022
    timeout-minutes: 60

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Setup Python for native modules
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Setup MSVC
        uses: ilammy/msvc-dev-cmd@v1

      - name: Install dependencies
        shell: pwsh
        env:
          npm_config_python: ${{ env.pythonLocation }}\python.exe
        run: npm ci --ignore-scripts

      - name: Quality
        run: npm run quality

      - name: Unit tests
        run: npm test -- --run --reporter=dot

      - name: Build renderer
        shell: pwsh
        env:
          ELECTRON_BUILD: 'true'
        run: npm run build

      - name: Build Electron files
        run: npm run build:electron

      - name: Build unsigned NSIS installer
        shell: pwsh
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npm run dist:windows -- --publish never

      - name: Verify installer exists
        shell: pwsh
        run: |
          $installer = Get-ChildItem release -Filter '*Setup*.exe' -File | Select-Object -First 1
          if ($null -eq $installer) { throw 'No NSIS installer was generated.' }
          Write-Host "Installer: $($installer.FullName)"
          $hash = (Get-FileHash -Algorithm SHA256 $installer.FullName).Hash
          "$($installer.Name)  $hash" | Set-Content release\SHA256SUMS.txt -Encoding utf8

      - name: Upload Windows artifacts
        uses: actions/upload-artifact@v4
        with:
          name: sahwa-windows-${{ github.ref_name }}-${{ github.run_number }}
          path: |
            release/*Setup*.exe
            release/SHA256SUMS.txt
          if-no-files-found: error
          retention-days: 14
```

عند دفع tag مثل `v1.3.4` سيبني GitHub Actions المثبت ويرفعه في صفحة تشغيل Workflow كـartifact. بعد نجاح البناء يمكن إضافة خطوة Release منفصلة، لكن يفضل عدم نشر إصدار عام قبل توقيع المثبت وتشغيل اختبار packaged acceptance.

## إضافة أيقونة مخصصة

يوجد شعار Sahwa الحالي في `src/assets/sahwa-logo.svg`. أفضل مسار هو الاحتفاظ بنسخة master بصيغة SVG، ثم وضع نسخة الإصدار داخل مجلد موارد التغليف:

```text
build/
└── icon.svg
```

يدعم electron-builder مصدر SVG ويحوّله تلقائيًا إلى صيغة Windows المناسبة. لذلك لا يلزم إنشاء `icon.ico` يدويًا إذا كان SVG عالي الجودة. يمكن ربطه صراحة في `electron-builder.json`:

```json
{
  "directories": {
    "buildResources": "build"
  },
  "win": {
    "icon": "build/icon.svg",
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ]
  }
}
```

إذا كان المطلوب ملف Windows ICO صريحًا، اتبعوا الخطوات التالية:

1. صدّروا الشعار على خلفية شفافة وبمربع 1024×1024 أو 512×512، مع ترك مساحة داخلية كافية حتى لا يُقص الشعار في شريط المهام.
2. أنشئوا ملف ICO متعدد الأحجام، ويفضل أن يحتوي على 16×16 و24×24 و32×32 و48×48 و64×64 و128×128 و256×256. يجب أن تكون الحواف واضحة عند الحجم الصغير.
3. احفظوا الملف باسم `build/icon.ico` داخل المستودع.
4. غيّروا إعداد Windows في `electron-builder.json` إلى:

```json
{
  "files": [
    "dist/**/*",
    "dist-electron/**/*",
    "package.json",
    "build/icon.ico"
  ],
  "win": {
    "icon": "build/icon.ico"
  }
}
```

إضافة `build/icon.ico` إلى `files` مهمة لأن `src/electron/main.ts` يستخدم الأيقونة أيضًا عند إنشاء `BrowserWindow` عبر المسار `../build/icon.ico`. إذا لم يُضمّن الملف داخل الحزمة فسيظهر المثبت بأيقونته، لكن قد يستخدم نافذة التطبيق أو بعض السياقات رمز Electron الافتراضي.

يفضل استخدام اسم `build/icon.ico` نفسه للأيقونة العامة، وعدم خلطه مع `installerIcon` أو `uninstallerIcon`. يمكن إضافة أيقونات المثبت لاحقًا عند الحاجة:

```json
{
  "nsis": {
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico"
  }
}
```

بعد إضافة الأيقونة، شغّلوا:

```bash
npm run quality
npm run build:electron:renderer
npm run build:electron
```

وعلى Windows:

```powershell
npm run dist:windows -- --publish never
```

ثم تحققوا من الأيقونة في أربعة مواضع: ملف Setup، ملف `sahwa-tailoring.exe`، اختصار Desktop، وStart Menu. إذا بقيت الأيقونة القديمة بعد التحديث، احذفوا الاختصار القديم أو غيّروا رقم الإصدار وأعيدوا تثبيت النسخة؛ Windows قد يحتفظ بـicon cache.

## التوقيع الرقمي

الإعداد الحالي يبني Installer غير موقع عمدًا. قبل التوزيع للعملاء، خزّنوا شهادة Code Signing في GitHub Secrets ولا تضعوا ملف الشهادة أو كلمة المرور في المستودع. بعد اختبار الشهادة في بيئة خاصة، فعّلوا التوقيع في CI، ويفضل ضبط `forceCodeSigning` في Workflow الإصدار فقط حتى يفشل البناء إذا لم يتم توقيع الملف.

## ترتيب التحقق قبل الإصدار

| المرحلة | التحقق |
|---|---|
| CI | `npm run quality` و`npm test` و`npm run build` و`npm run build:electron` |
| التغليف | وجود `release/Sahwa-Tailoring-Setup-<version>.exe` وملف SHA-256 |
| التثبيت | تثبيت صامت داخل مجلد معزول ثم العثور على الملف التنفيذي |
| التشغيل | فتح التطبيق، إنشاء طلب، الدفع، الطباعة، WhatsApp، والنسخ الاحتياطي والاستعادة |
| البيانات | التأكد من بقاء قاعدة بيانات المستخدم بعد التحديث والإزالة |
| الهوية | فحص icon في Setup وEXE والاختصارات وStart Menu |
| الإصدار | توقيع رقمي ثم نشر artifact أو GitHub Release |

## مراجع

[1]: https://docs.github.com/en/actions/tutorials/store-and-share-data "GitHub Docs — Store and share data with workflow artifacts"

[2]: https://www.electron.build/docs/configuration/ "electron-builder — Configuration"

[3]: https://www.electron.build/docs/features/icons-and-images "electron-builder — Icons & Images"
