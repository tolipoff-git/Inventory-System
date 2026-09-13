// ============================================================================
// 5S Tool Command Center — ScannerModal Component (Camera QR / Barcode Scanner)
// ============================================================================

import jsQR from 'jsqr';
import { T } from '../../../i18n';
import { toast } from '../../../utils/dom';

export type ScanCallback = (decoded: string) => void;

export class ScannerModal {
    private static modalId = 'qrScanModal';
    private static stream: MediaStream | null = null;
    private static animFrameId: number | null = null;
    private static onScanCallback: ScanCallback | null = null;
    private static isTorchOn = false;

    public static open(callback?: ScanCallback): void {
        if (callback) this.onScanCallback = callback;

        let modal = document.getElementById(this.modalId);
        if (!modal) {
            this.createModalDOM();
            modal = document.getElementById(this.modalId);
        }

        if (modal) modal.classList.add('active');
        this.startCamera();
    }

    public static close(): void {
        this.stopCamera();
        const modal = document.getElementById(this.modalId);
        if (modal) modal.classList.remove('active');
    }

    private static createModalDOM(): void {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = this.modalId;

        overlay.innerHTML = `
            <div class="modal" style="max-width:480px; text-align:center;">
                <div class="modal-header">
                    <h3 class="modal-title">📷 ${T('Scan QR / Barcode')}</h3>
                    <button class="close-btn" id="scannerCloseBtn">&times;</button>
                </div>
                <div class="modal-body" style="padding:15px; position:relative; overflow:hidden;">
                    <div style="position:relative; width:100%; max-width:380px; height:280px; margin:0 auto; background:#000; border-radius:10px; overflow:hidden; border:2px solid var(--primary);">
                        <video id="scannerVideo" playsinline style="width:100%; height:100%; object-fit:cover;"></video>
                        <canvas id="scannerCanvas" style="display:none;"></canvas>

                        <!-- Scanner Crosshair Target Overlay -->
                        <div style="position:absolute; top:50%; left:50%; width:200px; height:200px; transform:translate(-50%, -50%); border:2px dashed #00e5ff; border-radius:12px; pointer-events:none; box-shadow:0 0 20px rgba(0, 229, 255, 0.4);">
                            <div style="position:absolute; top:0; left:0; width:100%; height:2px; background:#00e5ff; box-shadow:0 0 8px #00e5ff; animation:scannerScan 2s infinite ease-in-out;"></div>
                        </div>
                    </div>

                    <div style="display:flex; justify-content:center; gap:10px; margin-top:12px;">
                        <button class="btn btn-muted" id="scannerTorchBtn" style="font-size:0.85rem;">🔦 Torch</button>
                    </div>

                    <div style="margin-top:14px; border-top:1px solid var(--border); padding-top:12px;">
                        <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:6px;">Manual barcode or ID entry:</div>
                        <div style="display:flex; gap:6px;">
                            <input type="text" id="scannerManualInput" class="form-control" placeholder="Type ID or code…">
                            <button class="btn btn-primary" id="scannerManualSubmitBtn">${T('Go')}</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-muted" id="scannerFooterCloseBtn">${T('Close')}</button>
                </div>
            </div>
            <style>
                @keyframes scannerScan {
                    0% { top: 0; }
                    50% { top: 98%; }
                    100% { top: 0; }
                }
            </style>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#scannerCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#scannerFooterCloseBtn')?.addEventListener('click', () => this.close());
        overlay.querySelector('#scannerTorchBtn')?.addEventListener('click', () => this.toggleTorch());

        const manualInput = overlay.querySelector<HTMLInputElement>('#scannerManualInput');
        const manualBtn = overlay.querySelector('#scannerManualSubmitBtn');

        const handleManual = () => {
            if (manualInput && manualInput.value.trim()) {
                const val = manualInput.value.trim();
                manualInput.value = '';
                this.handleDecoded(val);
            }
        };

        manualBtn?.addEventListener('click', handleManual);
        manualInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleManual();
        });
    }

    private static async startCamera(): Promise<void> {
        const video = document.getElementById('scannerVideo') as HTMLVideoElement;
        if (!video) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            video.srcObject = this.stream;
            await video.play();
            this.scanFrame();
        } catch (err: any) {
            console.error('Camera access denied or unavailable:', err);
            toast('Camera unavailable. Use manual entry or barcode wedge.', 'warning');
        }
    }

    private static stopCamera(): void {
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isTorchOn = false;
    }

    private static async toggleTorch(): Promise<void> {
        if (!this.stream) return;
        const track = this.stream.getVideoTracks()[0];
        if (!track) return;

        const capabilities = (track.getCapabilities && track.getCapabilities()) as any;
        if (capabilities && capabilities.torch) {
            this.isTorchOn = !this.isTorchOn;
            await (track as any).applyConstraints({
                advanced: [{ torch: this.isTorchOn }]
            });
            toast(this.isTorchOn ? '🔦 Torch ON' : '🔦 Torch OFF');
        } else {
            toast('Torch not supported on this device camera.', 'warning');
        }
    }

    private static scanFrame(): void {
        const video = document.getElementById('scannerVideo') as HTMLVideoElement;
        const canvas = document.getElementById('scannerCanvas') as HTMLCanvasElement;
        if (!video || !canvas) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });

                if (code && code.data && code.data.trim()) {
                    this.playBeep();
                    this.handleDecoded(code.data.trim());
                    return;
                }
            }
        }

        this.animFrameId = requestAnimationFrame(() => this.scanFrame());
    }

    private static playBeep(): void {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);

            if (navigator.vibrate) {
                navigator.vibrate(60);
            }
        } catch (e) {
            // Audio/vibration feedback is best-effort; haptics unavailable is not a failure
            console.error('[ScannerModal:playBeep] Audio feedback error:', e);
        }
    }

    private static handleDecoded(code: string): void {
        this.close();
        if (this.onScanCallback) {
            this.onScanCallback(code);
        } else {
            toast(`📷 Scanned: ${code}`);
            const globalSearch = document.getElementById('globalSearch') as HTMLInputElement;
            if (globalSearch) {
                globalSearch.value = code;
                globalSearch.dispatchEvent(new Event('input'));
            }
        }
    }
}
