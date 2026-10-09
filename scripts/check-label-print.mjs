// Optional LABEL_CHROMIUM_PATH selects an installed
// Chromium; otherwise run `npx playwright install chromium` once.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = process.env.LABEL_QA_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server?.listen();
const origin = process.env.LABEL_QA_URL || `http://127.0.0.1:${server.httpServer.address().port}`;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LABEL_CHROMIUM_PATH ? { executablePath: process.env.LABEL_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => { sessionStorage.setItem('inv_auth_active', 'true'); localStorage.setItem('inv_lang', 'RU'); });
  await page.route('**/api/**', route => route.fulfill({ status: 404, body: '{}' }));
  await page.route('https://ntfy.sh/**', route => route.abort());
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { Store } = await import('/src/storage/store.ts');
    const { CalibrationModal } = await import('/src/ui/components/Modals/CalibrationModal.ts');
    const { LabelModal } = await import('/src/ui/components/Modals/LabelModal.ts');
    Store.tools = Array.from({ length: 25 }, (_, i) => ({
      id: `TW-${String(i + 1).padStart(3, '0')}`, name: 'Динамометрическая отвёртка',
      type: 'Permanent', category: 'Hand Tools', status: 'Active', location: 'Crib',
      spec: '0.5–6 Nm ±2%', calIntervalDays: 180, calVerifiedBy: 'Иван Иванов',
    }));
    Store.personnel = [{ id: 'EMP-1', name: 'Иван Иванов', role: 'Operator' }];
    Store.workstations = [];
    Store.notify();
    window.labelQA = { Store, CalibrationModal, LabelModal, jobs: [] };
    const getter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get() {
        const win = getter.get.call(this);
        if (win) win.print = () => {
          window.labelQA.jobs.push({
            html: win.document.documentElement.outerHTML,
            imagesReady: Array.from(win.document.images).every(img => img.complete && img.naturalWidth > 0),
            cells: Array.from(win.document.querySelectorAll('.sheet-cell'), cell => ({
              x: cell.getBoundingClientRect().x * 25.4 / 96,
              y: (cell.getBoundingClientRect().y - cell.parentElement.getBoundingClientRect().y) * 25.4 / 96,
              text: cell.textContent,
            })),
          });
          setTimeout(() => win.dispatchEvent(new win.Event('afterprint')), 0);
        };
        return win;
      },
    });
    CalibrationModal.open('TW-001');
  });
  assert.equal(await page.locator('#calFormat').inputValue(), 'calTagSheet');
  await page.locator('#calCert').fill('CERT-001');
  await page.locator('#calSavePrintBtn').click();
  await page.waitForFunction(() => window.labelQA.jobs.length === 1);
  await page.waitForFunction(() => !document.querySelector('iframe'));

  await page.evaluate(() => window.labelQA.CalibrationModal.openSession());
  assert.equal(await page.locator('#calFormat').inputValue(), 'calTagSheet');
  await page.locator('#calBy').selectOption({ label: 'Иван Иванов' });
  await page.locator('#calSelectAllBtn').click();
  await page.locator('#calSavePrintBtn').click();
  await page.waitForFunction(() => window.labelQA.jobs.length === 2);
  await page.waitForFunction(() => !document.querySelector('iframe'));

  await page.evaluate(() => window.labelQA.LabelModal.openToolLabel('TW-001'));
  await page.locator('#labelStart').fill('20');
  await page.locator('#labelCopiesInput').fill('2');
  await page.locator('#labelOffsetY').fill('-1');
  assert.equal(await page.locator('#labelPreviewContainer .sheet-page').count(), 2);
  await page.locator('#printModalExecuteBtn').click();
  await page.waitForFunction(() => window.labelQA.jobs.length === 3);
  const jobs = await page.evaluate(() => window.labelQA.jobs);
  assert(jobs.every(job => job.imagesReady), 'Every QR must decode before printing');
  assert.deepEqual(jobs.map(job => job.cells.length), [20, 40, 40]);
  assert(Math.abs(jobs[0].cells[0].x - 12 * 25.4 / 72) < 0.02);
  assert(Math.abs(jobs[0].cells[0].y - 12.7) < 0.02);
  assert(Math.abs(jobs[1].cells[19].y - 241.3) < 0.02);
  assert(Math.abs(jobs[2].cells[19].y - 240.3) < 0.02);
  assert(jobs[2].cells.slice(0, 19).every(cell => cell.text === ''));
  assert(jobs[2].cells[19].text.includes('TW-001'));
  assert(jobs[2].cells[20].text.includes('TW-001'));
  await mkdir('tmp/pdfs', { recursive: true });
  const names = ['single', 'session', 'offset'];
  for (let i = 0; i < jobs.length; i++) {
    const printPage = await context.newPage();
    await printPage.setContent(jobs[i].html);
    await printPage.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, img => img.decode())); });
    await printPage.pdf({ path: `tmp/pdfs/${names[i]}.pdf`, preferCSSPageSize: true, printBackground: true });
    await printPage.close();
  }
  console.log('Browser label QA passed: single, 25-tool session, start cell 20 + copies + −1 mm correction; all QR images ready.');
} finally {
  await browser.close();
  await server?.close();
}
