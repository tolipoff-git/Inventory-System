import { jsPDF } from 'jspdf';
import { T } from '../i18n';
import { downloadBuffer } from '../utils/dom';
import { PROCUREMENT_PDF_FONT } from '../procure/fonts/dejavuSans';

export interface CertificatePdfRow { id: string; name: string; score: number }
export interface CertificatePdfOptions {
  title: string; subtitle: string; station: string; post: string; date: string;
  auditor: string; compliance: string; rows: CertificatePdfRow[]; notes: string;
}

/** Unicode text and page-aware wrapping for every field; notes are never truncated. */
export function generateCertificatePdf(opts: CertificatePdfOptions): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Certificate.ttf', PROCUREMENT_PDF_FONT);
  doc.addFont('Certificate.ttf', 'Certificate', 'normal');
  doc.setFont('Certificate');
  const margin = 18;
  const width = 174;
  const bottom = 272;
  let y = 22;
  const ensure = (height: number) => {
    if (y + height > bottom) { doc.addPage(); y = 22; }
  };
  const text = (value: string, size = 10, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(value, width) as string[];
    const lineHeight = size * 0.46;
    for (const line of lines) { ensure(lineHeight); doc.text(line, margin, y); y += lineHeight; }
    y += 2;
  };
  text(opts.title, 17, [15, 50, 70]);
  text(opts.subtitle, 10, [100, 116, 139]);
  y += 3;
  text(`${T('Workstation:')} ${opts.station}`);
  if (opts.post) text(`${T('Workpost:')} ${opts.post}`);
  text(`${T('Date')}: ${opts.date}`);
  text(`${T('Auditor')}: ${opts.auditor}`);
  text(`${T('Compliance Score')}: ${opts.compliance}`, 12, [2, 132, 199]);
  y += 4;
  text(`${T('Pillar')} / ${T('Score')}`, 12);
  for (const row of opts.rows) {
    ensure(8);
    doc.setDrawColor(200, 210, 220);
    doc.line(margin, y - 1, margin + width, y - 1);
    y += 4;
    text(`${row.id} - ${row.name}: ${row.score} / 5`, 11);
  }
  if (opts.notes) {
    y += 4;
    text(T('Auditor Observations'), 12);
    text(opts.notes);
  }
  y += 7;
  ensure(20);
  text(`${T('Inspector')}: ______________________`);
  text(`${T('Area Owner')}: _____________________`);
  y += 5;
  text(T('CERT_TRACE').replace('{date}', opts.date).replace('{ws}', opts.station), 8, [100, 116, 139]);
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`5S Tool Command Center | ${page} / ${doc.getNumberOfPages()}`, 192, 286, { align: 'right' });
  }
  return doc.output('arraybuffer');
}

export function exportCertificatePdf(opts: CertificatePdfOptions): void {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `5S_Audit_Certificate_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
  downloadBuffer(name, generateCertificatePdf(opts), 'application/pdf');
}
