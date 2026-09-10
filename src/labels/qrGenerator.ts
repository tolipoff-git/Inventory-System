import QRCode from 'qrcode';
import { QR_BASE_URL } from '../config/constants';

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  size: number = 100
): Promise<void> {
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

export function toolDeeplink(toolId: string): string {
  return `${QR_BASE_URL}/?tool=${encodeURIComponent(toolId)}`;
}

export function locationDeeplink(loc: string): string {
  return `${QR_BASE_URL}/?loc=${encodeURIComponent(loc)}`;
}
