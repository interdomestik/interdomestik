import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray } from 'drizzle-orm';

import { crmLeads } from '../src/schema';
import { byText, actorIn, ksActor } from './activity-access-rls.support';
import { withLeads } from './lead-activities-rls.support';
import { MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

// R-06: the lead-activity read rule (role allow-list, an agent only on its own lead, the tenant)
// proven by the domain query itself on a real database, connected as the restricted role.

test('the restricted role reads lead activities only for an allowed role on an accessible lead', async t => {
  await withLeads(t, async (_session, { ids, leadIds }) => {
    const [{ getLeadActivitiesCore }, { withTenantAuthority }] = await Promise.all([
      import('../../domain-activities/src/get-lead'),
      import('../src/tenant-authority-context'),
    ]);
    const read = (actor: ReturnType<typeof ksActor>, leadId: string) =>
      getLeadActivitiesCore({ ...actor, leadId });
    const refused = (actor: ReturnType<typeof ksActor>, leadId: string) =>
      assert.rejects(read(actor, leadId), { message: 'Permission denied' });

    // Row-level security hides the MK lead from the KS context, and MK's own context sees it:
    // a refusal below is the rule's answer, not a missing row.
    await withTenantAuthority(ksActor(ids.agentA, 'agent').authority, async tx => {
      const visible = await tx
        .select({ id: crmLeads.id })
        .from(crmLeads)
        .where(inArray(crmLeads.id, leadIds));
      assert.deepEqual(
        visible.map(row => row.id).sort(byText),
        [ids.leadA, ids.leadB].sort(byText)
      );
    });
    await withTenantAuthority(actorIn(MK_TENANT_ID, ids.agentMk, 'agent').authority, async tx => {
      const visible = await tx
        .select({ id: crmLeads.id })
        .from(crmLeads)
        .where(eq(crmLeads.id, ids.leadMk));
      assert.deepEqual(visible, [{ id: ids.leadMk }]);
    });

    // Allowed: the agent on its own lead, staff and admin on any lead of the tenant.
    assert.deepEqual(
      (await read(ksActor(ids.agentA, 'agent'), ids.leadA)).map(row => row.id),
      [ids.activityA]
    );
    for (const role of ['staff', 'admin']) {
      const rows = await read(ksActor(`${role}-reader`, role), ids.leadB);
      assert.deepEqual(
        rows.map(row => row.id),
        [ids.activityB],
        `${role} reads the lead's activities`
      );
    }

    // Refused: another agent's lead (it exists: staff reads it above), another tenant's lead
    // (it exists in MK), an unknown lead, and staff on the MK lead.
    await refused(ksActor(ids.agentA, 'agent'), ids.leadB);
    await refused(ksActor(ids.agentA, 'agent'), ids.leadMk);
    await refused(ksActor('staff-reader', 'staff'), ids.leadMk);
    await refused(ksActor('staff-reader', 'staff'), `${ids.leadA}_unknown`);

    // Refused before any read: roles outside the allow-list, the legacy member role included.
    for (const role of ['member', 'user', 'branch_manager', 'tenant_admin', 'auditor']) {
      await refused(ksActor(ids.agentB, role), ids.leadB);
    }
  });
});
