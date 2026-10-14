// ============================================================================
// Error message extraction.
//
// Why it exists: catch bindings used to be annotated as `any` and read straight
// through `.message`, silently assuming every thrown value is an Error. `catch` clauses receive
// `unknown` (TS 4.4+), so this single helper turns any thrown value — Error,
// string, {message} object, DOMException — into a readable message without
// weakening types anywhere. Pair it with `catch (error)` (no annotation).
// ============================================================================

/** Best-effort human-readable message for an `unknown` thrown value. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? 'unknown error');
}
