import { esc } from './formatters';
import { T, getLanguage } from '../i18n';
import { windowPrompt } from './dialogCompat';

let toastTimer: any = null;

export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches
    || 'ontouchstart' in window
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function toast(msgHtml: string, typeOrMs: string | number = 4000): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }

  let ms = 4000;
  let type = '';

  if (typeof typeOrMs === 'number') {
    ms = typeOrMs;
  } else if (typeof typeOrMs === 'string') {
    type = typeOrMs;
  }

  el.className = 'show' + (type ? ` ${type}` : '');
  el.innerHTML = msgHtml;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (el) el.className = '';
  }, ms);
}

export function toastDownload(filename: string): void {
  const ru = getLanguage() === 'RU';
  toast(`✅ ${ru ? 'Файл скачан' : 'File downloaded'}: <b>${esc(filename)}</b><br>
    <small style="opacity:0.85;">${ru ? 'Проверьте папку «Загрузки» на устройстве' : 'Check the Downloads folder on your device'}</small>`);
}

export function downloadText(filename: string, text: string, mime: string = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toastDownload(filename);
}

export function downloadBuffer(filename: string, buffer: ArrayBuffer | Uint8Array, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([buffer as any], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toastDownload(filename);
}

function copyFallback(text: string): void {
  if (typeof document === 'undefined') return;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    const preview = text.length > 32 ? text.slice(0, 16) + '…' + text.slice(-8) : text;
    toast(`📋 <b>${esc(preview)}</b> ${T('COPIED')}`);
  } catch {
    windowPrompt('Copy text:', text);
  }
  ta.remove();
}

export function copyText(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      const preview = text.length > 32 ? text.slice(0, 16) + '…' + text.slice(-8) : text;
      toast(`📋 <b>${esc(preview)}</b> ${T('COPIED')}`);
    }).catch(() => {
      copyFallback(text);
    });
  } else {
    copyFallback(text);
  }
}

export function printHtml(html: string): void {
  if (typeof document === 'undefined') return;
  let zone = document.getElementById('printZone');
  if (!zone) {
    zone = document.createElement('div');
    zone.id = 'printZone';
    zone.style.display = 'none';
    document.body.appendChild(zone);
  }
  zone.innerHTML = html;
  document.body.classList.add('print-zone-mode');
  const cleanup = () => {
    document.body.classList.remove('print-zone-mode');
    if (zone) zone.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 2000);
}
