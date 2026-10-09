import { T } from '../../i18n';
import { STOCKS, LabelFormat, LabelLayoutOptions, normalizeLabelLayoutOptions } from '../../labels/labelPrint';

/** Shared controls for tool, queue and calibration printing. Offsets are local
 * printer preferences, never inventory data and never a change to label pitch. */
export function labelLayoutControlsHtml(prefix: string): string {
  return `<div id="${prefix}Layout" style="text-align:left;">
    <div class="form-row">
      <div class="form-group"><label>${T('Start Position:')}</label>
        <input id="${prefix}Start" type="number" class="form-control" min="1" step="1" value="1"></div>
      <div class="form-group"><label>${T('LABEL_OFFSET_X')}</label>
        <input id="${prefix}OffsetX" type="number" class="form-control" min="-3" max="3" step="0.1" value="0"></div>
      <div class="form-group"><label>${T('LABEL_OFFSET_Y')}</label>
        <input id="${prefix}OffsetY" type="number" class="form-control" min="-3" max="3" step="0.1" value="0"></div>
    </div><small>${T('LABEL_ALIGNMENT_HINT')}</small>
  </div><p style="text-align:left; font-size:0.8rem;">${T('LABEL_PRINT_SETTINGS')}</p>`;
}

function prefKey(format: LabelFormat): string {
  return 'inv_label_alignment_' + (format === 'calTagSheet' ? 'avery5161' : format);
}

export function readLabelLayoutControls(root: ParentNode, prefix: string, format: LabelFormat): LabelLayoutOptions {
  const value = (suffix: string) => Number(root.querySelector<HTMLInputElement>(`#${prefix}${suffix}`)?.value);
  return normalizeLabelLayoutOptions(format, { start: value('Start'), offsetX: value('OffsetX'), offsetY: value('OffsetY') });
}

/** Returns a refresh function to call when stock changes. */
export function bindLabelLayoutControls(root: ParentNode, prefix: string, getFormat: () => LabelFormat, onChange: () => void): () => void {
  const input = (suffix: string) => root.querySelector<HTMLInputElement>(`#${prefix}${suffix}`)!;
  const refresh = () => {
    const format = getFormat();
    const stock = STOCKS[format];
    const group = root.querySelector<HTMLElement>(`#${prefix}Layout`)!;
    group.style.display = stock.kind === 'sheet' ? '' : 'none';
    input('Start').max = String((stock.cols || 1) * (stock.rows || 1));
    input('Start').value = String(normalizeLabelLayoutOptions(format, { start: Number(input('Start').value) }).start);
    let saved: LabelLayoutOptions = {};
    try { saved = JSON.parse(localStorage.getItem(prefKey(format)) || '{}'); } catch { /* defaults */ }
    const opts = normalizeLabelLayoutOptions(format, saved || {});
    input('OffsetX').value = String(opts.offsetX);
    input('OffsetY').value = String(opts.offsetY);
    onChange();
  };
  for (const suffix of ['Start', 'OffsetX', 'OffsetY']) {
    input(suffix).addEventListener('input', () => {
      const opts = readLabelLayoutControls(root, prefix, getFormat());
      try { localStorage.setItem(prefKey(getFormat()), JSON.stringify({ offsetX: opts.offsetX, offsetY: opts.offsetY })); } catch { /* printing still works */ }
      onChange();
    });
    input(suffix).addEventListener('change', () => {
      const opts = readLabelLayoutControls(root, prefix, getFormat());
      input(suffix).value = String(suffix === 'Start' ? opts.start : suffix === 'OffsetX' ? opts.offsetX : opts.offsetY);
    });
  }
  refresh();
  return refresh;
}
