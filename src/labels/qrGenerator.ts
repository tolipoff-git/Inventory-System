import QRCode from 'qrcode';
import { QR_BASE_URL } from '../config/constants';

/**
 * Ownership mark stamped in the middle of every QR code.
 *
 * The QR is rendered at error-correction level **H** (30% recovery) precisely so
 * this plate can sit on top of the modules without breaking the scan: a 26% box
 * covers ~7% of the symbol, far inside the recoverable budget, and it never
 * touches the three finder patterns in the corners.
 */
const QR_MARK_TEXT = 'FSE';

function drawOwnershipMark(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const size = Math.max(8, Math.round(Math.min(w, h) * 0.26));
  const x = Math.round((w - size) / 2);
  const y = Math.round((h - size) / 2);
  const line = Math.max(1, Math.round(size * 0.07));

  // White plate so the modules underneath cannot bleed through the letters.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = line;
  ctx.strokeRect(x + line / 2, y + line / 2, size - line, size - line);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(size * 0.44)}px Arial, Helvetica, sans-serif`;
  ctx.fillText(QR_MARK_TEXT, x + size / 2, y + size / 2 + size * 0.03);
}

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  size: number = 100
): Promise<void> {
  // The `qrcode` renderer sets `canvas.style.width/height` in PIXELS (e.g. 300px),
  // which destroys the mm-based sizing the label layouts rely on: a 19mm QR
  // ballooned to ~79mm and was clipped by the label cell. The monolith used
  // QRious, which only sets the canvas attributes. Capture the intended inline
  // style and restore it after render so the pixel buffer is high-res while the
  // displayed size stays whatever the layout (inline mm / CSS) dictates.
  const prevStyle = canvas.getAttribute('style');
  try {
    await QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    drawOwnershipMark(canvas);
  } catch (err) {
    console.error('Failed to render QR to canvas:', err);
    // Fallback: draw outline
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(2, 2, size - 4, size - 4);
      ctx.fillStyle = '#000000';
      ctx.font = '10px monospace';
      ctx.fillText('QR ERROR', 10, size / 2);
    }
  } finally {
    if (prevStyle === null) canvas.removeAttribute('style');
    else canvas.setAttribute('style', prevStyle);
  }
}

export async function getQrDataUrl(text: string, size: number = 150): Promise<string> {
  try {
    // Render to an offscreen canvas so the ownership mark can be stamped before
    // the PNG is encoded (QRCode.toDataURL gives no chance to post-process).
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    drawOwnershipMark(canvas);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Failed to generate QR DataURL:', err);
    return '';
  }
}

export const generateQrDataUrl = getQrDataUrl;

/**
 * Base URL the QR codes point at. Prefer the origin the app is actually served
 * from so a label printed by a preview/staging/local instance round-trips back
 * to that same instance; the deployed constant is only a fallback for
 * non-browser contexts (tests, exports).
 */
function qrBaseUrl(): string {
  try {
    const origin = typeof window !== 'undefined' ? window.location?.origin : '';
    if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  } catch {
    /* ignore — fall through to the constant */
  }
  return QR_BASE_URL;
}

export function toolDeeplink(toolId: string): string {
  return `${qrBaseUrl()}/?tool=${encodeURIComponent(toolId)}`;
}

export function locationDeeplink(loc: string): string {
  return `${qrBaseUrl()}/?loc=${encodeURIComponent(loc)}`;
}
