import assert from 'node:assert/strict';
import test from 'node:test';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  assertNewSalesOpen,
  changePilotSwitch,
  readPilotSwitch,
  SalesClosedError,
  type PilotSwitchKey,
} from '../src/pilot-switch';
import { auditLog } from '../src/schema/notes';
import { tenantSettings } from '../src/schema/tenants';
import type { TenantTransaction } from '../src/tenant';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';

const closed = { state: 'closed', revision: 0, wellFormed: false };
const tenantId = 'tenant_test';
const input = {
  key: 'new_sales',
  enabled: false,
  expectedRevision: 0,
  reason: 'Suspend new sales',
} as const;

function fixture(
  row?: { id: string; value: unknown },
  options: { readError?: Error; auditError?: Error; writes?: number } = {}
) {
  const events: (string | object)[] = [];
  const selected = {
    then: (...callbacks: Parameters<Promise<unknown[]>['then']>) => {
      const result = options.readError
        ? Promise.reject(options.readError)
        : Promise.resolve(row ? [row] : []);
      return result.then(...callbacks);
    },
    for: (lock: string) => {
      events.push(lock);
      return selected;
    },
  };
  const returning = () => (options.writes === 0 ? [] : [{ id: row?.id ?? 'inserted' }]);
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        assert.equal(table, tenantSettings);
        return {
          where: (where: SQL) => {
            events.push(new PgDialect().sqlToQuery(where).params);
            return { limit: () => selected };
          },
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        if (table === auditLog) {
          events.push({ audit: values });
          if (options.auditError) throw options.auditError;
          return;
        }
        assert.equal(table, tenantSettings);
        events.push({ insert: values });
        return {
          onConflictDoNothing: ({ target }: { target: unknown }) => {
            assert.deepEqual(target, [
              tenantSettings.tenantId,
              tenantSettings.category,
              tenantSettings.key,
            ]);
            return { returning };
          },
        };
      },
    }),
    update: (table: unknown) => {
      assert.equal(table, tenantSettings);
      return {
        set: (values: unknown) => {
          events.push({ update: values });
          return {
            where: (where: SQL) => {
              assert.deepEqual(new PgDialect().sqlToQuery(where).params, [row?.id]);
              return { returning };
            },
          };
        },
      };
    },
  };
  return { events, tx: tx as unknown as TenantTransaction };
}

const admin = (role = 'super_admin') =>
  mintTestTenantAuthority('tenant_owner', { accessTenantId: tenantId, userId: 'actor', role });

test('only an exact well-formed setting can open a switch', async () => {
  const malformed = [
    null,
    [],
    'true',
    { enabled: true },
    { enabled: true, revision: 0 },
    { enabled: true, revision: 1.5 },
    { enabled: true, revision: Number.MAX_SAFE_INTEGER + 1 },
    { enabled: true, revision: 1, extra: true },
    { enabled: 'true', revision: 3 },
    Object.assign(Object.create({ enabled: true }), { revision: 3 }),
    {
      get enabled() {
        throw new Error('accessor must not run');
      },
      revision: 3,
    },
  ];
  assert.deepEqual(await readPilotSwitch(fixture().tx, tenantId, 'public_intake'), closed);
  for (const value of malformed) {
    assert.deepEqual(
      await readPilotSwitch(fixture({ id: 'row', value }).tx, tenantId, 'public_intake'),
      closed
    );
  }
  for (const enabled of [true, false]) {
    const { tx, events } = fixture({ id: 'row', value: { enabled, revision: 3 } });
    assert.deepEqual(await readPilotSwitch(tx, tenantId, 'public_intake'), {
      state: enabled ? 'open' : 'closed',
      revision: 3,
      wellFormed: true,
    });
    assert.deepEqual(events, [[tenantId, 'pilot', 'public_intake']]);
  }
});

test('an invalid key rejects before the query and a read error propagates', async () => {
  const readError = new Error('database unavailable');
  const { tx, events } = fixture(undefined, { readError });
  await assert.rejects(readPilotSwitch(tx, tenantId, 'missing' as PilotSwitchKey), TypeError);
  assert.deepEqual(events, []);
  await assert.rejects(
    readPilotSwitch(tx, tenantId, 'public_intake'),
    error => error === readError
  );
});

