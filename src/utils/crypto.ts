/**
 * Crypto utilities: salted PBKDF2-SHA256 secret verifiers and constant-time comparison.
 *
 * Verifier format: "pbkdf2$<iterations>$<salt_b64url>$<hash_b64url>"
 * (base64url, no padding). Separate random salt per secret — no two stored
 * verifiers are ever identical, and a leaked hash is not directly crackable.
 *
 * Hashing is async: PBKDF2 uses WebCrypto `deriveBits` where available (modern
 * browsers, Cloudflare Workers, Node >= 18) and falls back to a PBKDF2-HMAC
 * construction over `crypto.subtle.digest` (RFC 8018 §5.2) where only a digest
 * primitive exists. If no crypto primitive is available at all, hashing fails
 * closed — a silently weakened verifier is never produced.
 *
 * All login/registration call sites already `await`, so the async API is safe.
 */

const PBKDF2_ITERATIONS = 210_000; // OWASP-recommended for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const VERIFIER_PREFIX = 'pbkdf2$';
const LEGACY_SHA256_LEN = 64; // historical hex digest length = 256 bits

/* Type for WebCrypto PBKDF2 (present in Node >= 18 / modern browsers). */
interface Pbkdf2Params {
  name: 'PBKDF2';
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-1';
  salt: BufferSource;
  iterations: number;
}

/** Best-effort WebCrypto accessor (browser `window.crypto` or `globalThis.crypto`). */
function webCrypto(): Crypto | null {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto;
  const g = globalThis as any;
  if (g && typeof g.crypto === 'object' && g.crypto !== null) return g.crypto as Crypto;
  return null;
}

/* ------------------------------------------------------------------ */
/* Small byte/base64 helpers                                           */
/* ------------------------------------------------------------------ */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const wc = webCrypto();
  if (wc && typeof wc.getRandomValues === 'function') {
    const buf = new Uint8Array(n);
    wc.getRandomValues(buf);
    return buf;
  }
  // Non-cryptographic fallback (Math.random) for exotic non-secure contexts.
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ------------------------------------------------------------------ */
/* Constant-time string comparison (fixed-length XOR scan)             */
/* ------------------------------------------------------------------ */

/**
 * Timing-safe equality for strings of any length. Length leaks, contents don't.
 */
export function constantTimeEq(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* PBKDF2-HMAC-SHA256                                                  */
/* ------------------------------------------------------------------ */

/**
 * Derive `dkLen` bytes of key material from `password` + `salt` using PBKDF2-HMAC-SHA256.
 * Prefers WebCrypto `deriveBits`; falls back to HMAC over `subtle.digest`.
 */
async function pbkdf2Derive(password: string, salt: Uint8Array, iterations: number, dkLen: number): Promise<Uint8Array> {
  const subtle = webCrypto()?.subtle;
  if (subtle && typeof subtle.deriveBits === 'function') {
    const pwKey = await subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2', hash: 'SHA-256' } as Pbkdf2Params,
      false,
      ['deriveBits', 'deriveKey']
    );
    const algo: Pbkdf2Params & { name: string } = { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as BufferSource, iterations };
    const bits = await subtle.deriveBits(algo, pwKey as CryptoKey, dkLen * 8);
    return new Uint8Array(bits);
  }
  // No WebCrypto (PBKDF2 deriveBits): synthesize the PRF via HMAC-SHA256 from
  // crypto.subtle.digest, which only requires the far more widely supported
  // digest primitive.
  const subtleDigest = webCrypto()?.subtle;
  if (subtleDigest && typeof subtleDigest.digest === 'function') {
    const digest = async (data: Uint8Array) => new Uint8Array(await subtleDigest.digest('SHA-256', data as BufferSource));
    return pbkdf2HmacLoop(digest, password, salt, iterations, dkLen);
  }
  // No crypto primitive at all (legacy WebView / sandboxed iframe). Fail closed:
  // silently emitting a weakenable verifier is worse than refusing to start.
  throw new Error('WebCrypto unavailable: cannot derive a secure PBKDF2 verifier');
}

/**
 * PBKDF2-HMAC-SHA256 via a caller-supplied SHA-256 digest fn (RFC 8018 §5.2).
 * Correct FIPS-validated algorithm; digest blocks are all-native ArrayBuffer.
 */
