import { describe, it, expect } from 'vitest';
import { buildLabelSheetHtml, STOCKS } from '../src/labels/labelPrint';

/**
 * The Avery layout is the part that silently regressed during the modular
 * migration: cells were concatenated with no `.sheet-page` container and no
 * absolute positioning, so printed sheets could not line up with the die-cut
 * stock. These tests pin the geometry to the stock definition.
 */

/** Split a sheet string into its per-cell payloads (content after the marker). */
function cellsOf(html: string): string[] {
  return html.split('class="sheet-cell"').slice(1);
}

function pagesOf(html: string): string[] {
  return html.split('class="sheet-page"').slice(1);
}

describe('label sheet layout (Avery die-cut alignment)', () => {
  it('lays avery5161 out as one Letter page with 20 absolutely positioned cells', () => {
    const html = buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }], 'avery5161');
    const stock = STOCKS.avery5161;

    expect(pagesOf(html)).toHaveLength(1);
    expect(cellsOf(html)).toHaveLength(20);

    // Cell 1 sits at the stock origin.
    expect(html).toContain(`left:${stock.left!}mm; top:${stock.top!}mm`);
    // Cell 2 is one column across, so offset by pitchX.
    expect(html).toContain(`left:${stock.left! + stock.pitchX!}mm; top:${stock.top!}mm`);
    // Cell 3 (position 3) starts the second row: 2 columns per row.
    expect(html).toContain(`left:${stock.left!}mm; top:${stock.top! + stock.pitchY!}mm`);

    // Every cell is sized to the die-cut label.
    expect(html).toContain(`width:${stock.w}mm; height:${stock.h}mm`);
  });

  it('leaves the cells before `start` empty so a part-used sheet can be reused', () => {
    const html = buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }], 'avery5161', { start: 3 });
    const cells = cellsOf(html);

    expect(cells).toHaveLength(20);
    expect(cells[0]).not.toContain('TW-001');
    expect(cells[1]).not.toContain('TW-001');
    expect(cells[2]).toContain('TW-001');
    expect(cells[3]).not.toContain('TW-001');
  });

  it('paginates a run longer than one sheet and fills later pages from cell 1', () => {
    const entities = Array.from({ length: 25 }, (_, i) => ({ id: `TW-${i + 1}`, type: 'tool' as const }));
    const html = buildLabelSheetHtml(entities, 'avery5161');

    const pages = pagesOf(html);
    expect(pages).toHaveLength(2);

    // Page 1: 20 cells, all filled. Page 2: 20 cells, 5 filled.
    const page1 = cellsOf(pages[0]);
    const page2 = cellsOf(pages[1]);
    expect(page1).toHaveLength(20);
    expect(page2).toHaveLength(20);
    expect(page1.every(c => c.includes('TW-'))).toBe(true);
    expect(page2.filter(c => c.includes('TW-'))).toHaveLength(5);

    // Page break only between pages.
    expect(pages[0]).toContain('page-break-after:always');
    expect(pages[1]).not.toContain('page-break-after:always');
  });

  it('applies `start` only to the first page', () => {
    const entities = Array.from({ length: 21 }, (_, i) => ({ id: `TW-${i + 1}`, type: 'tool' as const }));
    const pages = pagesOf(buildLabelSheetHtml(entities, 'avery5161', { start: 20 }));

    expect(pages).toHaveLength(2);
    // Page 1 starts at cell 20, so exactly one label fits there.
    expect(cellsOf(pages[0]).filter(c => c.includes('TW-'))).toHaveLength(1);
    // Page 2 is a fresh sheet and takes the remaining 20.
    expect(cellsOf(pages[1]).filter(c => c.includes('TW-'))).toHaveLength(20);
  });

  it('emits one full-size page per label for roll stock (no sheet grid)', () => {
    const entities = Array.from({ length: 3 }, (_, i) => ({ id: `TW-${i + 1}`, type: 'tool' as const }));
    const html = buildLabelSheetHtml(entities, 'brady');

    expect(pagesOf(html)).toHaveLength(0);
    const cells = cellsOf(html);
    expect(cells).toHaveLength(3);
    expect(html).toContain(`width:${STOCKS.brady.w}mm; height:${STOCKS.brady.h}mm`);
    // Each roll label starts a new page — except the last, which would otherwise
    // print a trailing blank page.
    expect(cells[0]).toContain('page-break-after:always');
    expect(cells[1]).toContain('page-break-after:always');
    expect(cells[2]).not.toContain('page-break-after:always');
  });

  it('renders location labels, which are queued as LOC: ids', () => {
    const html = buildLabelSheetHtml([{ id: 'LOC:rack:A:Rack A:Shelf 2:Bin 3', type: 'location' }], 'avery5161');
    expect(cellsOf(html)).toHaveLength(20);
    expect(html).toContain('LOCATION / STORAGE BIN');
    // The LOC prefix and the leading type token are stripped for the caption.
    expect(html).toContain('A | Rack A | Shelf 2 | Bin 3');
  });

  it('does not add a page break after the last single-stock label (no trailing blank page)', () => {
    const html = buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }, { id: 'TW-002', type: 'tool' }], 'calTag');
    const cells = cellsOf(html);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain('page-break-after:always');
    expect(cells[1]).not.toContain('page-break-after:always');
  });

  it('lays a calibration session out on an Avery 5161 sheet (20/page), in order', () => {
    // A session used to print one tag per page (single-stock calTag); the sheet
    // stock puts them in order, 20 per page.
    const entities = Array.from({ length: 25 }, (_, i) => ({ id: `TW-${i + 1}`, type: 'tool' as const }));
    const pages = pagesOf(buildLabelSheetHtml(entities, 'calTagSheet'));

    expect(pages).toHaveLength(2);
    expect(cellsOf(pages[0])).toHaveLength(20);
    expect(cellsOf(pages[0]).every(c => c.includes('CALIBRATION / VERIFICATION'))).toBe(true);
    expect(cellsOf(pages[1]).filter(c => c.includes('CALIBRATION / VERIFICATION'))).toHaveLength(5);
  });

  it('uses the compact one-line tag when the sheet cell is only 25.4mm tall', () => {
    const sheet = cellsOf(buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }], 'calTagSheet'))[0];
    const roll = cellsOf(buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }], 'calTag'))[0];

    // The compact layout keeps a single "Verified by … · date" line and a 16mm QR;
    // the 70x50 tag keeps the stacked block with a 22mm QR.
    expect(sheet).toContain('width:15mm; height:15mm;');
    expect(roll).toContain('width:21mm; height:21mm;');
    expect(sheet).toContain('CALIBRATION / VERIFICATION');
    expect(roll).toContain('CALIBRATION / VERIFICATION');
  });

  it('anchors roll/single stock at the page origin — never centred on a full sheet', () => {
    // A centred 70x50 tag printed in the middle of a Letter sheet when the printer
    // rejected the custom @page size.
    const html = buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }], 'calTag');
    expect(html).not.toContain('margin:0 auto');
    expect(html).toContain('position:relative');
  });

  it('renders the calibration tag with the verification block', () => {
    const html = buildLabelSheetHtml([{ id: 'TW-001', type: 'tool' }], 'calTag');
    expect(cellsOf(html)).toHaveLength(1);
    expect(html).toContain('CALIBRATION / VERIFICATION');
    expect(html).toContain('Verified by');
    expect(html).toContain('Next due');
    // Sized as a 70x50mm single tag.
    expect(html).toContain('width:70mm; height:50mm');
  });
});