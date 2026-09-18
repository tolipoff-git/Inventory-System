import QRCode from 'qrcode';
import { QR_BASE_URL } from '../config/constants';

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
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
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
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
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
