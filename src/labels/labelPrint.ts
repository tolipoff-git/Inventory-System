import { Store } from '../storage/store';
import { T } from '../i18n';
import { esc, fmtDate, nowISO } from '../utils/formatters';
import { renderQrToCanvas, toolDeeplink, locationDeeplink } from './qrGenerator';
import { Tool } from '../types/inventory';

export interface StockDefinition {
  brand: string;
  pn: string;
  kind: 'sheet' | 'roll' | 'single';
  w: number;
  h: number;
  cols?: number;
  rows?: number;
  top?: number;
  left?: number;
  pitchX?: number;
  pitchY?: number;
  info: string;
  legacy?: string;
}

export const STOCKS: Record<string, StockDefinition> = {
  avery5163: {
    brand: 'Avery', pn: '5163', kind: 'sheet', w: 101.6, h: 50.8, cols: 2, rows: 5, top: 12.7, left: 4.8, pitchX: 106.4, pitchY: 50.8,
    info: '2″×4″ · 10/sheet — zones, racks, cabinets, big tool labels',
  },
  avery5161: {
    brand: 'Avery', pn: '5161 / 5961', kind: 'sheet', w: 101.6, h: 25.4, cols: 2, rows: 10, top: 12.7, left: 4.8, pitchX: 106.4, pitchY: 25.4,
    info: '1″×4″ · 20/sheet — shelves, bins, tool labels',
  },
  avery5366: {
    brand: 'Avery', pn: '5366', kind: 'sheet', w: 87.3, h: 16.9, cols: 2, rows: 15, top: 13.5, left: 9.5, pitchX: 97.0, pitchY: 16.9,
    info: '2/3″×3-7/16″ · 30/sheet — drawers, narrow bins',
  },
  brady119: {
    brand: 'Brady', pn: 'THT-119-427-2.5', kind: 'roll', w: 38.1, h: 12.7,
    info: 'Printable 38.1×12.7mm — tools: Code 39 + ID',
  },
  brady29: {
    brand: 'Brady', pn: 'THT-29-423-10', kind: 'roll', w: 31.75, h: 9.53,
    info: '31.75×9.53mm polyester — small tools: Code 39 + ID',
  },
  brady61: {
    brand: 'Brady', pn: 'THT-61-427-5', kind: 'roll', w: 12.7, h: 12.7,
    info: 'Printable 12.7×12.7mm self-lam wrap — ID text only',
  },
  brady56: {
    brand: 'Brady', pn: 'THT-56-427-10', kind: 'roll', w: 19.05, h: 9.53,
    info: 'Printable 19.05×9.53mm self-lam wrap — ID text only',
  },
  genA: {
    brand: 'Generic', pn: 'Type A (70×36mm)', kind: 'single', legacy: 'A', w: 70, h: 36, info: 'Tool item sticker',
  },
  genB: {
    brand: 'Generic', pn: 'Type B (100×50mm)', kind: 'single', legacy: 'B', w: 100, h: 50, info: 'A-Frame / cabinet sticker',
  },
  genC: {
    brand: 'Generic', pn: 'Type C (100×50mm)', kind: 'single', legacy: 'C', w: 100, h: 50, info: 'Shelf & bin label',
  },
  calTag: {
    brand: 'Generic', pn: 'Calibration Tag (70×50mm)', kind: 'single', w: 70, h: 50,
    info: 'Verification tag — who, when, next due + QR',
  },
  calTagSheet: {
    brand: 'Generic', pn: 'Calibration Tag Sheet (Avery 5161)', kind: 'sheet',
    w: 101.6, h: 25.4, cols: 2, rows: 10, top: 12.7, left: 4.8, pitchX: 106.4, pitchY: 25.4,
    info: '20 verification tags per sheet — calibration sessions',
  },
  brady: {
    brand: 'Brady', pn: 'THT-119-427-2.5', kind: 'roll', w: 38.1, h: 12.7,
    info: 'Printable 38.1×12.7mm — tools: Code 39 + ID',
  },
  genericA: {
    brand: 'Generic', pn: 'Type A (70×36mm)', kind: 'single', legacy: 'A', w: 70, h: 36, info: 'Tool item sticker',
  },
  genericB: {
    brand: 'Generic', pn: 'Type B (100×50mm)', kind: 'single', legacy: 'B', w: 100, h: 50, info: 'A-Frame / cabinet sticker',
  },
  genericC: {
    brand: 'Generic', pn: 'Type C (100×50mm)', kind: 'single', legacy: 'C', w: 100, h: 50, info: 'Shelf & bin label',
  },
};

