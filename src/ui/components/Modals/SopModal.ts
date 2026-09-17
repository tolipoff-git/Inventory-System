// ============================================================================
// 5S Tool Command Center — SopModal Component (Standard Operating Procedures & FAQ)
// ============================================================================

import { T, initFaqAccordion } from '../../../i18n';
import { printHtml } from '../../../utils/dom';

export class SopModal {
    private static sopModalId = 'sopModal';
    private static faqModalId = 'faqModal';

    public static openSop(code: string): void {
        let modal = document.getElementById(this.sopModalId);
        if (!modal) {
            this.createSopModalDOM();
            modal = document.getElementById(this.sopModalId);
        }

        this.renderSopContent(code);
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
                    <button class="btn btn-warning" id="sopModalPrintBtn">🖨 ${T('Print SOP Document')}</button>
                    <button class="btn btn-muted" id="sopModalFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#sopModalCloseBtn')?.addEventListener('click', () => this.closeSop());
        overlay.querySelector('#sopModalFooterCloseBtn')?.addEventListener('click', () => this.closeSop());
        overlay.querySelector('#sopModalPrintBtn')?.addEventListener('click', () => {
            const body = document.getElementById('sopModalBody')?.innerHTML;
            if (body) printHtml(body);
        });
    }

    private static renderSopContent(code: string): void {
        const title = document.getElementById('sopModalTitle');
        const body = document.getElementById('sopModalBody');
        if (!title || !body) return;

        if (code === 'TW') {
            title.textContent = '📖 SOP-TW-01: Torque Wrench Calibration & Handling';
            body.innerHTML = `
                <h4>1. Purpose & Scope</h4>
                <p>Standardized procedures for using, resetting, and storing calibrated torque wrenches across assembly lines.</p>
                <h4>2. Zeroing & Reset Requirement</h4>
                <p>Immediately after use, every mechanical click-type torque wrench <strong>MUST</strong> be dialed back to the lowest calibrated index value (never below zero). Leaving springs tensioned causes irreversible spring fatigue and accuracy drift.</p>
                <h4>3. Drop & Shock Protocols</h4>
                <p>If any torque wrench experiences a drop greater than 1 meter onto concrete, it is immediately quarantined and submitted for recalibration.</p>
            `;
        } else if (code === 'BT') {
            title.textContent = '📖 SOP-BT-02: Li-Ion Battery Charging & Thermal Health';
            body.innerHTML = `
                <h4>1. Purpose & Scope</h4>
                <p>Prevents battery degradation and thermal runaway incidents on high-cycle power tool cells.</p>
                <h4>2. Charging Rules</h4>
                <p>Allow battery packs to reach room temperature (18°C–25°C) before placing on rapid chargers. Never charge packs that feel hot to the touch.</p>
            `;
        } else if (code === 'PB') {
            title.textContent = '📖 SOP-PB-03: Cutting Bits & Wear Limits';
            body.innerHTML = `
                <h4>1. Purpose & Scope</h4>
                <p>Defines replacement thresholds for driver bits, milling cutters, and consumables.</p>
                <h4>2. Inspection Limits</h4>
                <p>Bits with rounding on drive lobes exceeding 0.3mm or flank wear >0.2mm must be scrapped immediately into dedicated recycling bins.</p>
            `;
        } else {
            title.textContent = '📖 SOP-GEN-00: 5S Tool Handling & Shadow Board Standards';
            body.innerHTML = `
                <h4>1. Standard 5S Tool Control</h4>
                <p>Every tool in the facility has a designated home labeled with its unique Tool ID, shadow board silhouette, and address coordinates.</p>
                <h4>2. Checkout & Cleanliness</h4>
                <p>Tools must be checked out prior to work shift start and returned clean and wiped down before end-of-shift muster.</p>
            `;
        }
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
