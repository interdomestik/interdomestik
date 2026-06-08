import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  isSubjectErased,
  markSubjectErased,
  type DomainEventErasureTx,
} from '../src/domain-event-erasure';

type AnyRow = Record<string, unknown>;

class FakeOnConflictStep {
  onConflictDoUpdate(): Promise<{ id: string }[]> {
    return Promise.resolve([]);
  }
}
class FakeInsertValuesStep {
  constructor(private readonly capture: { row?: AnyRow }) {}
  values(row: AnyRow): FakeOnConflictStep {
    this.capture.row = row;
    return new FakeOnConflictStep();
  }
}
class FakeSelectWhereStep {
  constructor(private readonly rows: AnyRow[]) {}
  where(): Promise<AnyRow[]> {
    return Promise.resolve(this.rows);
  }
}
class FakeSelectFromStep {
  constructor(private readonly rows: AnyRow[]) {}
  from(): FakeSelectWhereStep {
    return new FakeSelectWhereStep(this.rows);
  }
}
class FakeTx {
  constructor(
    private readonly insertCapture: { row?: AnyRow },
    private readonly selectRows: AnyRow[]
  ) {}
  insert(..._args: unknown[]): FakeInsertValuesStep {
    return new FakeInsertValuesStep(this.insertCapture);
  }
  select(..._args: unknown[]): FakeSelectFromStep {
    return new FakeSelectFromStep(this.selectRows);
  }
}

function makeErasureTx(selectRows: AnyRow[] = []) {
  const insertCapture: { row?: AnyRow } = {};
  return {
    insertCapture,
    tx: new FakeTx(insertCapture, selectRows) as unknown as DomainEventErasureTx,
  };
}

describe('domain event erasure migration', () => {
  it('creates domain_event_keys table with required columns, RLS, and tenant-isolation policy', () => {
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
  it('inserts an erasure row with tenant, subject type, subject id, and current erasedAt', async () => {
    const { insertCapture, tx } = makeErasureTx();
    const before = Date.now();
    await markSubjectErased(tx, {
      tenantId: 'tenant-1',
      subjectType: 'member',
      subjectId: 'member-1',
    });
    const after = Date.now();
    assert.ok(insertCapture.row, 'row was inserted');
    assert.equal(insertCapture.row.tenantId, 'tenant-1');
    assert.equal(insertCapture.row.subjectType, 'member');
    assert.equal(insertCapture.row.subjectId, 'member-1');
    const erasedAt = insertCapture.row.erasedAt;
    assert.ok(erasedAt instanceof Date, 'erasedAt is a Date');
    assert.ok(
      erasedAt.getTime() >= before && erasedAt.getTime() <= after,
      'erasedAt is within call window'
    );
  });

  it('rejects blank tenantId before inserting', async () => {
    const { tx } = makeErasureTx();
    await assert.rejects(
      () => markSubjectErased(tx, { tenantId: '  ', subjectType: 'member', subjectId: 'member-1' }),
      /requires tenantId/
    );
  });

  it('rejects blank subjectType before inserting', async () => {
    const { tx } = makeErasureTx();
    await assert.rejects(
      () => markSubjectErased(tx, { tenantId: 'tenant-1', subjectType: '', subjectId: 'member-1' }),
      /requires subjectType/
    );
  });

  it('rejects blank subjectId before inserting', async () => {
    const { tx } = makeErasureTx();
    await assert.rejects(
      () => markSubjectErased(tx, { tenantId: 'tenant-1', subjectType: 'member', subjectId: ' ' }),
      /requires subjectId/
    );
  });
});

describe('isSubjectErased', () => {
  it('returns false when no key row exists for the subject', async () => {
    const { tx } = makeErasureTx([]);
    assert.equal(
      await isSubjectErased(tx, {
        tenantId: 'tenant-1',
        subjectType: 'member',
        subjectId: 'member-1',
      }),
      false
    );
  });

  it('returns false when key row exists but erasedAt is null', async () => {
    const { tx } = makeErasureTx([{ erasedAt: null }]);
    assert.equal(
      await isSubjectErased(tx, {
        tenantId: 'tenant-1',
        subjectType: 'member',
        subjectId: 'member-1',
      }),
      false
    );
  });

  it('returns true when key row has erasedAt set', async () => {
    const { tx } = makeErasureTx([{ erasedAt: new Date('2026-06-09T10:00:00Z') }]);
    assert.equal(
      await isSubjectErased(tx, {
        tenantId: 'tenant-1',
        subjectType: 'member',
        subjectId: 'member-1',
      }),
      true
    );
  });
});