/**
 * Prefix a storage-address component with its full word, unless it already
 * carries it. Stored values may be `Rack A`/`Shelf 2`/`Bin 3` (current form) or
 * bare `A`/`2`/`3` (legacy monolith rows) — labels must always read in full,
 * never as an abbreviation.
 */
function addrPart(value: string | undefined, word: string): string {
  const s = (value || '').trim();
  if (!s) return '';
  return new RegExp(`^${word}\\b`, 'i').test(s) ? s : `${word} ${s}`;
}

export function addrLine(tool: Tool): string {
  const a = tool.address;
  if (a && (a.rack || a.shelf || a.bin)) {
    return [
      addrPart(a.rack, 'Rack'),
      addrPart(a.shelf, 'Shelf'),
      addrPart(a.bin, 'Bin'),
    ].filter(Boolean).join(' | ');
  }
  return tool.location || '—';
}

export function renderLabelCell(stockKey: string, entityId: string, entityType: 'tool' | 'location'): string {
  const short = (s: string, n: number) => esc((s || '').length > n ? s.slice(0, n) + '…' : (s || ''));

  if (entityType === 'tool') {
    const tool = Store.getTool(entityId) || { id: entityId, name: 'Unknown', status: 'Active', category: 'General' } as Tool;
    const qrUrl = toolDeeplink(tool.id);

    switch (stockKey) {
      case 'genA':
      case 'genericA':
        return `
          <div class="label-details" style="padding:4px; font-size:10px;">
            <div style="font-weight:bold;">${short(tool.name, 35)} | ${esc(tool.id)}</div>
            <div style="font-size:9px; font-weight:bold; color:#444;">${esc(addrLine(tool))}</div>
          </div>
          <div class="label-qr" style="width:28mm; height:28mm; display:flex; align-items:center; justify-content:center;">
            <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:24mm; height:24mm;"></canvas>
          </div>`;
      case 'genB':
      case 'genericB':
        return `
          <div style="display:flex; width:100%; height:100%; gap:8px; padding:4px;">
            <div style="flex:1; border:2px dashed #000; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:2mm;">
              <strong style="font-size:13px; margin-bottom:4px;">TOOL OUTLINE</strong>
              <span style="font-size:10px;">${esc(tool.name)}</span>
              <span style="font-size:9px; font-weight:bold; margin-top:2px;">[${esc(tool.id)}]</span>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; font-size:9px;">
              <div>
                <strong style="font-size:11px;">SHADOW BOARD A-FRAME</strong>
                <div style="margin-top:2px;">Prefix: <strong>${esc(tool.id.split('-')[0] || '*')}</strong></div>
                <div>Location: <strong>${esc(addrLine(tool))}</strong></div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div style="font-size:8px;">Check-in / Out →</div>
                <div class="label-qr" style="width:18mm; height:18mm;">
                  <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:18mm; height:18mm;"></canvas>
                </div>
              </div>
            </div>
          </div>`;
      case 'genC':
      case 'genericC':
        return `
          <div style="display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; padding:3mm 5mm; box-sizing:border-box;">
            <div style="flex:1; overflow:hidden; font-family:sans-serif; line-height:1.3;">
              <div style="font-size:13px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(tool.name)}</div>
              <div style="font-size:12px; font-family:monospace; font-weight:900; margin:2px 0;">${esc(tool.id)}</div>
              <div style="font-size:10px; color:#444;">${esc(addrLine(tool))}</div>
            </div>
            <div style="width:24mm; height:24mm; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
              <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:22mm; height:22mm;"></canvas>
            </div>
          </div>`;
      case 'brady':
      case 'brady119':
        return `
          <div style="display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; padding:1mm 2mm; box-sizing:border-box;">
            <div style="flex:1; overflow:hidden; font-family:monospace; line-height:1.1;">
              <div style="font-size:10px; font-weight:900;">${esc(tool.id)}</div>
              <div style="font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(tool.name)}</div>
            </div>
            <div style="width:11mm; height:11mm; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
              <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:10mm; height:10mm;"></canvas>
            </div>
          </div>`;
      case 'calTag':
      case 'calTagSheet': {
        // Flat fields first; fall back to the newest structured record so a tag
        // never prints an empty "who verified" line.
        const latest = Array.isArray(tool.calHistory) && tool.calHistory.length
          ? tool.calHistory[tool.calHistory.length - 1]
          : undefined;
        const verifiedBy = tool.calVerifiedBy || latest?.by || '—';
        const verifiedAtRaw = tool.calVerifiedAt || latest?.date || '';
        const verifiedAt = verifiedAtRaw ? fmtDate(verifiedAtRaw) : '—';
        const nextDue = tool.calDue ? fmtDate(tool.calDue) : '—';
        const overdue = Boolean(tool.calDue && tool.calDue < nowISO().split('T')[0]);

        // A die-cut sheet cell is only 25.4 mm tall (Avery 5161, 20/sheet), so the
        // comfortable stacked block does not fit there — switch to a one-line
        // compact tag sized to the cell instead of overflowing it.
        const compact = (STOCKS[stockKey]?.h ?? 50) < 40;
        if (compact) {
          return `
          <div style="display:flex; width:100%; height:100%; align-items:center; gap:2.5mm; padding:1.5mm 3mm; box-sizing:border-box; font-family:sans-serif; color:#000;">
            <div style="flex:1; overflow:hidden; line-height:1.3;">
              <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:1px solid #000; padding-bottom:0.5mm;">
                <strong style="font-size:8px; letter-spacing:0.3px;">${T('CALIBRATION / VERIFICATION')}</strong>
                <span style="font-size:8px; font-family:monospace; font-weight:900;">${esc(tool.id)}</span>
              </div>
              <div style="font-size:9px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:0.6mm;">${esc(tool.name)}</div>
              <div style="font-size:8px;">${T('Verified by')}: <strong>${esc(verifiedBy)}</strong> · <strong>${esc(verifiedAt)}</strong></div>
              <div style="font-size:8px; color:${overdue ? '#b00020' : '#000'};">${T('Next due')}: <strong>${esc(nextDue)}</strong>${tool.calCertNo ? ` · ${T('Certificate')}: <strong>${esc(tool.calCertNo)}</strong>` : ''}</div>
            </div>
            <div style="width:16mm; height:16mm; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
              <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:15mm; height:15mm;"></canvas>
            </div>
          </div>`;
        }

        return `
          <div style="display:flex; flex-direction:column; width:100%; height:100%; padding:3mm; box-sizing:border-box; font-family:sans-serif; color:#000;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #000; padding-bottom:1mm;">
              <strong style="font-size:10px; letter-spacing:0.4px;">${T('CALIBRATION / VERIFICATION')}</strong>
              <span style="font-size:9px; font-family:monospace; font-weight:900;">${esc(tool.id)}</span>
            </div>
            <div style="display:flex; gap:3mm; flex:1; padding-top:2mm;">
              <div style="flex:1; font-size:9px; line-height:1.55; overflow:hidden;">
                <div style="font-size:10px; font-weight:700; margin-bottom:1mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(tool.name)}</div>
                <div>${T('Verified by')}: <strong>${esc(verifiedBy)}</strong></div>
                <div>${T('Verified on')}: <strong>${esc(verifiedAt)}</strong></div>
                <div style="color:${overdue ? '#b00020' : '#000'};">${T('Next due')}: <strong>${esc(nextDue)}</strong></div>
                ${tool.calCertNo ? `<div>${T('Certificate')}: <strong>${esc(tool.calCertNo)}</strong></div>` : ''}
              </div>
              <div style="width:22mm; height:22mm; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:21mm; height:21mm;"></canvas>
              </div>
            </div>
          </div>`;
      }
      case 'avery5161':
      case 'avery5163':
      case 'avery5366':
      default:
        return `
          <div style="display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; padding:2mm 4mm; box-sizing:border-box;">
            <div style="flex:1; overflow:hidden; font-family:sans-serif; line-height:1.2;">
              <div style="font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(tool.name)}</div>
              <div style="font-size:12px; font-family:monospace; font-weight:900; margin:2px 0;">${esc(tool.id)}</div>
              <div style="font-size:9px; color:#333;">Loc: ${esc(addrLine(tool))}</div>
            </div>
            <div style="width:20mm; height:20mm; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
              <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:19mm; height:19mm;"></canvas>
            </div>
          </div>`;
    }
  } else {
    // Location Label
    const qrUrl = locationDeeplink(entityId);
    // `LOC:TYPE:Zone:Rack:Shelf:Bin:RESP` — the type token is dropped, and the
    // positional rack/shelf/bin parts are spelled out in full.
    const parts = entityId.replace(/^LOC:[^:]*:/, '').split(':').filter(Boolean);
    const labelTitle = [
      parts[0],
      addrPart(parts[1], 'Rack'),
      addrPart(parts[2], 'Shelf'),
      addrPart(parts[3], 'Bin'),
    ].filter(Boolean).join(' | ') || entityId;

    return `
      <div style="display:flex; width:100%; height:100%; align-items:center; justify-content:space-between; padding:2mm 4mm; box-sizing:border-box;">
        <div style="flex:1; overflow:hidden; font-family:sans-serif;">
          <div style="font-size:9px; font-weight:bold; color:#555; text-transform:uppercase;">LOCATION / STORAGE BIN</div>
          <div style="font-size:13px; font-weight:800; margin:2px 0; color:#000;">${esc(labelTitle)}</div>
        </div>
        <div style="width:22mm; height:22mm; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          <canvas class="lbl-qr" data-qr-text="${esc(qrUrl)}" style="width:20mm; height:20mm;"></canvas>
        </div>
      </div>`;
  }
}

