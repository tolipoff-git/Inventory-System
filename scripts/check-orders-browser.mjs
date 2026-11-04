import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const output = process.env.ORDER_QA_DIR || await mkdtemp(join(tmpdir(), 'inventory-orders-'));
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.LABEL_CHROMIUM_PATH ? { executablePath: process.env.LABEL_CHROMIUM_PATH } : {}), args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('inv_auth_active', 'true'));
  await page.route('https://ntfy.sh/**', route => route.abort());
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(window.Store));
  await page.evaluate(async () => {
    const { OrderModal } = await import('/src/ui/components/Modals/OrderModal.ts');
    const { setLanguage } = await import('/src/i18n/index.ts');
    setLanguage('RU');
    window.Store.procurementLog = Array.from({ length: 32 }, (_, i) => ({
      orderId: `PO-QA-${i}`, requester: 'Игорь', workstation: 'Сборочный участок', total: 15,
      createdAt: '2026-11-04T12:00:00Z', status: 'Submitted',
      items: [{ id: 'a', name: 'Шуруповёрт - аккумуляторный инструмент', qty: 3, unitCost: 2.5, receivedQty: 1, reason: 'Новый проект' },
              { id: 'b', name: 'Контрольная последняя позиция', qty: 3, unitCost: 2.5, receivedQty: 0 }],
    }));
    OrderModal.openList();
  });

  const checkBounds = async id => {
    const bounds = await page.locator(`#${id} .order-workspace`).boundingBox();
    const viewport = page.viewportSize();
    assert(bounds.width >= viewport.width - 18, `${id} does not fill width`);
    assert(bounds.height >= viewport.height - 18, `${id} does not fill height`);
    assert(bounds.x >= 0 && bounds.y >= 0);
    assert(bounds.x + bounds.width <= viewport.width + 1);
    assert(bounds.y + bounds.height <= viewport.height + 1);
    for (const part of ['.modal-header', '.modal-footer']) {
      const b = await page.locator(`#${id} ${part}`).boundingBox();
      assert(b.y >= 0 && b.y + b.height <= viewport.height + 1, `${id} ${part} is clipped`);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
  };
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await checkBounds('ordersModal');
    await page.locator('[data-order-id="PO-QA-31"] td:nth-child(2)').click();
    await checkBounds('orderDetailModal');
    if (viewport.width === 1440 || viewport.width === 390) await page.screenshot({ path: join(output, `detail-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    assert(await page.locator('#ordersModal').evaluate(el => el.classList.contains('active')));
    await page.locator('#newOrderFromListBtn').click();
    await checkBounds('procureModal');
    await page.locator('#procureCancelBtn').click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-select-row="PO-QA-0"]').check();
  assert.equal(await page.locator('#orderDetailModal.active').count(), 0);
  let downloadEvent = page.waitForEvent('download');
  await page.locator('#ordersListBody [data-export="xlsx"][data-scope="selected"]').click();
  const excel = await downloadEvent;
  await excel.saveAs(join(output, 'selected.xlsx'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile(join(output, 'selected.xlsx')));
  assert.equal(workbook.worksheets[0].rowCount, 4);
  assert.equal(workbook.worksheets[0].getCell('A2').value, 'PO-QA-0');
  assert.equal(workbook.worksheets[0].getCell('I4').value, 15);
  downloadEvent = page.waitForEvent('download');
  await page.locator('#ordersListBody [data-export="pdf"][data-scope="all"]').click();
  await (await downloadEvent).saveAs(join(output, 'all-orders.pdf'));
  // One item taller than a page must not be clipped or loop endlessly.
  const longDownload = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { generateOrdersPdf } = await import('/src/procure/orderExport.ts');
    const { purchaseOrderRows } = await import('/src/procure/orderExportRows.ts');
    const { downloadBuffer } = await import('/src/utils/dom.ts');
    const rows = purchaseOrderRows(window.Store.procurementLog[0]);
    rows[0].name = 'Длинная позиция с кириллицей. '.repeat(500) + ' КОНЕЦ-ДЛИННОЙ-СТРОКИ';
    downloadBuffer('long-row.pdf', generateOrdersPdf(rows), 'application/pdf');
  });
  await (await longDownload).saveAs(join(output, 'long-row.pdf'));
  await page.locator('[data-order-id="PO-QA-0"] td:nth-child(2)').click();
  await page.mouse.click(2, 2);
  assert(await page.locator('#ordersModal').evaluate(el => el.classList.contains('active')), 'Backdrop did not return to list');
  assert.deepEqual(errors, []);
  console.log(`Orders browser QA passed: four viewports, Escape/backdrop return, selection, XLSX totals, Unicode multipage PDF. Output: ${output}`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
