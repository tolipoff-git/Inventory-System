// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/storage/store';
import { Tool } from '../src/types/inventory';
import { CalibrationModal } from '../src/ui/components/Modals/CalibrationModal';
import { LabelModal } from '../src/ui/components/Modals/LabelModal';
import { printLabelsHtml } from '../src/labels/labelPrint';
import { recordCalibration } from '../src/operations/toolOps';
import { bindLabelLayoutControls, labelLayoutControlsHtml, readLabelLayoutControls } from '../src/ui/components/labelLayoutControls';

vi.mock('../src/labels/labelPrint', async importOriginal => ({
  ...await importOriginal<typeof import('../src/labels/labelPrint')>(),
  drawAllQrsInContainer: vi.fn().mockResolvedValue(undefined),
  printLabelsHtml: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/operations/toolOps', async importOriginal => ({
  ...await importOriginal<typeof import('../src/operations/toolOps')>(),
  recordCalibration: vi.fn().mockResolvedValue(true),
  recordCalibrationBatch: vi.fn().mockImplementation(async (ids: string[]) => ids),
}));

const tool = (id: string, extra: Partial<Tool> = {}): Tool => ({ id, name: 'Torque screwdriver', type: 'Permanent', category: 'Hand Tools', status: 'Active', location: 'Crib', ...extra });
const input = (id: string, value: string) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  Store.tools = [tool('TW-1', { calVerifiedAt: '2026-01-01', calVerifiedBy: 'Ivanov' }), tool('HT-1'), tool('CUSTOM-1', { calIntervalDays: 90 })];
  Store.personnel = [{ id: 'EMP-1', name: 'Ivanov', role: 'Operator' }];
  Store.workstations = [];
  Store.notify();
});

describe('label interactions', () => {
  it('defaults both calibration entry points to Avery 5961 and filters the session', () => {
    CalibrationModal.open('TW-1');
    expect((document.getElementById('calFormat') as HTMLSelectElement).value).toBe('calTagSheet');
    expect(document.querySelectorAll('#calLabelPreview .sheet-cell')).toHaveLength(20);
    CalibrationModal.openSession();
    expect((document.getElementById('calFormat') as HTMLSelectElement).value).toBe('calTagSheet');
    expect(Array.from(document.querySelectorAll<HTMLInputElement>('.cal-session-cb'), cb => cb.value)).toEqual(['CUSTOM-1', 'TW-1']);
  });

  it('updates tool preview for copies and start position and prints identical options', async () => {
    await LabelModal.openToolLabel('TW-1');
    expect((document.getElementById('labelFormatSelect') as HTMLSelectElement).value).toBe('calTagSheet');
    input('labelStart', '20');
    input('labelCopiesInput', '2');
    input('labelOffsetY', '-1');
    expect(document.querySelectorAll('#labelPreviewContainer .sheet-page')).toHaveLength(2);
    expect(document.querySelector('#labelPreviewContainer .sheet-cell')!.innerHTML).toBe('');
    expect(document.querySelectorAll('#labelPreviewContainer .sheet-cell')[19].innerHTML).toContain('TW-1');
    document.getElementById('printModalExecuteBtn')!.click();
    await vi.waitFor(() => expect(printLabelsHtml).toHaveBeenCalledWith(expect.any(Array), 'calTagSheet', { start: 20, offsetX: 0, offsetY: -1 }));
    expect(vi.mocked(printLabelsHtml).mock.calls[0][0]).toHaveLength(2);
  });

  it('moves pending calibration data into preview without mutating inventory', () => {
    CalibrationModal.open('TW-1');
    input('calCert', 'NEW-CERT');
    input('calDate', '2026-02-01');
    expect(document.getElementById('calLabelPreview')!.textContent).toContain('NEW-CERT');
    expect(document.getElementById('calLabelPreview')!.textContent).toContain('2/1/2026');
    expect(Store.tools[0].calCertNo).toBeUndefined();
    expect(Store.tools[0].calVerifiedAt).toBe('2026-01-01');
  });

  it('retries failed printing without recording calibration twice', async () => {
    vi.mocked(printLabelsHtml).mockRejectedValueOnce(new Error('printer not ready'));
    CalibrationModal.open('TW-1');
    document.getElementById('calSavePrintBtn')!.click();
    await vi.waitFor(() => expect(document.getElementById('calSaveBtn')).toHaveProperty('disabled', true));
    await vi.waitFor(() => expect(document.getElementById('calSavePrintBtn')).toHaveProperty('disabled', false));
    document.getElementById('calSavePrintBtn')!.click();
    await vi.waitFor(() => expect(printLabelsHtml).toHaveBeenCalledTimes(2));
    expect(recordCalibration).toHaveBeenCalledTimes(1);
  });

  it('shares printer correction between ordinary and calibration Avery sheets', () => {
    document.body.innerHTML = labelLayoutControlsHtml('first') + labelLayoutControlsHtml('second');
    bindLabelLayoutControls(document, 'first', () => 'avery5161', () => {});
    input('firstOffsetX', '0.7');
    input('firstOffsetY', '-1.2');
    bindLabelLayoutControls(document, 'second', () => 'calTagSheet', () => {});
    expect(readLabelLayoutControls(document, 'second', 'calTagSheet')).toEqual({ start: 1, offsetX: 0.7, offsetY: -1.2 });
    expect(document.getElementById('secondStart')).toHaveProperty('max', '20');
  });
});