export async function drawAllQrsInContainer(container: HTMLElement): Promise<void> {
  const canvases = container.querySelectorAll<HTMLCanvasElement>('canvas.lbl-qr');
  for (const cv of Array.from(canvases)) {
    const text = cv.dataset.qrText;
    if (text) {
      // Pixel buffer only — the displayed size comes from the inline mm style /
      // CSS, which `renderQrToCanvas` restores after rendering (see there).
      await renderQrToCanvas(cv, text, 300);
    }
  }
}

export function printLabelViaIframe(container: HTMLElement, stockKey: string = 'avery5161'): void {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.style.transform = '';
  clone.style.zoom = '';

  const srcCanvases = container.querySelectorAll('canvas');
  const dstCanvases = clone.querySelectorAll('canvas');
  srcCanvases.forEach((canvas, i) => {
    if (dstCanvases[i]) {
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.style.cssText = canvas.style.cssText;
      img.width = canvas.width;
      img.height = canvas.height;
      dstCanvases[i].parentNode?.replaceChild(img, dstCanvases[i]);
    }
  });

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML).join('');

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const stock = STOCKS[stockKey] || { kind: 'sheet', w: 101.6, h: 25.4 };
  const pageCss = stock.kind === 'sheet'
    ? '@page { size: letter; margin: 0; }'
    : `@page { size: ${stock.w}mm ${stock.h}mm; margin: 0; }`;

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Print Labels</title>
      ${styles}
      <style>
        ${pageCss}
        /* Neutralise the app shell so the printed label is on plain white: the
           tron theme paints a fixed SVG line grid on body::before and a radial
           gradient on body, which otherwise bled onto the label. */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          min-height: auto !important;
          overflow: visible !important;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        html::before, html::after, body::before, body::after {
          content: none !important;
          display: none !important;
          background: none !important;
        }
        /* Critical sheet geometry, inlined so the die-cut alignment never
           depends on the external stylesheet resolving inside the iframe. */
        .sheet-mode { display: block !important; }
        .sheet-page {
          position: relative !important;
          width: 215.9mm !important;
          height: 279.4mm !important;
          background: #ffffff !important;
          margin: 0 auto !important;
          overflow: hidden !important;
        }
        .sheet-cell { outline: none !important; border: none !important; }
        .sheet-page > .sheet-cell { position: absolute !important; }
        /* Single / roll stock: anchor the label to the page origin instead of
           centring it, so a tag never prints in the middle of a full sheet when
           the printer falls back to its default paper size. */
        .sheet-mode > .sheet-cell { margin: 0 !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet-mode, .sheet-mode * { color: #000000 !important; }
      </style>
    </head>
    <body>
      ${clone.outerHTML}
    </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  }, 400);
}

