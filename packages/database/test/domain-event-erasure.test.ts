import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  isSubjectErased,
  markSubjectErased,
  type DomainEventErasureTx,
} from '../src/domain-event-erasure';

type AnyRow = Record<string, unknown>;

function makeFakeTx(insertCapture: { row?: AnyRow }, selectRows: AnyRow[]) {
  return {
    insert: (..._: unknown[]) => ({
      values: (row: AnyRow) => {
        insertCapture.row = row;
        return { onConflictDoUpdate: () => Promise.resolve([]) };
      },
    }),
    select: (..._: unknown[]) => ({
      from: () => ({ where: () => Promise.resolve(selectRows) }),
    }),
  } as unknown as DomainEventErasureTx;
}

function makeErasureTx(selectRows: AnyRow[] = []) {
  const insertCapture: { row?: AnyRow } = {};
  return { insertCapture, tx: makeFakeTx(insertCapture, selectRows) };
}

const SUBJECT = { tenantId: 'tenant-1', subjectType: 'member', subjectId: 'member-1' };

describe('domain event erasure migration', () => {
  it('creates domain_event_keys with required columns, RLS, and tenant-isolation policy', () => {
    const migration = readFileSync('drizzle/0079_domain_event_keys.sql', 'utf8');
    assert.match(migration, /CREATE TABLE "domain_event_keys"/);
    assert.match(migration, /"subject_type" text NOT NULL/);
    assert.match(migration, /"subject_id" text NOT NULL/);
    assert.match(migration, /"erased_at" timestamp with time zone/);
    assert.match(migration, /"domain_event_keys_tenant_subject_uq"/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /tenant_isolation_domain_event_keys/);
    assert.match(migration, /domain_event_keys_tenant_id_tenants_id_fk/);
  });
});

describe('markSubjectErased', () => {
  it('inserts an erasure row with correct fields and current erasedAt', async () => {
    const { insertCapture, tx } = makeErasureTx();
    const before = Date.now();
    await markSubjectErased(tx, SUBJECT);
    const after = Date.now();
    assert.ok(insertCapture.row, 'row was inserted');
    assert.equal(insertCapture.row.tenantId, 'tenant-1');
    assert.equal(insertCapture.row.subjectType, 'member');
    assert.equal(insertCapture.row.subjectId, 'member-1');
    const ts = (insertCapture.row.erasedAt as Date).getTime();
    assert.ok(ts >= before && ts <= after, 'erasedAt is within call window');
  });

  it('trims whitespace from identifiers before inserting', async () => {
    const { insertCapture, tx } = makeErasureTx();
    await markSubjectErased(tx, { tenantId: ' t-1 ', subjectType: ' m ', subjectId: ' s-1 ' });
    assert.equal(insertCapture.row?.tenantId, 't-1');
    assert.equal(insertCapture.row?.subjectType, 'm');
    assert.equal(insertCapture.row?.subjectId, 's-1');
  });

  it('rejects blank tenantId before inserting', async () => {
    const { tx } = makeErasureTx();
    await assert.rejects(
      () => markSubjectErased(tx, { ...SUBJECT, tenantId: '  ' }),
      /requires tenantId/
    );
  });

  it('rejects blank subjectType before inserting', async () => {
    const { tx } = makeErasureTx();
    await assert.rejects(
      () => markSubjectErased(tx, { ...SUBJECT, subjectType: '' }),
      /requires subjectType/
    );
  });

  it('rejects blank subjectId before inserting', async () => {
    const { tx } = makeErasureTx();
    await assert.rejects(
      () => markSubjectErased(tx, { ...SUBJECT, subjectId: ' ' }),
      /requires subjectId/
    );
  });
});

describe('isSubjectErased', () => {
  it('returns false when no key row exists for the subject', async () => {
    const { tx } = makeErasureTx([]);
    assert.equal(await isSubjectErased(tx, SUBJECT), false);
  });

  it('returns false when key row exists but erasedAt is null', async () => {
    const { tx } = makeErasureTx([{ erasedAt: null }]);
    assert.equal(await isSubjectErased(tx, SUBJECT), false);
  });

  it('returns true when key row has erasedAt set', async () => {
    const { tx } = makeErasureTx([{ erasedAt: new Date('2026-06-09T10:00:00Z') }]);
    assert.equal(await isSubjectErased(tx, SUBJECT), true);
  });
});
