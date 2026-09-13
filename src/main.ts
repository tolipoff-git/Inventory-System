// ============================================================================
// 5S Tool Command Center — Main Application Entry Point
// ============================================================================

// 1. Import Styles
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/tron-theme.css';
import './ui/styles/print.css';

// 2. Import Core Modules
import { Store } from './storage/store';
import { SyncManagerInstance } from './sync/syncManager';
import { App } from './ui/app';

// 3. Application Bootstrap
async function bootstrap(): Promise<void> {
    console.log('[5S Command Center] Initializing modular architecture...');

    try {
        // Initialize IndexedDB state & migrations
        await Store.init();
        console.log('[5S Command Center] Store initialized with', Store.tools.length, 'tools.');

        // Initialize Distributed Cloudflare Worker + SSE live relay
        SyncManagerInstance.init();
        console.log('[5S Command Center] Distributed sync engine active on room:', SyncManagerInstance.room);

        // Mount and initialize UI orchestrator
        App.init();
        console.log('[5S Command Center] UI mounted successfully.');

        // Register Service Worker for offline PWA functionality
        if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('[5S Command Center] ServiceWorker registered with scope:', reg.scope))
                .catch(err => console.error('[5S Command Center] ServiceWorker registration skipped/failed:', err));
        }
    } catch (err) {
        console.error('[5S Command Center] Critical bootstrap error:', err);
    }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap());
} else {
    bootstrap();
}
