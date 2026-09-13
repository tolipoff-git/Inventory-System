// ============================================================================
// AbortController — minimal fetch-abort companion.
// `AbortController` is the STANDARD WHATWG class (web spelling: capital-R
// in "AbortController"), typed by TS lib.dom but still missing as a runtime
// global on older engines (e.g. Node < 23, some 2023-era browsers).  When
// the engine ships the global, delegate straight to it (no recursion: the
// native is reached through globalThis, never through the local binding).
// Otherwise expose a fail-fast fallback: the signal is pre-aborted, so a
// fetch using it cleanly rejects with AbortError and every catch site that
// already wraps these calls degrades to "sync unavailable" instead of the
// module crashing on `new AbortController()`.
// ============================================================================

interface StdAbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

const nativeController =
  typeof globalThis !== 'undefined'
    ? (globalThis as { AbortController?: new () => StdAbortController }).AbortController
    : undefined;

function makeNative(): StdAbortController {
  return new (nativeController as new () => StdAbortController)();
}

function makeFallback(): StdAbortController {
  // AbortSignal.abort() delivers an already-aborted signal: fetch rejects
  // immediately with AbortError. Deterministic and safe on every engine
  // that at least supports fetch + AbortSignal.
  const signal = AbortSignal.abort();
  return {
    signal,
    abort() {
      // Signal is pre-aborted; nothing further to do.
    },
  };
}

export class AbortController implements StdAbortController {
  private readonly impl: StdAbortController;

  constructor() {
    this.impl = nativeController !== undefined ? makeNative() : makeFallback();
  }

  get signal(): AbortSignal {
    return this.impl.signal;
  }

  abort(reason?: unknown): void {
    this.impl.abort(reason);
  }
}