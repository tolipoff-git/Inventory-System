// ============================================================================
// Safe wrappers around the implicit window.confirm / window.prompt globals.
// These are available in Chrome/Firefox but may be undefined in strict or
// embedded WebViews, where a bare `confirm(...)`/`prompt(...)` would throw a
// ReferenceError. Callers should always use these helpers instead.
// ============================================================================

/**
 * Confirmation dialog. Falls back to `def` (default: false — cancel) when the
 * native window.confirm is unavailable, so destructive flows never throw.
 */
export function windowConfirm(msg?: string, def: boolean = false): boolean {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(msg ?? '');
  }
  return def;
}

/**
 * Text input dialog. Falls back to `def` (default: empty string) when the
 * native window.prompt is unavailable, so callers always get a string.
 * Explicit cancellation and unavailable dialogs return null.
 */
export function windowPrompt(label: string, def?: string): string | null {
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    const r = window.prompt(label, def);
    return r;
  }
  return null;
}