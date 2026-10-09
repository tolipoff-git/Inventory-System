import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';

describe('Excel export dependency compatibility', () => {
  it('writes and reads XLSX with extended conditional formatting after the uuid security update', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory');
    sheet.addRow(['Tool', 'Wear']);
    sheet.addRow(['TW-001', 15]);
    sheet.addConditionalFormatting({ ref: 'B2:B2', rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }] }] });
    const data = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(data);
    expect(loaded.getWorksheet('Inventory')!.getCell('A2').value).toBe('TW-001');
    expect(loaded.getWorksheet('Inventory')!.getCell('B2').value).toBe(15);
  });
});
