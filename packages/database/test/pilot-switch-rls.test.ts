import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as poll } from 'node:timers/promises';

import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  changePilotSwitch,
  PILOT_SWITCH_CATEGORY,
  readPilotSwitch,
  type PilotSwitchChange,
  type PilotSwitchKey,
} from '../src/pilot-switch';
import { auditLog, tenants, tenantSettings, user } from '../src/schema';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';

const close = {
  key: 'new_sales',
  enabled: false,
  expectedRevision: 0,
  reason: 'Pause sales',
} as const;
const open = { ...close, enabled: true, approvalReference: 'Signed restart approval' } as const;
const closed = { state: 'closed', revision: 0, wellFormed: false };

function pgCode(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error) return error.code;
  return 'cause' in error ? pgCode(error.cause) : undefined;
}

test(
  'pilot switches and audit writes obey restricted tenant authority',
  { timeout: 30_000 },
  async t => {
    const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '2' });
    if (!session) return;
    const { adminDb, fixture } = session;
    const tenantA = fixture.newId('pilot_tenant_a');
    const tenantB = fixture.newId('pilot_tenant_b');
    const tenantIds = [tenantA, tenantB];
    const operatorA = fixture.newId('pilot_operator_a');
    const operatorB = fixture.newId('pilot_operator_b');
    const authorityA = mintTestTenantAuthority(tenantA, {
      role: 'tenant_admin',
      userId: operatorA,
    });
    const authorityB = mintTestTenantAuthority(tenantA, {
      accessTenantId: tenantB,
      role: 'super_admin',
      userId: operatorB,
    });
    const settingScope = inArray(tenantSettings.tenantId, tenantIds);
    const auditScope = inArray(auditLog.tenantId, tenantIds);
    const tenantScope = inArray(tenants.id, tenantIds);
    const userScope = inArray(user.id, [operatorA, operatorB]);

    try {
      const { withTenantAuthority } = await import('../src/tenant-authority-context');
      const role = quoteIdentifier(TEST_DB_ROLE);
      await adminDb.execute(
        sql.raw(`grant select, insert, update on table "tenant_settings" to ${role}`)
      );
      await adminDb.execute(sql.raw(`grant select, insert on table "audit_log" to ${role}`));
      await adminDb
        .insert(tenants)
        .values(tenantIds.map(id => ({ id, name: id, legalName: id, countryCode: 'MK' })));
      await adminDb.insert(user).values(
        [
          { id: operatorA, tenantId: tenantA, role: 'tenant_admin' },
          { id: operatorB, tenantId: tenantB, role: 'super_admin' },
        ].map(operator => ({
          ...operator,
          name: 'Pilot switch operator',
          email: `${operator.id}@example.test`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      );

      const change = (authority: typeof authorityA, input: PilotSwitchChange) =>
        withTenantAuthority(authority, tx => changePilotSwitch(tx, authority, input));
      const read = (
        authority: typeof authorityA,
        tenant: string,
        key: PilotSwitchKey = 'new_sales'
      ) => withTenantAuthority(authority, tx => readPilotSwitch(tx, tenant, key));

      await t.test(
        'a closed tenant cannot read or write another tenant’s open switch',
        async () => {
          const [posture] = await withTenantAuthority(authorityA, tx =>
            tx.execute<{ role: string; bypass: boolean }>(sql`
          select current_user as role, rolbypassrls as bypass
          from pg_roles where rolname = current_user`)
          );
          assert.deepEqual(posture, { role: TEST_DB_ROLE, bypass: false });
          assert.deepEqual(await change(authorityB, open), {
            ok: true,
            switch: { state: 'open', revision: 1, wellFormed: true },
          });
          assert.deepEqual(await read(authorityA, tenantA), closed);
          assert.deepEqual(await read(authorityA, tenantB), closed);
          assert.deepEqual(await read(authorityB, tenantB), {
            state: 'open',
            revision: 1,
            wellFormed: true,
          });
          await assert.rejects(
            withTenantAuthority(authorityA, tx => changePilotSwitch(tx, authorityB, close)),
            error => pgCode(error) === '42501'
          );
          assert.deepEqual(await change(authorityA, close), {
            ok: true,
            switch: { state: 'closed', revision: 1, wellFormed: true },
          });
          const audits = await adminDb
            .select({ tenantId: auditLog.tenantId, actorId: auditLog.actorId })
            .from(auditLog)
            .where(auditScope)
            .orderBy(auditLog.tenantId);
          assert.deepEqual(audits, [
            { tenantId: tenantA, actorId: operatorA },
            { tenantId: tenantB, actorId: operatorB },
          ]);
        }
      );

      await t.test('an intervening close invalidates a stale reopening approval', async () => {
        assert.equal((await change(authorityB, { ...close, expectedRevision: 1 })).ok, true);
        assert.equal((await change(authorityB, { ...open, expectedRevision: 2 })).ok, true);
        assert.equal((await change(authorityB, { ...close, expectedRevision: 3 })).ok, true);
        assert.deepEqual(await change(authorityB, { ...open, expectedRevision: 2 }), {
          ok: false,
          code: 'CONFLICT',
        });
        assert.deepEqual(await read(authorityB, tenantB), {
          state: 'closed',
          revision: 4,
          wellFormed: true,
        });
      });

      await t.test(
        'two first writers on different connections deliver one revision and audit row',
        async () => {
          let pending:
            Promise<PromiseSettledResult<Awaited<ReturnType<typeof change>>>[]> | undefined;
          const input = { ...close, key: 'public_intake' } as const;
          try {
            await adminDb.transaction(async tx => {
              await tx.execute(sql`lock table tenant_settings in share mode`);
              pending = Promise.allSettled([change(authorityA, input), change(authorityA, input)]);
              // SHARE allows both SELECT FOR UPDATE queries. Both INSERTs must reach the lock wait.
              const deadline = Date.now() + 5000;
              for (;;) {
                const [row] = await tx.execute<{ waiting: number }>(sql`
              select count(distinct pid)::int as waiting from pg_locks
              where relation = 'tenant_settings'::regclass and mode = 'RowExclusiveLock'
                and not granted and pg_backend_pid() = any(pg_blocking_pids(pid))`);
                if (row.waiting === 2) break;
                assert.ok(
                  Date.now() < deadline,
                  'both insert statements reached the PostgreSQL lock'
                );
                await poll(20);
              }
            });
            assert.ok(pending);
            const outcomes = (await pending).map(outcome => {
              if (outcome.status === 'rejected') throw outcome.reason;
              return outcome.value;
            });
            assert.equal(outcomes.filter(result => result.ok).length, 1);
            assert.deepEqual(
              outcomes.find(result => !result.ok),
              { ok: false, code: 'CONFLICT' }
            );
            const [changed] = await adminDb
              .select({ id: tenantSettings.id })
              .from(tenantSettings)
              .where(
                and(
                  eq(tenantSettings.tenantId, tenantA),
                  eq(tenantSettings.category, PILOT_SWITCH_CATEGORY),
                  eq(tenantSettings.key, 'public_intake')
                )
              );
            assert.deepEqual(await read(authorityA, tenantA, 'public_intake'), {
              state: 'closed',
              revision: 1,
              wellFormed: true,
            });
            const audits = await adminDb
              .select({ metadata: auditLog.metadata })
              .from(auditLog)
              .where(eq(auditLog.entityId, changed.id));
            assert.equal(audits.length, 1);
          } finally {
            await pending;
          }
        }
      );

      await t.test('a malformed stored value is repaired only from revision zero', async () => {
        const id = fixture.newId('pilot_malformed_switch');
        const value = { enabled: true, revision: 7, unknown: true };
        await adminDb.insert(tenantSettings).values({
          id,
          tenantId: tenantB,
          category: PILOT_SWITCH_CATEGORY,
          key: 'public_intake',
          value,
        });
        assert.deepEqual(await read(authorityB, tenantB, 'public_intake'), closed);
        const input = { ...close, key: 'public_intake' } as const;
        assert.deepEqual(await change(authorityB, { ...input, expectedRevision: 7 }), {
          ok: false,
          code: 'CONFLICT',
        });
        assert.equal((await change(authorityB, input)).ok, true);
        const [audit] = await adminDb.select().from(auditLog).where(eq(auditLog.entityId, id));
        assert.deepEqual(audit?.metadata.observedMalformedValue, value);
      });

      await t.test('an audit insert failure rolls back the setting update', async () => {
        const noMatchingActor = mintTestTenantAuthority(tenantB, {
          role: 'super_admin',
          userId: fixture.newId('pilot_missing_operator'),
        });
        await assert.rejects(
          change(noMatchingActor, { ...open, expectedRevision: 4 }),
          error => pgCode(error) === '23503'
        );
        assert.deepEqual(await read(authorityB, tenantB), {
          state: 'closed',
          revision: 4,
          wellFormed: true,
        });
      });
    } finally {
      try {
        await adminDb.delete(auditLog).where(auditScope);
        await adminDb.delete(tenantSettings).where(settingScope);
        await adminDb.delete(user).where(userScope);
        await adminDb.delete(tenants).where(tenantScope);
      } finally {
        await session.close();
      }
    }
  }
);
