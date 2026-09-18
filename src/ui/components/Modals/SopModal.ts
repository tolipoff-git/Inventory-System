// ============================================================================
// 5S Tool Command Center — SopModal Component (Standard Operating Procedures & FAQ)
//
// Standards are data now (`settings.sops`, see `types/sop.ts`), not hardcoded
// HTML: the modal renders the stored document in the active language, with its
// control metadata (code · revision · effective date · approved by · status) and
// a local EN/RU toggle so a document can be read in the other language without
// switching the whole UI.
// ============================================================================

import { T, initFaqAccordion, getLanguage } from '../../../i18n';
import { Store } from '../../../storage/store';
import { printHtml } from '../../../utils/dom';
import { esc, fmtDate } from '../../../utils/formatters';
import { SopDocument, appliesToLabel } from '../../../types/sop';
import { SupportedLanguage } from '../../../i18n/types';

export class SopModal {
    private static sopModalId = 'sopModal';
    private static faqModalId = 'faqModal';
    /** Document currently shown; kept so the language toggle can re-render. */
    private static currentCode: string | null = null;
    /** Local view language override (null → follow the app language). */
    private static viewLang: SupportedLanguage | null = null;

    public static openSop(code: string): void {
        let modal = document.getElementById(this.sopModalId);
        if (!modal) {
            this.createSopModalDOM();
            modal = document.getElementById(this.sopModalId);
        }

        this.currentCode = code;
        this.viewLang = null;
        this.renderSopContent();
        if (modal) modal.classList.add('active');
    }

    public static closeSop(): void {
        const modal = document.getElementById(this.sopModalId);
        if (modal) modal.classList.remove('active');
    }

    public static openFaq(): void {
        let modal = document.getElementById(this.faqModalId);
        if (!modal) {
            this.createFaqModalDOM();
            modal = document.getElementById(this.faqModalId);
        }

        this.renderFaqContent();
        if (modal) modal.classList.add('active');
    }

    public static closeFaq(): void {
        const modal = document.getElementById(this.faqModalId);
        if (modal) modal.classList.remove('active');
    }

    private static createSopModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.sopModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:850px;">
                <div class="modal-header">
                    <h3 class="modal-title" id="sopModalTitle">SOP</h3>
                    <button class="close-btn" id="sopModalCloseBtn">&times;</button>
                </div>
                <div class="modal-body table-scroll" id="sopModalBody" style="max-height:70vh; line-height:1.6;"></div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="sopModalLangBtn"></button>
                    <button class="btn btn-warning" id="sopModalPrintBtn">🖨 ${T('Print SOP Document')}</button>
                    <button class="btn btn-muted" id="sopModalFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#sopModalCloseBtn')?.addEventListener('click', () => this.closeSop());
        overlay.querySelector('#sopModalFooterCloseBtn')?.addEventListener('click', () => this.closeSop());
        overlay.querySelector('#sopModalLangBtn')?.addEventListener('click', () => {
            const effective = this.viewLang || getLanguage();
            this.viewLang = effective === 'RU' ? 'ENG' : 'RU';
            this.renderSopContent();
        });
        overlay.querySelector('#sopModalPrintBtn')?.addEventListener('click', () => {
            const body = document.getElementById('sopModalBody')?.innerHTML;
            if (body) printHtml(body);
        });
    }

    /** Control metadata block that makes the document a controlled document. */
    private static controlHeader(sop: SopDocument, lang: SupportedLanguage): string {
        const cell = (label: string, value: string) =>
            `<div style="min-width:130px;"><div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.03em;">${esc(label)}</div><div style="font-weight:600;">${esc(value)}</div></div>`;

        return `
            <div style="display:flex; flex-wrap:wrap; gap:14px 22px; padding:10px 12px; margin-bottom:14px; border:1px solid var(--border); border-left:3px solid var(--primary); border-radius:4px; background:var(--bg-elevated, rgba(127,127,127,0.06));">
                ${cell(T('SOP Code'), sop.id)}
                ${cell(T('Revision'), sop.revision)}
                ${cell(T('Effective Date'), sop.effectiveDate ? fmtDate(sop.effectiveDate) : '—')}
                ${cell(T('Approved By'), sop.approvedBy || '—')}
                ${cell(T('Status'), T(sop.status))}
                ${cell(T('Applies To'), appliesToLabel(sop, lang))}
            </div>
        `;
    }

    private static renderSopContent(): void {
        const title = document.getElementById('sopModalTitle');
        const body = document.getElementById('sopModalBody');
        const langBtn = document.getElementById('sopModalLangBtn');
        if (!title || !body) return;

        const lang: SupportedLanguage = this.viewLang || getLanguage();
        if (langBtn) langBtn.textContent = lang === 'RU' ? T('SOP_SHOW_EN') : T('SOP_SHOW_RU');

        const sop = this.currentCode ? Store.getSop(this.currentCode) : undefined;
        if (!sop) {
            title.textContent = this.currentCode ? `📖 ${this.currentCode}` : '📖 SOP';
            body.innerHTML = `<p style="color:var(--text-muted);">${esc(T('SOP_NOT_FOUND'))}</p>`;
            return;
        }

        const docTitle = lang === 'RU' ? sop.titleRu : sop.titleEn;
        const docBody = lang === 'RU' ? sop.bodyRu : sop.bodyEn;

        title.textContent = `📖 ${sop.id}: ${docTitle}`;
        body.innerHTML =
            this.controlHeader(sop, lang) +
            (docBody || '') +
            `<p style="margin-top:18px; padding-top:10px; border-top:1px solid var(--border); color:var(--text-muted); font-size:0.8rem;">${esc(T('SOP_CONTROLLED_NOTE'))}</p>`;
    }

    private static createFaqModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.faqModalId;

        overlay.innerHTML = `
            <div class="modal wide" style="max-width:850px;">
                <div class="modal-header">
                    <h3 class="modal-title">❓ ${T('FAQ_TITLE')}</h3>
                    <button class="close-btn" id="faqModalCloseBtn">&times;</button>
                </div>
                <div class="modal-body table-scroll" id="faqModalBody" style="max-height:70vh; line-height:1.6;"></div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="faqModalFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#faqModalCloseBtn')?.addEventListener('click', () => this.closeFaq());
        overlay.querySelector('#faqModalFooterCloseBtn')?.addEventListener('click', () => this.closeFaq());
    }

    private static renderFaqContent(): void {
        const body = document.getElementById('faqModalBody');
        if (!body) return;
        body.innerHTML = T('FAQ_BODY');
        initFaqAccordion();
    }
}