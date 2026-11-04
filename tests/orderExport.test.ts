// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { generateOrdersWorkbook, generateOrdersPdf } from '../src/procure/orderExport';
import { purchaseOrderRows } from '../src/procure/orderExportRows';
import { PurchaseOrder } from '../src/types/procurement';

const legacy: PurchaseOrder = { orderId: 'OLD-1', name: 'Шуруповёрт', qty: 2, cost: 3.25, total: 6.5, status: 'received' };

describe('procurement file exports', () => {
  it('exports legacy orders without line arrays and respects explicit zero prices', () => {
    expect(purchaseOrderRows(legacy)[0]).toMatchObject({ name: 'Шуруповёрт', received: 2, amount: 6.5 });
    const rows = purchaseOrderRows({ ...legacy, items: [
      { id: '1', name: 'Free sample', qty: 2, unitCost: 0, unitPrice: 99 },
      { id: '2', name: 'Bit', qty: 3, unitPrice: 1.005 },
    ] }, new Set([1]));
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(3.02);
    expect(purchaseOrderRows({ ...legacy, items: [{ id: '1', name: 'Free', qty: 2, unitCost: 0, unitPrice: 99 }] })[0].amount).toBe(0);
  });

  it('writes more than 15 rows, literal text, numeric prices and a total for only the exported rows', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ ...purchaseOrderRows(legacy)[0], name: i === 0 ? '=HYPERLINK("evil")' : `Деталь ${i}` }));
    const buffer = await generateOrdersWorkbook(rows);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(27);
    expect(sheet.getCell('E2').value).toBe('=HYPERLINK("evil")');
    expect(sheet.getCell('E26').value).toBe('Деталь 24');
    expect(sheet.getCell('H2').value).toBe(3.25);
    expect(sheet.getCell('I27').value).toBe(162.5);
  });

  it('rejects empty exports and produces a multipage Unicode PDF', async () => {
    await expect(generateOrdersWorkbook([])).rejects.toThrow('NO_ITEMS_EXPORT');
    expect(() => generateOrdersPdf([])).toThrow('NO_ITEMS_EXPORT');
    const buffer = generateOrdersPdf(Array.from({ length: 60 }, () => purchaseOrderRows(legacy)[0]));
    const raw = new TextDecoder('latin1').decode(buffer);
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect((raw.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(raw).toContain('/ToUnicode');
  });
});
