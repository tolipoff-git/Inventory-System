// ============================================================================
// PWA hard update — clear Cache Storage + unregister service workers, then
// reload with a cache-busting query so the browser fetches fresh HTML/JS.
// Mirrors the legacy monolith's `hardReload` (unregister → clear caches → ?t=).
// ============================================================================

export function hardReloadPwa(): void {
  const bust = () => {
    const url = window.location.pathname + '?t=' + Date.now();
    window.location.replace(url);
  };

  // Never hang the user: if anything below stalls, reload anyway.
  const guard = window.setTimeout(bust, 2500);

  const finish = () => {
    window.clearTimeout(guard);
    bust();
  };

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .catch(err => console.error('[pwa] ServiceWorker unregister failed', err))
        .then(() => {
          if ('caches' in window) {
            return caches.keys()
              .then(names => Promise.all(names.map(n => caches.delete(n))))
              .catch(err => console.error('[pwa] Cache clear failed', err));
          }
          return undefined;
        })
        .then(finish)
        .catch(finish);
    } else {
      finish();
    }
  } catch (e) {
    console.error('[pwa] Hard reload failed, falling back to plain reload', e);
    finish();
  }
}
