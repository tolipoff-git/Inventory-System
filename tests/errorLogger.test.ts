import { describe, expect, it } from 'vitest';
import {
  RUNTIME_ERROR_ACTION,
  formatRuntimeError,
  installGlobalErrorLogging,
} from '../src/utils/errorLogger';

/** Minimal EventTarget stand-in — lets us dispatch synthetic failure events. */
function fakeTarget() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    addEventListener(type: string, listener: (event: unknown) => void) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener);
    },
    removeEventListener(type: string, listener: (event: unknown) => void) {
      listeners.get(type)?.delete(listener);
    },
    emit(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

function recorder() {
  const entries: Array<{ action: string; details?: string }> = [];
  return { entries, sink: { log: (action: string, details?: string) => entries.push({ action, details }) } };
}

describe('runtime error capture', () => {
  it('formats whitespace and caps the payload size', () => {
    const long = `boom\n   ${'x'.repeat(1000)}`;
    const out = formatRuntimeError('error', long);
    expect(out.startsWith('[error] boom x')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(formatRuntimeError('rejection', '', undefined)).toContain('(no message)');
  });

  it('records window errors with stack context into the audit sink', () => {
    const host = fakeTarget();
    const { entries, sink } = recorder();
    installGlobalErrorLogging(sink, host);
    host.emit('error', { message: 'kaboom', filename: 'app.js', error: new Error('kaboom') });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe(RUNTIME_ERROR_ACTION);
    expect(entries[0].details).toContain('[error] kaboom');
  });

  it('normalises non-Error rejection reasons and throttles repeats', () => {
    const host = fakeTarget();
    const { entries, sink } = recorder();
    installGlobalErrorLogging(sink, host);
    host.emit('unhandledrejection', { reason: 'plain-string' });
    host.emit('unhandledrejection', { reason: 'plain-string' });
    expect(entries).toHaveLength(1); // identical fingerprint within a minute
    expect(entries[0].details).toContain('[rejection] plain-string');
  });

  it('detaches both listeners on disposal and survives a throwing sink', () => {
    const host = fakeTarget();
    const dispose = installGlobalErrorLogging({ log() { throw new Error('disk full'); } }, host);
    expect(() => host.emit('error', { message: 'ignored' })).not.toThrow();
    dispose();
    expect(host.count()).toBe(0);
  });
});