test('sales require an open switch under a shared lock', async () => {
  const { tx, events } = fixture();
  await assert.rejects(
    assertNewSalesOpen(tx, tenantId),
    error => error instanceof SalesClosedError && error.code === 'CLOSED'
  );
  assert.deepEqual(events, [[tenantId, 'pilot', 'new_sales'], 'share']);
  const open = fixture({ id: 'row', value: { enabled: true, revision: 1 } });
  await assertNewSalesOpen(open.tx, tenantId);
  assert.deepEqual(open.events, [[tenantId, 'pilot', 'new_sales'], 'share']);
});

test('first close is tenant-bound and audited after the conditional insert', async () => {
  const { tx, events } = fixture();
  assert.deepEqual(await changePilotSwitch(tx, admin('tenant_admin'), input), {
    ok: true,
    switch: { state: 'closed', revision: 1, wellFormed: true },
  });
  assert.deepEqual(events.slice(0, 2), [[tenantId, 'pilot', 'new_sales'], 'update']);
  assert.partialDeepStrictEqual(events[2], {
    insert: {
      tenantId,
      key: 'new_sales',
      category: 'pilot',
      value: { enabled: false, revision: 1 },
    },
  });
  assert.partialDeepStrictEqual(events[3], {
    audit: {
      action: 'pilot_switch.changed',
      actorId: 'actor',
      actorRole: 'tenant_admin',
      entityId: 'inserted',
      tenantId,
      metadata: {
        key: 'new_sales',
        from: 'closed',
        to: 'closed',
        fromRevision: 0,
        toRevision: 1,
        reason: input.reason,
        approvalReference: null,
      },
    },
  });
});

test('opening requires the super admin role and a signed approval reference', async () => {
  const { tx, events } = fixture();
  const open = { ...input, enabled: true };
  assert.deepEqual(
    await changePilotSwitch(tx, admin('tenant_admin'), { ...open, approvalReference: 'record' }),
    { ok: false, code: 'FORBIDDEN' }
  );
  assert.deepEqual(await changePilotSwitch(tx, admin(), open), {
    ok: false,
    code: 'APPROVAL_REQUIRED',
  });
  assert.deepEqual(events, []);
});

test('stale revisions and losing insert or update never create an audit row', async () => {
  const row = { id: 'row', value: { enabled: false, revision: 3 } };
  const stale = fixture(row);
  assert.deepEqual(await changePilotSwitch(stale.tx, admin(), input), {
    ok: false,
    code: 'CONFLICT',
  });
  assert.equal(stale.events.length, 2);
  for (const existing of [undefined, row]) {
    const { tx, events } = fixture(existing, { writes: 0 });
    assert.deepEqual(
      await changePilotSwitch(tx, admin(), { ...input, expectedRevision: existing ? 3 : 0 }),
      { ok: false, code: 'CONFLICT' }
    );
    assert.equal(events.length, 3);
  }
});

test('a revision-zero repair includes the previous malformed value in its audit', async () => {
  const value = { enabled: 'unrecognizable', revision: 12 };
  const { tx, events } = fixture({ id: 'row', value });
  assert.deepEqual(
    await changePilotSwitch(tx, admin(), { ...input, enabled: true, approvalReference: 'record' }),
    { ok: true, switch: { state: 'open', revision: 1, wellFormed: true } }
  );
  assert.deepEqual(events[2], { update: { value: { enabled: true, revision: 1 } } });
  assert.partialDeepStrictEqual(events[3], {
    audit: { metadata: { observedMalformedValue: value, approvalReference: 'record' } },
  });
});

test('audit failure propagates so the transaction rolls back', async () => {
  const auditError = new Error('audit denied');
  const { tx } = fixture(undefined, { auditError });
  await assert.rejects(changePilotSwitch(tx, admin(), input), error => error === auditError);
});
