import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, sql } from 'drizzle-orm';

import { crmLeads } from '../src/schema';
import { grantTablePrivileges, ksActor, raceAgainstHeldWrite } from './activity-access-rls.support';
import { withLeads } from './lead-activities-rls.support';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06 and R-17: the lead-activity write rule proven by the domain command on a real database,
// connected as the restricted role, including a reassignment racing the write. One restricted
// session per file: the app's pools close with it.

type ActivityRow = { id: string; tenantId: string; agentId: string };

/** The tenant and author of the rows not in `old`. */
const addedRows = (rows: readonly ActivityRow[], old: readonly ActivityRow[]) =>
  rows
    .filter(row => !old.some(previous => previous.id === row.id))
    .map(({ tenantId, agentId }) => ({ tenantId, agentId }));

test('the restricted role logs lead activities only for an allowed role on an accessible lead', async t => {
  await withLeads(
    t,
    async ({ adminDb, fixture }, { ids, activitiesOf }) => {
      const { logLeadActivityCore } = await import('../../domain-activities/src/log-lead');
      type Actor = ReturnType<typeof ksActor>;
      const log = (actor: Actor, data: Record<string, unknown>) =>
        logLeadActivityCore({
          ...actor,
          data: { type: 'note', subject: 'RLS proof', ...data } as never,
        });
      const snapshot = async () => ({
        a: await activitiesOf(ids.leadA),
        b: await activitiesOf(ids.leadB),
        mk: await activitiesOf(ids.leadMk),
      });

      await t.test('refused writes leave every activity unchanged', async () => {
        const before = await snapshot();
        for (const [actor, leadId, error] of [
          [ksActor(ids.agentA, 'agent'), ids.leadB, 'Lead access denied'],
          [ksActor(ids.agentA, 'agent'), ids.leadMk, 'Lead access denied'],
          [ksActor(ids.staff, 'staff'), ids.leadMk, 'Lead access denied'],
          [ksActor(ids.staff, 'staff'), `${ids.leadA}_unknown`, 'Lead access denied'],
          ...['member', 'user', 'branch_manager', 'tenant_admin', 'auditor'].map(
            role =>
              [
                ksActor(ids.agentB, role),
                ids.leadB,
                'Permission denied: insufficient role',
              ] as const
          ),
        ] as const) {
          assert.deepEqual(await log(actor, { leadId }), { success: false, error }, `${leadId}`);
        }
        // An input naming the tenant or the author is refused, not silently corrected.
        for (const injected of [{ tenantId: MK_TENANT_ID }, { agentId: ids.agentB }]) {
          const result = await log(ksActor(ids.agentA, 'agent'), {
            leadId: ids.leadA,
            ...injected,
          });
          assert.equal(result.success, false);
          assert.match(String(result.error), /^Validation failed: /);
        }
        assert.deepEqual(await snapshot(), before);
      });

      await t.test('allowed writes store the tenant and author of the authority', async () => {
        const before = await snapshot();
        // The agent on its own lead, and staff on another agent's lead of the tenant.
        assert.deepEqual(await log(ksActor(ids.agentA, 'agent'), { leadId: ids.leadA }), {
          success: true,
          error: undefined,
        });
        assert.deepEqual(await log(ksActor(ids.staff, 'staff'), { leadId: ids.leadB }), {
          success: true,
          error: undefined,
        });
        const after = await snapshot();
        assert.deepEqual(addedRows(after.a, before.a), [
          { tenantId: KS_TENANT_ID, agentId: ids.agentA },
        ]);
        assert.deepEqual(addedRows(after.b, before.b), [
          { tenantId: KS_TENANT_ID, agentId: ids.staff },
        ]);
        assert.deepEqual(after.mk, before.mk);
      });

      await t.test('a lead reassigned while its agent logs refuses the write (R-17)', async () => {
        const before = await activitiesOf(ids.leadA);
        const agentA = ksActor(ids.agentA, 'agent');
        const result = await raceAgainstHeldWrite({
          adminDb,
          probe: agentA.authority,
          // A second connection reassigns lead A to agent B and holds the row until released.
          hold: tx =>
            tx
              .update(crmLeads)
              .set({ agentId: ids.agentB })
              .where(and(eq(crmLeads.id, ids.leadA), eq(crmLeads.tenantId, KS_TENANT_ID))),
          act: () => log(agentA, { leadId: ids.leadA, subject: 'raced' }),
        });
        assert.deepEqual(result, { success: false, error: 'Lead access denied' });
        assert.deepEqual(await activitiesOf(ids.leadA), before, 'no activity was written');
      });

      await t.test('a grant cleanup never removes a grant the role held before', async () => {
        // A table this subtest owns, so no other grant on it can be lost; dropping it in
        // `finally` removes every grant made here, whichever assertion fails.
        const table = `r37_grant_probe_${fixture.newId('t').replaceAll(/[^a-z0-9_]/gu, '_')}`;
        const target = `public.${quoteIdentifier(table)}`;
        const role = quoteIdentifier(TEST_DB_ROLE);
        const privilegeState = async () => {
          const [state] = await adminDb.execute<{ table: boolean; column: boolean }>(sql`
            select
              has_table_privilege(${TEST_DB_ROLE}, format('public.%I', ${table}::text), 'UPDATE')
                as "table",
              has_column_privilege(
                ${TEST_DB_ROLE}, format('public.%I', ${table}::text), 'note', 'UPDATE'
              ) as "column"`);
          return state;
        };
        // Created before `try`: if the name were taken, `finally` must not drop a table it did
        // not create.
        await adminDb.execute(sql.raw(`create table ${target} (id text, note text)`));
        try {
          // Without prior grants: the cleanup returns the role to no privilege at all.
          const revoke = await grantTablePrivileges(adminDb, [['update', table]]);
          assert.deepEqual(await privilegeState(), { table: true, column: true });
          await revoke();
          assert.deepEqual(await privilegeState(), { table: false, column: false });
          // With a column-only grant: a table grant whose cleanup would drop it is refused
          // before anything is granted, and the column grant stays.
          await adminDb.execute(sql.raw(`grant update (note) on table ${target} to ${role}`));
          await assert.rejects(grantTablePrivileges(adminDb, [['update', table]]), {
            message: /holds column-level update/u,
          });
          assert.deepEqual(await privilegeState(), { table: false, column: true });
          // The same for a column-only INSERT, and for a grant on a system column (`ctid`).
          const columnGrant = async (privilege: string, column: string) => {
            const [state] = await adminDb.execute<{ held: boolean }>(sql`
              select has_column_privilege(
                ${TEST_DB_ROLE}, format('public.%I', ${table}::text), ${column}::text, ${privilege}::text
              ) as held`);
            return state?.held;
          };
          for (const [privilege, column] of [
            ['insert', 'note'],
            ['select', 'ctid'],
          ] as const) {
            await adminDb.execute(
              sql.raw(`grant ${privilege} (${column}) on table ${target} to ${role}`)
            );
            await assert.rejects(grantTablePrivileges(adminDb, [[privilege, table]]), {
              message: new RegExp(`holds column-level ${privilege}`, 'u'),
            });
            assert.equal(
              await columnGrant(privilege, column),
              true,
              `${privilege} (${column}) stays`
            );
          }
        } finally {
          await adminDb.execute(sql.raw(`drop table if exists ${target}`));
        }
      });
    },
    { DB_MAX_CONNECTIONS: '4' }
  );
});
