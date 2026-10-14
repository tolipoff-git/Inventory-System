import { describe, expect, it } from 'vitest';
import { toErrorMessage } from '../src/utils/errors';

describe('toErrorMessage', () => {
  it('reads Error instances', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('passes strings through and reads message-shaped objects', () => {
    expect(toErrorMessage('plain failure')).toBe('plain failure');
    expect(toErrorMessage({ message: 'from a plain object' })).toBe('from a plain object');
    expect(toErrorMessage({ message: 42 })).toBe('[object Object]');
  });

  it('never throws on exotic values', () => {
    expect(toErrorMessage(undefined)).toBe('unknown error');
    expect(toErrorMessage(null)).toBe('unknown error');
    expect(toErrorMessage(0)).toBe('0');
    expect(toErrorMessage(Symbol('x'))).toContain('Symbol');
  });
});