export type LabelFormat = 'avery5161' | 'avery5163' | 'avery5366' | 'brady' | 'genericA' | 'genericB' | 'genericC' | 'calTag' | 'calTagSheet';

/** A queued label target: either a tool id or a `LOC:` storage-location id. */
export interface LabelEntity {
  id: string;
  type: 'tool' | 'location';
}

import { toast } from '../utils/dom';

export async function printQueueLabels(format?: LabelFormat, opts: LabelLayoutOptions = {}): Promise<void> {
  const queueIds = Store.labelQueue || [];
  if (queueIds.length === 0) {
    toast(T('LABEL_QUEUE_EMPTY'), 'info');
    return;
  }

  const entities = queueLabelEntities();

  if (entities.length === 0) {
    toast(T('LABEL_QUEUE_NO_MATCH'), 'warning');
    return;
  }

  await printLabelsHtml(entities, format || 'avery5161', opts);
  toast(`${T('LABELS_PRINTED')} ${entities.length}`, 'success');
}

/**
 * Resolve the label queue to printable targets. Location labels are queued as
 * `LOC:…` ids and have no Tool record, so they must not be resolved through
 * `Store.getTool` (which silently dropped them). Shared by the queue preview and
 * the queue print so both always show exactly the same run.
 */
export function queueLabelEntities(): LabelEntity[] {
  const entities: LabelEntity[] = [];
  for (const id of Store.labelQueue || []) {
    if (id.startsWith('LOC:')) {
      entities.push({ id, type: 'location' });
    } else if (Store.getTool(id)) {
      entities.push({ id, type: 'tool' });
    }
  }
  return entities;
}

