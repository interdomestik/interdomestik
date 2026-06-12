import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createEventPiiReference,
  type DomainEventPiiTx,
  readEventPiiReference,
} from '../src/domain-event-pii';

type AnyRow = Record<string, unknown>;
type InsertCapture = { row: AnyRow; table: unknown };

function makeTx(captures: InsertCapture[]) {
  return {
    insert: (table: unknown) => ({
      values: (row: AnyRow) => {
        captures.push({ table, row });
        return Promise.resolve([]);
      },
    }),
  } as unknown as DomainEventPiiTx;
}

function makeReadTx(rows: AnyRow[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({ limit: () => Promise.resolve(rows) }),
          }),
        }),
      }),
    }),
  } as unknown as DomainEventPiiTx;
}

const VALID = {
  encryptedPayload: 'ciphertext:payload',
  eventId: 'event-1',
  keyCiphertext: 'ciphertext:key',
  keyId: 'key-1',
  referenceId: 'ref-1',
  referenceKind: 'member_name',
  subjectId: 'member-1',
  subjectType: 'member',
  tenantId: 'tenant-1',
};

describe('createEventPiiReference', () => {
  it('stores reference metadata separately from encrypted key material', async () => {
    const captures: InsertCapture[] = [];
    const result = await createEventPiiReference(makeTx(captures), VALID);

    assert.deepEqual(result, { referenceId: 'ref-1', keyId: 'key-1' });
    assert.equal(captures.length, 2);
    assert.equal(captures[0].row.encryptedPayload, 'ciphertext:payload');
    assert.equal(captures[0].row.keyCiphertext, undefined);
    assert.equal(captures[1].row.referenceId, 'ref-1');
    assert.equal(captures[1].row.keyCiphertext, 'ciphertext:key');
  });

  it('trims identifiers and defaults keyVersion to 1', async () => {
    const captures: InsertCapture[] = [];
    await createEventPiiReference(makeTx(captures), {
      ...VALID,
      eventId: ' event-1 ',
      referenceKind: ' member_name ',
      subjectId: ' member-1 ',
      subjectType: ' member ',
      tenantId: ' tenant-1 ',
    });

    assert.equal(captures[0].row.eventId, 'event-1');
    assert.equal(captures[0].row.subjectType, 'member');
    assert.equal(captures[1].row.keyVersion, 1);
  });

  it('rejects blank sensitive fields before inserting', async () => {
    const captures: InsertCapture[] = [];
    await assert.rejects(
      () => createEventPiiReference(makeTx(captures), { ...VALID, encryptedPayload: ' ' }),
      /requires encryptedPayload/
    );
    assert.equal(captures.length, 0);
  });

  it('rejects invalid key versions before inserting', async () => {
    const captures: InsertCapture[] = [];
    await assert.rejects(
      () => createEventPiiReference(makeTx(captures), { ...VALID, keyVersion: 0 }),
      /requires keyVersion >= 1/
    );
    assert.equal(captures.length, 0);
  });
});

describe('readEventPiiReference', () => {
  it('returns encrypted material for details reads when key material is available', async () => {
    const result = await readEventPiiReference(
      makeReadTx([
        {
          destroyedAt: null,
          erasedAt: null,
          encryptedPayload: 'ciphertext:payload',
          keyCiphertext: 'ciphertext:key',
          keyVersion: 2,
        },
      ]),
      { tenantId: ' tenant-1 ', referenceId: ' ref-1 ' }
    );

    assert.deepEqual(result, {
      encryptedPayload: 'ciphertext:payload',
      keyCiphertext: 'ciphertext:key',
      keyVersion: 2,
      status: 'available',
    });
  });

  it('returns redacted fallback when key material is missing, destroyed, or erased', async () => {
    assert.deepEqual(
      await readEventPiiReference(makeReadTx([]), { tenantId: 'tenant-1', referenceId: 'ref-1' }),
      { status: 'erased_or_unavailable' }
    );
    assert.deepEqual(
      await readEventPiiReference(makeReadTx([{ destroyedAt: new Date() }]), {
        tenantId: 'tenant-1',
        referenceId: 'ref-1',
      }),
      { status: 'erased_or_unavailable' }
    );
    assert.deepEqual(
      await readEventPiiReference(makeReadTx([{ destroyedAt: null, erasedAt: new Date() }]), {
        tenantId: 'tenant-1',
        referenceId: 'ref-1',
      }),
      { status: 'erased_or_unavailable' }
    );
  });
});
