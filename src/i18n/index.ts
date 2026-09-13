import { SupportedLanguage } from './types';
import { en } from './en';
import { ru } from './ru';

let activeLang: SupportedLanguage = 'ENG';
try {
  const saved = localStorage.getItem('inv_lang');
  if (saved === 'RU' || saved === 'ENG') {
    activeLang = saved;
  }
} catch (e) {
  console.error('[i18n:index] Failed to read language preference', e);
}

export const translations: Record<SupportedLanguage, Record<string, string>> = {
  ENG: en,
  RU: ru,
};

export function getLanguage(): SupportedLanguage {
  return activeLang;
}

export function T(key: string): string {
  return (translations[activeLang] && translations[activeLang][key]) || key;
}

export function setLanguage(lang: SupportedLanguage): void {
  activeLang = lang;
  try {
    localStorage.setItem('inv_lang', lang);
  } catch (e) {
    console.error('[i18n:setLanguage] Failed to persist language preference', e);
  }
  applyLanguage();
}

export function toggleLanguage(): void {
  setLanguage(activeLang === 'RU' ? 'ENG' : 'RU');
}

export function initFaqAccordion(): void {
  const details = document.querySelectorAll('#faqBody .faq-accordion details');
  details.forEach(target => {
    target.addEventListener('toggle', () => {
      if ((target as HTMLDetailsElement).open) {
        details.forEach(d => {
          if (d !== target) d.removeAttribute('open');
        });
      }
    });
  });
}

type RenderCallback = () => void;
const renderListeners: Set<RenderCallback> = new Set();

export function onLanguageChange(cb: RenderCallback): () => void {
  renderListeners.add(cb);
  return () => renderListeners.delete(cb);
}

export function applyLanguage(): void {
  const langBtnText = document.getElementById('langBtnText');
  if (langBtnText) {
    langBtnText.innerText = activeLang === 'RU' ? 'RU | ENG' : 'ENG | RU';
  }

  // Translate static data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18n;
    if (key) el.innerHTML = T(key);
  });

  // Translate placeholders data-i18n-ph
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18nPh;
    if (key) (el as HTMLInputElement).placeholder = T(key);
  });

  // Translate select options
  document.querySelectorAll('option[data-i18n]').forEach(el => {
    const key = (el as HTMLElement).dataset.i18n;
    if (key) (el as HTMLOptionElement).innerText = T(key);
  });

  // FAQ body
  const faqBody = document.getElementById('faqBody');
  if (faqBody) {
    faqBody.innerHTML = T('FAQ_BODY');
    initFaqAccordion();
  }

  // Notify listeners to re-render dynamic views
  renderListeners.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Language render callback error:', e);
    }
  });
}

export const I18n = {
  get currentLang() {
    return activeLang;
  },
  getLanguage,
  setLanguage,
  toggleLanguage,
  applyLanguage,
  T,
  translations,
};