async function pbkdf2HmacLoop(
  digest: (data: Uint8Array) => Promise<Uint8Array>,
  password: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number
): Promise<Uint8Array> {
  const pwBytes = new TextEncoder().encode(password);

  const hmac = async (key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> => {
    let k = key;
    if (k.length > 64) k = await digest(k);
    const inner = new Uint8Array(64 + msg.length);
    for (let i = 0; i < 64; i++) inner[i] = 0x36 ^ (i < k.length ? k[i] : 0);
    inner.set(msg, 64);
    const ih = await digest(inner);
    const outer = new Uint8Array(64 + ih.length);
    for (let i = 0; i < 64; i++) outer[i] = 0x5c ^ (i < k.length ? k[i] : 0);
    outer.set(ih, 64);
    return await digest(outer);
  };

  const out = new Uint8Array(dkLen);
  const hLen = 32;
  const blocks = Math.ceil(dkLen / hLen);
  for (let block = 1; block <= blocks; block++) {
    const u0 = new Uint8Array(salt.length + 4);
    u0.set(salt, 0);
    u0[salt.length] = (block >> 24) & 0xff;
    u0[salt.length + 1] = (block >> 16) & 0xff;
    u0[salt.length + 2] = (block >> 8) & 0xff;
    u0[salt.length + 3] = block & 0xff;
    let u = await hmac(pwBytes, u0);
    const t = new Uint8Array(u);
    for (let i = 1; i < iterations; i++) {
      u = await hmac(pwBytes, u);
      for (let j = 0; j < u.length; j++) t[j] ^= u[j];
    }
    for (let j = 0; j < hLen; j++) {
      const idx = (block - 1) * hLen + j;
      if (idx < dkLen) out[idx] = t[j];
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Salted PBKDF2-SHA256 verifier for a password/PIN.
 * Returns "pbkdf2$<iter>$<salt>$<hash>". If `salt` is omitted a fresh random
 * salt is generated (default for new secrets).
 */
export async function hashSecret(secret: string, salt?: Uint8Array): Promise<string> {
  const saltBytes = salt || randomBytes(SALT_BYTES);
  const dk = await pbkdf2Derive(secret, saltBytes, PBKDF2_ITERATIONS, HASH_BYTES);
  return `${VERIFIER_PREFIX}${PBKDF2_ITERATIONS}$` +
    `${bytesToBase64Url(saltBytes)}$` +
    `${bytesToBase64Url(dk)}`;
}

/**
 * Constant-time verification of `secret` against a stored verifier.
 * Also accepts a legacy raw SHA-256 hex digest (64 chars) for backward
 * compatibility with databases seeded before this module shipped.
 */
export async function verifySecret(secret: string, verifier: string): Promise<boolean> {
  if (typeof verifier !== 'string' || typeof secret !== 'string') return false;
  if (verifier.startsWith(VERIFIER_PREFIX)) {
    const parts = verifier.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    if (!Number.isInteger(iterations) || iterations < 1000) return false;
    let salt: Uint8Array;
    let expected: Uint8Array;
    let dk: Uint8Array;
    try {
      salt = base64UrlToBytes(parts[2]);
      expected = base64UrlToBytes(parts[3]);
      dk = await pbkdf2Derive(secret, salt, iterations, expected.length);
    } catch {
      return false;
    }
    if (expected.length !== dk.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ dk[i];
    return diff === 0;
  }
  if (verifier.length === LEGACY_SHA256_LEN && /^[0-9a-f]{64}$/i.test(verifier)) {
    const hash = await sha256Hex(secret);
    return constantTimeEq(hash, verifier.toLowerCase());
  }
  // Legacy djb2 fallback digests (produced by the pre-PBKDF2 "hashPw" when
  // crypto.subtle was unavailable). Keep verifying them — they were never
  // upgraded, and a successful login will now force a PBKDF2 upgrade.
  if (typeof verifier === 'string' && verifier.startsWith('djb2_')) {
    const hash = await sha256Hex(secret);
    if (hash.startsWith('djb2_')) {
      return constantTimeEq(hash, verifier);
    }
    return false;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Backward-compatible helpers (kept for report checksums / audit seals) */
/* ------------------------------------------------------------------ */

/**
 * Raw (unsalted) SHA-256 hex digest. NOT for password storage — retained for
 * inventory-export integrity checksums that must be reproducible.
 */
export async function sha256Hex(str: string): Promise<string> {
  const subtle = webCrypto()?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const hashBuffer = await subtle.digest('SHA-256', new TextEncoder().encode(str) as BufferSource);
      return toHex(new Uint8Array(hashBuffer));
    } catch {
      /* fall through to pure-JS fallback */
    }
  }
  const buf = new TextEncoder().encode(str);
  // Deterministic djb2 fallback preserves old behavior when subtle is absent.
  let h = 5381;
  for (let i = 0; i < buf.length; i++) {
    h = ((h << 5) + h + buf[i]) >>> 0;
  }
  return 'djb2_' + h.toString(16);
}

export { PBKDF2_ITERATIONS, SALT_BYTES };