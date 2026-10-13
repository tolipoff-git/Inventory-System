// ============================================================================
// Global runtime-error capture.
//
// Why it exists: uncaught exceptions and unhandled promise rejections previously
// vanished into the browser console. On shop-floor tablets nobody reads the
// console, so failures after startup were undiagnosable after the fact. This
// module funnels both channels into the persisted audit log.
//
// Design notes:
// - Framework-free and dependency-injected (`sink`, `target`) so the pure part is
//   unit-testable without a real window.
// - Throttled by fingerprint + per-minute cap: one faulty component re-rendering
//   every frame must not flood (and rotate away) the audit trail.
// - Never throws back into the page: logging is best-effort by definition.
// ============================================================================

/** Minimal audit-log surface this module depends on (`Store.log` satisfies it). */
export interface ErrorLogSink {
  log(action: string, details?: string): void;
}

/** Action id written for every captured failure — keep stable for log filters. */
export const RUNTIME_ERROR_ACTION = 'RUNTIME_ERROR';

const MAX_DETAILS_CHARS = 600;
const MAX_PER_MINUTE = 20;

interface ErrorListenerTarget {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

/** Collapses whitespace and caps length so one bad stack cannot fill the store. */
export function formatRuntimeError(kind: 'error' | 'rejection', message: string, stack?: string): string {
  const parts = [`[${kind}] ${message || '(no message)'}`];
  if (stack) parts.push(stack);
  return parts.join(' | ').replace(/\s+/g, ' ').slice(0, MAX_DETAILS_CHARS);
}

/**
 * Attaches `error` and `unhandledrejection` listeners that forward formatted
 * failures to `sink`. Returns a disposer that detaches them again.
 */
export function installGlobalErrorLogging(sink: ErrorLogSink, target?: ErrorListenerTarget): () => void {
  const host = target ?? (globalThis as unknown as ErrorListenerTarget);
  const recent = new Map<string, number>();

  const record = (details: string): void => {
    const now = Date.now();
    if (now - (recent.get(details) ?? -Infinity) < 60_000) return; // fingerprint dedupe
    recent.set(details, now);
    if (recent.size > MAX_PER_MINUTE) {
      for (const [key, at] of recent) if (now - at >= 60_000) recent.delete(key);
      // Still saturated after purging stale fingerprints — drop rather than flood.
      if (recent.size > MAX_PER_MINUTE * 2) return;
    }
    try {
      sink.log(RUNTIME_ERROR_ACTION, details);
    } catch {
      /* logging must never compound the failure */
    }
  };

  const onError = (event: unknown): void => {
    const e = event as { message?: string; error?: { message?: string; stack?: string }; filename?: string };
    const error = e?.error;
    record(formatRuntimeError('error', error?.message || e?.message || '', `${e?.filename || ''} ${error?.stack || ''}`));
  };

  const onRejection = (event: unknown): void => {
    const reason = (event as { reason?: unknown })?.reason;
    const isError = reason instanceof Error;
    record(formatRuntimeError('rejection', isError ? reason.message : String(reason), isError ? reason.stack : undefined));
  };

  host.addEventListener('error', onError);
  host.addEventListener('unhandledrejection', onRejection);
  return () => {
    host.removeEventListener('error', onError);
    host.removeEventListener('unhandledrejection', onRejection);
  };
}
