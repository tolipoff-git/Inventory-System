// ============================================================================
// 5S Audit Certificate PDF export (jsPDF direct layout, no HTML parsing).
// Builds the same fixed-form certificate (title, meta, pillar table, notes,
// signatures) programmatically — reliable client-side A4 download.
// ============================================================================

import { jsPDF } from 'jspdf';
import { getLanguage, T } from '../i18n';
import { downloadBuffer } from '../utils/dom';
import { S5_RUBRICS } from '../config/constants';
import { esc } from '../utils/formatters';

export interface CertificatePdfRow {
  id: string;
  name: string;
  score: number;
}

/** Label helper — escapes values embedded in PDF text. */
const certLabel = (label: string, value: string): string => `${esc(label)} ${esc(value)}`;

export function exportCertificatePdf(opts: { title: string; subtitle: string; station: string; post: string; date: string; auditor: string; compliance: string; rows: CertificatePdfRow[]; notes: string }): void {
  const ru = getLanguage() === 'RU';
  const A4_W = 210;
  const A4_H = 297;
  const M = 18; // page margin (mm)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = A4_W - M * 2;

  const cAccent: [number, number, number] = ru ? [42, 155, 135] : [0, 210, 255];
  const cDark: [number, number, number] = [10, 15, 29];
  const cMuted: [number, number, number] = [100, 116, 139];
  const cGreen: [number, number, number] = [22, 163, 74];
  const cAmber: [number, number, number] = [217, 119, 6];
  const cRed: [number, number, number] = [220, 38, 38];

  // 1. Header band
  doc.setDrawColor(cAccent[0], cAccent[1], cAccent[2]);
  doc.setLineWidth(0.9);
  doc.line(M, 22.5, A4_W - M, 22.5);
  doc.setFillColor(240, 247, 255);
  doc.roundedRect(M, 26, W, 26, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(cDark[0], cDark[1], cDark[2]);
  doc.text(opts.title, A4_W / 2, 35, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(cMuted[0], cMuted[1], cMuted[2]);
  doc.text(opts.subtitle, A4_W / 2, 41, { align: 'center' });

  // 2. Meta block (Station/Post left, Date/Auditor/Compliance right)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  let rowY = 49;

  const metaLeft = (label: string, value: string, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(certLabel(label, value), M, y);
  };
  const metaRight = (label: string, value: string, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const line = certLabel(label, value);
    const w = doc.getTextWidth(line);
    doc.text(line, A4_W - M - w, y);
  };

  metaLeft(`${T('Workstation:')} `, opts.station, rowY);
  if (opts.post) metaLeft(`${T('Workpost:')} `, opts.post, rowY + 7);
  metaRight(`${T('Date')}: `, opts.date, rowY);
  metaRight(`${T('Auditor')}: `, opts.auditor, rowY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(2, 132, 199);
  doc.text(`${T('Compliance Score')}: ${opts.compliance}`, A4_W - M, rowY + 14, { align: 'right' });

  rowY += 22;

  // 3. Pillar table
  doc.setDrawColor(cDark[0], cDark[1], cDark[2]);
  doc.setLineWidth(0.5);
  doc.setFillColor(15, 23, 42);
  doc.rect(M, rowY, W, 9, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(T('Pillar'), M + 3, rowY + 6);
  doc.text(`${T('Score')} / 5`, A4_W - M - 3, rowY + 6, { align: 'right' });
  rowY += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const r of opts.rows) {
    doc.setDrawColor(221, 221, 221);
    doc.line(M, rowY, A4_W - M, rowY);
    doc.setTextColor(30, 41, 59);
    doc.text(`${r.id} — ${r.name}`, M + 3, rowY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const scoreColor = r.score >= 4 ? cGreen : r.score >= 3 ? cAmber : cRed;
    doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
    doc.text(`${r.score} / 5`, A4_W - M - 3, rowY + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    rowY += 10;
  }
  doc.setDrawColor(221, 221, 221);
  doc.line(M, rowY, A4_W - M, rowY);
  rowY += 8;

  // 4. Auditor observations
  if (opts.notes) {
    const boxH = 20;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(M, rowY, W, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(T('Auditor Observations'), M + 4, rowY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    const lines: string[] = doc.splitTextToSize(opts.notes, W - 16);
    lines.slice(0, 3).forEach((l: string, i: number) => doc.text(l, M + 4, rowY + 14 + i * 4.5));
    rowY += boxH + 4;
  }

  // 5. Signature block
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(M, rowY, M + W / 2 - 4, rowY);
  doc.line(M + W / 2 + 4, rowY, A4_W - M, rowY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(cMuted[0], cMuted[1], cMuted[2]);
  doc.text(`${T('Inspector')}: ______________________`, M, rowY + 6);
  doc.text(`${T('Area Owner')}: _____________________`, M + W / 2 + 4, rowY + 6);

  // 6. Footer audit trail
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(cMuted[0], cMuted[1], cMuted[2]);
  const foot = T('CERT_TRACE').replace('{date}', opts.date).replace('{ws}', opts.station);
  const footLines: string[] = doc.splitTextToSize(foot, A4_W - M * 2);
  footLines.forEach((l: string, i: number) => {
    if (i < 3) doc.text(l, M, A4_H - M + 2 + i * 4);
  });

  const buffer = doc.output('arraybuffer');
  downloadBuffer(datedCertName(), buffer as ArrayBuffer, 'application/pdf');
}

function datedCertName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `5S_Audit_Certificate_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.pdf`;
}

// Aligned table fill source (kept in sync with reportExports/print5sAuditCertificate)
void S5_RUBRICS;