export interface LabelLayoutOptions {
  /**
   * 1-based cell on the FIRST sheet where printing starts (sheet stock only).
   * Lets a partially used Avery sheet be fed back through the printer without
   * wasting the already-consumed labels.
   */
  start?: number;
}

/**
 * Compose the printable label sheet.
 *
 * Sheet stock (Avery) is laid out as one or more Letter pages with each label
 * absolutely positioned from the stock definition (`left/top/pitchX/pitchY`),
 * so the output lines up with the die-cut cells. Roll/single stock emits one
 * label per page sized to the stock.
 */
/**
 * Pure layout builder for a label run (no DOM access, so it is unit-testable).
 *
 * Sheet stock (Avery) becomes one or more Letter pages with each label
 * absolutely positioned from the stock definition (`left/top/pitchX/pitchY`),
 * so the output lines up with the die-cut cells. Roll/single stock emits one
 * label per page sized to the stock.
 */
export function buildLabelSheetHtml(
  entities: LabelEntity[],
  format: LabelFormat = 'avery5161',
  opts: LabelLayoutOptions = {}
): string {
  const stock = STOCKS[format] || STOCKS.avery5161;

  if (stock.kind === 'sheet' && stock.cols && stock.rows) {
    const perSheet = stock.cols * stock.rows;
    const start = Math.max(1, Math.min(perSheet, opts.start || 1));

    let idx = 0;
    const pages: string[] = [];
    while (idx < entities.length) {
      let cells = '';
      for (let pos = 1; pos <= perSheet; pos++) {
        const col = (pos - 1) % stock.cols;
        const row = Math.floor((pos - 1) / stock.cols);
        const style = `position:absolute; left:${stock.left! + col * stock.pitchX!}mm; top:${stock.top! + row * stock.pitchY!}mm; width:${stock.w}mm; height:${stock.h}mm; overflow:hidden;`;
        // Only the first page honours `start`; later pages fill from cell 1.
        const printable = pages.length > 0 || pos >= start;
        let inner = '';
        if (printable && idx < entities.length) {
          const e = entities[idx++];
          inner = renderLabelCell(format, e.id, e.type);
        }
        cells += `<div class="sheet-cell" style="${style}">${inner}</div>`;
      }
      pages.push(cells);
    }

    return pages.map((p, i) =>
      `<div class="sheet-page"${i < pages.length - 1 ? ' style="page-break-after:always;"' : ''}>${p}</div>`
    ).join('');
  }

  // Roll / single stock: one label per page, anchored at the page origin (not
  // centred) so a tag never lands in the middle of a full sheet when the printer
  // falls back to its default paper size.
  return entities.map((e, i) =>
    `<div class="sheet-cell" style="position:relative; width:${stock.w}mm; height:${stock.h}mm; overflow:hidden;${i < entities.length - 1 ? ' page-break-after:always;' : ''}">${renderLabelCell(format, e.id, e.type)}</div>`
  ).join('');
}

export async function printLabelsHtml(
  entities: LabelEntity[],
  format: LabelFormat = 'avery5161',
  opts: LabelLayoutOptions = {}
): Promise<void> {
  const stock = STOCKS[format] || STOCKS.avery5161;
  const container = document.createElement('div');
  container.className = 'sheet-mode';
  container.innerHTML = buildLabelSheetHtml(entities, format, opts);
  container.style.zoom = stock.kind === 'sheet' ? '0.55' : (stock.w < 40 ? '2.5' : '1');

  document.body.appendChild(container);
  await drawAllQrsInContainer(container);
  printLabelViaIframe(container, format);
  container.remove();
}
