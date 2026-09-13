import { describe, it, expect } from 'vitest';
import { hashSecret, verifySecret, constantTimeEq, sha256Hex } from '../src/utils/crypto';

describe('crypto hash/verify roundtrip', () => {
  it('hashSecret returns a pbkdf2$ verifier with distinct salts', async () => {
    const a = await hashSecret('hunter2');
    const b = await hashSecret('hunter2');
    expect(typeof a).toBe('string');
    expect(a).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b); // fresh random salt each time
  });

  it('verifySecret accepts the correct secret and rejects wrong ones', async () => {
    const h = await hashSecret('s3cret-passphrase');
    expect(await verifySecret('s3cret-passphrase', h)).toBe(true);
    expect(await verifySecret('wrong-passphrase', h)).toBe(false);
  });

  it('verifySecret rejects malformed verifiers and enforces iteration floor', async () => {
    expect(await verifySecret('x', 'pbkdf2$10$AAAA$AAAA')).toBe(false);
    expect(await verifySecret('x', 'garbage')).toBe(false);
    expect(await verifySecret('x', '')).toBe(false);
  });

  it('verifies legacy unsalted SHA-256 digests (migration path)', async () => {
    const legacy = await sha256Hex('hunter2');
    expect(await verifySecret('hunter2', legacy)).toBe(true);
    expect(await verifySecret('wrong', legacy)).toBe(false);
  });
});

describe('constantTimeEq', () => {
  it('returns true only for identical strings', () => {
    expect(constantTimeEq('abc', 'abc')).toBe(true);
    expect(constantTimeEq('abc', 'abd')).toBe(false);
    expect(constantTimeEq('abc', 'ab')).toBe(false);
    expect(constantTimeEq('', '')).toBe(true);
  });

  it('never throws on non-string / null input', () => {
    expect(constantTimeEq('x' as string, null as unknown as string)).toBe(false);
    expect(constantTimeEq(undefined as unknown as string, 'x')).toBe(false);
    expect(constantTimeEq(123 as unknown as string, '123')).toBe(false);
  });
});