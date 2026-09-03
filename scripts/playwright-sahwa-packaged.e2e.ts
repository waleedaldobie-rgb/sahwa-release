import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const executablePath = process.env.SAHWA_EXE;
const testData =
  process.env.SAHWA_TEST_DATA ?? path.resolve(".tmp", "sahwa-playwright-data");
const evidenceDir =
  process.env.SAHWA_EVIDENCE_DIR ?? path.resolve("test-results", "playwright");

if (!executablePath) {
  throw new Error("SAHWA_EXE must point to the installed sahwa-tailoring.exe");
}

if (!fs.existsSync(executablePath)) {
  throw new Error(`Installed Electron executable not found: ${executablePath}`);
}

fs.mkdirSync(testData, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

test.describe.configure({ mode: "serial" });

test.describe("Sahwa Tailoring packaged UI", () => {
  let app: ElectronApplication;
  let page: Page;
  const unexpectedErrors: string[] = [];

  async function launchApp() {
    app = await electron.launch({
      executablePath,
      args: ["--no-sandbox"],
      env: {
        ...process.env,
        APPDATA: path.join(testData, "AppData", "Roaming"),
        LOCALAPPDATA: path.join(testData, "AppData", "Local"),
        SAHWA_TEST_DATA: testData,
        SAHWA_UI_AUTOMATION: "1",
        NODE_ENV: "test",
      },
      timeout: 30_000,
    });

    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    page.on("console", (message) => {
      if (message.type() === "error") {
        unexpectedErrors.push(`[console] ${message.text()}`);
        console.error(`[renderer:console] ${message.text()}`);
      }
    });

    page.on("pageerror", (error) => {
      unexpectedErrors.push(`[pageerror] ${error.message}`);
      console.error(`[renderer:pageerror] ${error.message}`);
    });
  }

  async function screenshot(name: string) {
    await page.screenshot({
      path: path.join(evidenceDir, `${name}.png`),
      fullPage: true,
    });
  }

  async function openCustomers() {
    await page.getByRole("button", { name: "العملاء والمقاسات" }).click();
    await expect(page.getByTestId("customers-add")).toBeVisible({
      timeout: 20_000,
    });
  }

  async function openOrders() {
    await page.getByRole("button", { name: "إدارة الطلبات" }).click();
    await expect(page.getByTestId("orders-add")).toBeVisible({
      timeout: 20_000,
    });
  }

  async function openScreen(name: RegExp, heading: RegExp) {
    await page.getByRole("button", { name }).click();
    await expect(page.getByText(heading).first()).toBeVisible();
  }

  async function openInventoryTab(tabName: "الأقمشة" | "الإكسسوارات") {
    await page
      .getByRole("button", { name: "المخزون والأصناف", exact: true })
      .click();
    const tab = page.getByRole("tab", { name: tabName, exact: true });
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }

  async function openInventoryWorkspaceTab(
    tabName: "الموديلات والألوان" | "حركة المخزون",
  ) {
    await page
      .getByRole("button", { name: "المخزون والأصناف", exact: true })
      .click();
    const tab = page.getByRole("tab", { name: tabName, exact: true });
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }

  function inventoryRow(name: string) {
    return page.getByRole("row").filter({ hasText: name }).first();
  }

  test.beforeAll(async () => {
    fs.rmSync(testData, { recursive: true, force: true });
    fs.mkdirSync(testData, { recursive: true });
    await launchApp();
  });

  test.afterAll(async () => {
    if (app) {
      await app.close().catch(() => undefined);
    }
  });

  test("opens without a crash and shows Dashboard", async () => {
    await expect(
      page.getByText("لوحة التحكم", { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await screenshot("01-dashboard");
  });

  test("opens the main operational screens", async () => {
    await openCustomers();
    await screenshot("02-customers");

    await openOrders();
    await screenshot("03-orders");

    await openScreen(/المخزون|إدارة المخزون/, /المخزون/);
    await screenshot("04-inventory");

    await openScreen(/^الفواتير والحسابات$/, /الفواتير/);
    await screenshot("05-invoices");

    await openScreen(/^التقارير والإحصائيات$/, /التقارير والإحصائيات المالية/);
    await screenshot("06-reports");

    await openScreen(/^المحاسبة والمشتريات$/, /المحاسبة|Accounting/);
    await screenshot("07-accounting");
  });

  test("creates a customer and saves measurements", async () => {
    await openCustomers();
    await page.getByTestId("customers-add").click();
    await expect(
      page.getByText("تسجيل عميل جديد", { exact: true }),
    ).toBeVisible();

    await page.getByTestId("customer-name").fill("عميل Playwright Test");
    await page.getByTestId("customer-phone").fill("0500000098");
    await page.getByTestId("customer-measurement-frontLength").fill("25.5");
    await page.getByTestId("customer-measurement-sleeveLength").fill("24");
    await screenshot("08-customer-form");

    await page.getByTestId("save-customer-measurements").click();
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.electronAPI
              .getData()
              .then((data) =>
                data.customers.some(
                  (customer) => customer.name === "عميل Playwright Test",
                ),
              ),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect(
      page.getByText("عميل Playwright Test", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("creates an order and verifies the real generated order number", async () => {
    await openOrders();
    await page.getByTestId("orders-add").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByText("جدول القياسات والرسومات", { exact: true }),
    ).toBeVisible();

    await page
      .getByTestId("order-customer-select")
      .selectOption({ label: "عميل Playwright Test - (0500000098)" });
    await page.getByTestId("order-measurement-frontLength").fill("25.5");
    await page.getByTestId("order-measurement-backLength").fill("25");
    await page.getByTestId("order-measurement-shoulderWidth").fill("18");
    await page.getByTestId("order-measurement-sleeveLength").fill("24");
    await screenshot("09-order-form");

    await page.getByTestId("order-save").click();
    const successToast = page
      .getByRole("status")
      .filter({ hasText: "تم تسجيل الطلب الجديد رقم" });
    await expect(successToast).toBeVisible({ timeout: 20_000 });

    const toastText = await successToast.innerText();
    expect(toastText).toMatch(/تم تسجيل الطلب الجديد رقم\s*\(?#?\d+\)?/);
    await expect(
      page.getByText("عميل Playwright Test", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await screenshot("10-orders-after-save");
  });

  test("closes and reopens the packaged app with persisted data", async () => {
    await app.close();
    await launchApp();
    await expect(
      page.getByText("لوحة التحكم", { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await openCustomers();
    await expect(
      page.getByText("عميل Playwright Test", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const customerRow = page.getByRole("row", { name: /عميل Playwright Test/ });
    await customerRow.getByRole("button", { name: "عرض التفاصيل" }).click();
    await expect(
      page.getByTestId("customer-measurement-frontLength"),
    ).toHaveValue("25.5");
    await screenshot("11-customer-after-reopen");

    await openOrders();
    await expect(
      page.getByText("عميل Playwright Test", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await screenshot("12-orders-after-reopen");
  });

  test("edits a fabric selling price without changing its quantity", async () => {
    const originalName = "قماش Playwright Edit";
    const updatedName = "قماش Playwright Edited";

    await openInventoryTab("الأقمشة");
    await page
      .getByRole("button", { name: "إضافة قماش جديد", exact: true })
      .click();
    const addDialog = page.getByRole("dialog");
    await addDialog
      .getByLabel("اسم القماش *", { exact: true })
      .fill(originalName);
    await addDialog.getByLabel("اللون", { exact: true }).fill("أبيض");
    await addDialog.getByLabel("سعر البيع (ر.س)", { exact: true }).fill("125");
    await addDialog.getByLabel("المخزون الحالي (متر)", { exact: true }).fill("42");
    await addDialog
      .getByRole("button", { name: "حفظ البيانات", exact: true })
      .click();

    const originalRow = inventoryRow(originalName);
    await expect(originalRow).toContainText("125 ر.س");
    await expect(originalRow).toContainText("42 متر");

    await originalRow
      .getByRole("button", { name: "تعديل", exact: true })
      .click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByLabel("اسم القماش *", { exact: true })
      .fill(updatedName);
    await editDialog.getByLabel("سعر البيع (ر.س)", { exact: true }).fill("150");
    await editDialog.getByLabel("المخزون الحالي (متر)", { exact: true }).fill("42");
    await editDialog
      .getByRole("button", { name: "حفظ البيانات", exact: true })
      .click();

    await expect(page.getByText(originalName, { exact: true })).toHaveCount(0);
    const updatedRow = inventoryRow(updatedName);
    await expect(updatedRow).toContainText("150 ر.س");
    await expect(updatedRow).toContainText("42 متر");
    await screenshot("13-fabric-edited-price-quantity-unchanged");
  });

  test("deletes a fabric only after the confirmation modal", async () => {
    const name = "قماش Playwright Delete";

    await openInventoryTab("الأقمشة");
    await page
      .getByRole("button", { name: "إضافة قماش جديد", exact: true })
      .click();
    const addDialog = page.getByRole("dialog");
    await addDialog.getByLabel("اسم القماش *", { exact: true }).fill(name);
    await addDialog.getByLabel("سعر البيع (ر.س)", { exact: true }).fill("90");
    await addDialog.getByLabel("المخزون الحالي (متر)", { exact: true }).fill("18");
    await addDialog
      .getByRole("button", { name: "حفظ البيانات", exact: true })
      .click();

    await inventoryRow(name)
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toContainText(`هل أنت متأكد من حذف "${name}"؟`);
    await confirmDialog
      .getByRole("button", { name: "إلغاء", exact: true })
      .click();
    await expect(inventoryRow(name)).toBeVisible();

    await inventoryRow(name)
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await screenshot("14-fabric-deleted");
  });

  test("edits an accessory selling price without changing its quantity", async () => {
    const originalName = "إكسسوار Playwright Edit";
    const updatedName = "إكسسوار Playwright Edited";

    await openInventoryTab("الإكسسوارات");
    await page
      .getByRole("button", { name: "إضافة إكسسوار", exact: true })
      .click();
    const addDialog = page.getByRole("dialog");
    await addDialog
      .getByLabel("اسم الصنف *", { exact: true })
      .fill(originalName);
    await addDialog.getByLabel("الكمية الحالية", { exact: true }).fill("16");
    await addDialog.getByLabel("سعر البيع (ر.س)", { exact: true }).fill("12");
    await addDialog
      .getByRole("button", { name: "حفظ الإكسسوار", exact: true })
      .click();

    const originalRow = inventoryRow(originalName);
    await expect(originalRow).toContainText("16 حبة");

    await originalRow
      .getByRole("button", { name: "تعديل", exact: true })
      .click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByLabel("اسم الصنف *", { exact: true })
      .fill(updatedName);
    await editDialog.getByLabel("الكمية الحالية", { exact: true }).fill("16");
    await editDialog.getByLabel("سعر البيع (ر.س)", { exact: true }).fill("15");
    await editDialog
      .getByRole("button", { name: "حفظ الإكسسوار", exact: true })
      .click();

    await expect(page.getByText(originalName, { exact: true })).toHaveCount(0);
    const updatedRow = inventoryRow(updatedName);
    await expect(updatedRow).toContainText("16 حبة");
    await screenshot("15-accessory-edited-price-quantity-unchanged");
  });

  test("deletes an accessory after confirming the modal", async () => {
    const name = "إكسسوار Playwright Delete";

    await openInventoryTab("الإكسسوارات");
    await page
      .getByRole("button", { name: "إضافة إكسسوار", exact: true })
      .click();
    const addDialog = page.getByRole("dialog");
    await addDialog.getByLabel("اسم الصنف *", { exact: true }).fill(name);
    await addDialog.getByLabel("الكمية الحالية", { exact: true }).fill("7");
    await addDialog.getByLabel("سعر البيع (ر.س)", { exact: true }).fill("8");
    await addDialog
      .getByRole("button", { name: "حفظ الإكسسوار", exact: true })
      .click();

    await inventoryRow(name)
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toContainText(`هل أنت متأكد من حذف "${name}"؟`);
    await confirmDialog
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await screenshot("16-accessory-deleted");
  });

  test("creates, edits, and deletes a thobe model after confirmation", async () => {
    const originalName = "موديل Playwright Edit";
    const updatedName = "موديل Playwright Edited";

    await openInventoryWorkspaceTab("الموديلات والألوان");
    await page
      .getByRole("button", { name: "+ إضافة موديل جديد", exact: true })
      .click();
    const addDialog = page.getByRole("dialog");
    await addDialog
      .getByLabel("اسم الموديل *", { exact: true })
      .fill(originalName);
    await addDialog
      .getByLabel("السعر الافتراضي (ر.س)", { exact: true })
      .fill("240");
    await addDialog.getByLabel("الوصف", { exact: true }).fill("اختبار آلي");
    await addDialog
      .getByRole("button", { name: "إضافة الموديل", exact: true })
      .click();
    await expect(page.getByText(originalName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: `تعديل موديل ${originalName}`, exact: true })
      .click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByLabel("اسم الموديل *", { exact: true })
      .fill(updatedName);
    await editDialog
      .getByLabel("السعر الافتراضي (ر.س)", { exact: true })
      .fill("250");
    await editDialog
      .getByRole("button", { name: "حفظ التغييرات", exact: true })
      .click();
    await expect(page.getByText(originalName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: `حذف موديل ${updatedName}`, exact: true })
      .click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toContainText(
      `هل أنت متأكد من حذف "${updatedName}"؟`,
    );
    await confirmDialog
      .getByRole("button", { name: "إلغاء", exact: true })
      .click();
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible();

    await page
      .getByRole("button", { name: `حذف موديل ${updatedName}`, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await expect(page.getByText(updatedName, { exact: true })).toHaveCount(0);
    await screenshot("17-model-created-edited-deleted");
  });

  test("creates, edits, and deletes a color after confirmation", async () => {
    const originalName = "لون Playwright Edit";
    const updatedName = "لون Playwright Edited";

    await openInventoryWorkspaceTab("الموديلات والألوان");
    await page
      .getByRole("button", { name: "إضافة لون جديد", exact: true })
      .click();
    const addDialog = page.getByRole("dialog");
    await addDialog
      .getByLabel("اسم اللون *", { exact: true })
      .fill(originalName);
    await addDialog
      .getByLabel("كود اللون (Hex)", { exact: true })
      .fill("#123456");
    await addDialog
      .getByRole("button", { name: "إضافة اللون", exact: true })
      .click();
    await expect(page.getByText(originalName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: `تعديل لون ${originalName}`, exact: true })
      .click();
    const editDialog = page.getByRole("dialog");
    await editDialog
      .getByLabel("اسم اللون *", { exact: true })
      .fill(updatedName);
    await editDialog
      .getByLabel("كود اللون (Hex)", { exact: true })
      .fill("#654321");
    await editDialog
      .getByRole("button", { name: "حفظ التغييرات", exact: true })
      .click();
    await expect(page.getByText(originalName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: `حذف لون ${updatedName}`, exact: true })
      .click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toContainText(
      `هل أنت متأكد من حذف "${updatedName}"؟`,
    );
    await confirmDialog
      .getByRole("button", { name: "حذف", exact: true })
      .click();
    await expect(page.getByText(updatedName, { exact: true })).toHaveCount(0);
    await screenshot("18-color-created-edited-deleted");
  });

  test("records inventory adjustment in and out with a reason", async () => {
    await openInventoryWorkspaceTab("حركة المخزون");
    const itemSelect = page.getByLabel("الصنف", { exact: true });
    await expect(itemSelect.locator("option").nth(1)).toBeAttached({
      timeout: 15_000,
    });
    const itemId = await itemSelect
      .locator("option")
      .nth(1)
      .getAttribute("value");
    expect(itemId).toBeTruthy();
    await itemSelect.selectOption(itemId as string);

    const quantityInput = page.getByLabel("الكمية", { exact: true });
    const reasonInput = page.getByLabel("السبب", { exact: true });
    const directionSelect = page.getByLabel("نوع الحركة", { exact: true });
    const saveMovement = page.getByRole("button", { name: "حفظ", exact: true });

    await quantityInput.fill("3");
    await directionSelect.selectOption("adjustment");
    await reasonInput.fill("جرد زيادة Playwright");
    await saveMovement.click();
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.electronAPI
              .getData()
              .then((data) =>
                data.stockMovements.some(
                  (movement) => movement.reason === "جرد زيادة Playwright",
                ),
              ),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await openInventoryWorkspaceTab("حركة المخزون");
    await itemSelect.selectOption(itemId as string);
    await expect(
      page.getByText("جرد زيادة Playwright", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await quantityInput.fill("-1");
    await reasonInput.fill("جرد نقص Playwright");
    await saveMovement.click();
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            window.electronAPI
              .getData()
              .then((data) =>
                data.stockMovements.some(
                  (movement) => movement.reason === "جرد نقص Playwright",
                ),
              ),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
    await openInventoryWorkspaceTab("حركة المخزون");
    await expect(
      page.getByText("جرد نقص Playwright", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await screenshot("19-inventory-adjustments-in-out");
  });

  test("does not produce unexpected renderer errors during the smoke suite", async () => {
    expect(unexpectedErrors, unexpectedErrors.join("\n")).toEqual([]);
  });
});
