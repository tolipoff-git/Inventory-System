import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { hashSecret, verifySecret, sha256Hex } from '../src/utils/crypto';
import { Store } from '../src/storage/store';
import { Auth } from '../src/auth/authManager';
import { AppDB } from '../src/storage/indexedDb';

globalThis.indexedDB = new IDBFactory();
AppDB._db = null;
AppDB._failed = false;

describe('legacy verifier migration', () => {
  it('verifies a legacy SHA-256 hash, then login upgrades to PBKDF2', async () => {
    const legacy = await sha256Hex('hunter2');
    Store.users = [{ username: 'admin', pwHash: legacy, role: 'Administrator' }];

    expect(await Auth.login('admin', 'hunter2')).toBe(true);
    const stored = Store.users[0];
    expect(stored.pwHash.startsWith('pbkdf2$')).toBe(true);
    expect(stored.needsPinSetup).toBeUndefined();
    expect(await verifySecret('hunter2', stored.pwHash)).toBe(true);
  });

  it('forces PIN setup for an empty-verifier bootstrap admin (first login only)', async () => {
    Store.users = [{ username: 'admin', pwHash: '', role: 'Administrator', needsPinSetup: true }];
    expect(await Auth.login('admin', 'first-run-secret')).toBe(true);
    const stored = Store.users[0];
    expect(stored.pwHash.startsWith('pbkdf2$')).toBe(true);
    expect(stored.needsPinSetup).toBe(false);
    expect(await verifySecret('first-run-secret', stored.pwHash)).toBe(true);
    // An operator with unset PIN can no longer self-provision after admin is set.
    Store.users.push({ username: 'operator', pwHash: '', role: 'Operator', needsPinSetup: true });
    expect(await Auth.login('operator', 'anything')).toBe(false);
  });
});
