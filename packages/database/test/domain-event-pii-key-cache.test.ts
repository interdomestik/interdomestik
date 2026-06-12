import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  clearEventPiiKeyCacheForTests,
  EVENT_PII_KEY_CACHE_MAX_ENTRIES,
  EVENT_PII_KEY_CACHE_TTL_MS,
  getEventPiiKeyCacheSizeForTests,
  resolveEventPiiKeyMaterial,
} from '../src/domain-event-pii-key-cache';
import { type DomainEventPiiTx, readEventPiiReference } from '../src/domain-event-pii';

type AnyRow = Record<string, unknown>;

function makeReadLimit(rowsByCall: AnyRow[][]) {
  let callIndex = 0;
  return () => Promise.resolve(rowsByCall[callIndex++] ?? []);
}

function makeReadTx(rowsByCall: AnyRow[][]) {
  const limit = makeReadLimit(rowsByCall);
  const where = () => ({ limit });
  const leftJoin = () => ({ where });
  const innerJoin = () => ({ leftJoin });
  const from = () => ({ innerJoin });

  return {
    select: () => ({ from }),
  } as unknown as DomainEventPiiTx;
}

function availableRow(keyCiphertext = 'ciphertext:key'): AnyRow {
  return {
    destroyedAt: null,
    erasedAt: null,
    encryptedPayload: 'ciphertext:payload',
    keyCiphertext,
    keyVersion: 1,
  };
}

describe('event PII key cache', () => {
  beforeEach(() => {
    clearEventPiiKeyCacheForTests();
  });

  it('uses current row material instead of stale cached key material', () => {
    resolveEventPiiKeyMaterial({
      keyCiphertext: 'ciphertext:old',
      keyVersion: 1,
      nowMs: 1,
      referenceId: 'ref-1',
      tenantId: 'tenant-1',
    });

    assert.deepEqual(
      resolveEventPiiKeyMaterial({
        keyCiphertext: 'ciphertext:new',
        keyVersion: 1,
        nowMs: 2,
        referenceId: 'ref-1',
        tenantId: 'tenant-1',
      }),
      { keyCiphertext: 'ciphertext:new', keyVersion: 1 }
    );
  });

  it('keeps the per-isolate cache TTL-bounded and size-bounded', () => {
    for (let index = 0; index <= EVENT_PII_KEY_CACHE_MAX_ENTRIES; index += 1) {
      resolveEventPiiKeyMaterial({
        keyCiphertext: `ciphertext:key-${index}`,
        keyVersion: 1,
        nowMs: 1,
        referenceId: `ref-${index}`,
        tenantId: 'tenant-1',
      });
    }

    assert.equal(getEventPiiKeyCacheSizeForTests(), EVENT_PII_KEY_CACHE_MAX_ENTRIES);

    resolveEventPiiKeyMaterial({
      keyCiphertext: 'ciphertext:fresh',
      keyVersion: 1,
      nowMs: EVENT_PII_KEY_CACHE_TTL_MS + 2,
      referenceId: 'ref-fresh',
      tenantId: 'tenant-1',
    });

    assert.equal(getEventPiiKeyCacheSizeForTests(), 1);
  });

  it('evicts cached material when a later read sees destroyed or missing keys', async () => {
    const tx = makeReadTx([[availableRow()], [{ destroyedAt: new Date() }], []]);
    const params = { tenantId: 'tenant-1', referenceId: 'ref-1' };

    assert.equal((await readEventPiiReference(tx, params)).status, 'available');
    assert.equal(getEventPiiKeyCacheSizeForTests(), 1);
    assert.deepEqual(await readEventPiiReference(tx, params), { status: 'erased_or_unavailable' });
    assert.equal(getEventPiiKeyCacheSizeForTests(), 0);
    assert.deepEqual(await readEventPiiReference(tx, params), { status: 'erased_or_unavailable' });
    assert.equal(getEventPiiKeyCacheSizeForTests(), 0);
  });
});
