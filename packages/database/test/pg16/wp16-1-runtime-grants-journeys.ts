import assert from 'node:assert/strict';
import { mintTestTenantAuthority } from '../../src/testing/tenant-authority';
import { sponsorRuntimeRole } from '../../src/release-sponsor-checkpoint';
import { END, MID, START, type Scope, uid } from '../sponsor-seed.test-support';
import type { ScratchClient } from './scratch-database';

function result<T>(value: { ok: true; value: T } | { ok: false; error: string }): T {
  assert.ok(value.ok, 'error' in value ? value.error : undefined);
  return value.value;
}

/**
 * Exercise the domain commands with the migration's sponsor ACLs. Supplemental read and audit
 * grants here belong only to the disposable fixture pending the approved WP-15 release baseline.
 */
export async function proveSponsorJourneys(owner: ScratchClient, a: Scope) {
  const role = owner(sponsorRuntimeRole);
  await owner`grant select (id, tenant_id, branch_id, agent_id, lead_kind, status),
    update (id) on public.member_leads to ${role}`;
  await owner`grant select (id, tenant_id, tier) on public.membership_plans to ${role}`;
  await owner`grant select (id, tenant_id, email, role) on public."user" to ${role}`;
  await owner`grant select on public.subscriptions to ${role}`;
  await owner`grant select (tenant_id, category, key, value), update (id)
    on public.tenant_settings to ${role}`;
  await owner`insert into tenant_settings (id, tenant_id, category, key, value)
    values (${uid()}, ${a.tenant}, 'pilot', 'new_sales', '{"enabled":true,"revision":1}'::jsonb)`;
  await owner`update public."user" set role = 'member' where id = ${a.user}`;
  await owner`update subscriptions set provider_subscription_id = ${a.subscription}
    where id = ${a.subscription}`;

  // The production modules load after the opt-out fixture installs the two guarded clients.
  const { withTenantAuthority } = await import('../../src/tenant-authority-context');
  const { createSponsor, createTerm, addRevision } =
    await import('../../../domain-membership-billing/src/sponsors/terms');
  const { decideRevision, terminateTerm } =
    await import('../../../domain-membership-billing/src/sponsors/decisions');
  const { uploadRoster } =
    await import('../../../domain-membership-billing/src/sponsors/roster-upload');
  const { provisionEntry } =
    await import('../../../domain-membership-billing/src/sponsors/provisioning');
  const { recordHandoverEvidence } =
    await import('../../../domain-membership-billing/src/sponsors/handover-staff');
  const { acknowledgeHandoverCharge } =
    await import('../../../domain-membership-billing/src/sponsors/staff-tasks');
  const { claimDueMail, finishMail, mailLeaseUntil } =
    await import('../../../domain-membership-billing/src/sponsors/mail-outbox');
  const { readPersonCoverage } =
    await import('../../../domain-membership-billing/src/sponsor-coverage/resolve');

  const agent = { userId: a.user, role: 'agent', branchId: a.branch, agentTier: 'office' };
  const staff = { userId: a.staff, role: 'staff', branchId: a.branch, agentTier: null };
  const authority = (actor: typeof agent | typeof staff) =>
    mintTestTenantAuthority(a.tenant, { ...actor, purpose: 'session' });
  const agentAuthority = authority(agent);
  const staffAuthority = authority(staff);
  const revision = {
    seatCount: 4,
    pricePerSeatMinor: 100,
    currency: 'EUR',
    contractReference: 'Synthetic contract',
    termsVersion: 'test-v1',
  };
  const { sponsorId } = result(
    await createSponsor(agentAuthority, agent, {
      leadId: a.spareLead,
      legalName: 'Synthetic journey company',
      registrationNumber: null,
      taxNumber: null,
      billingContactName: 'Test',
      billingContactEmail: 'sponsor@example.test',
    })
  );
  const { termId, revisionId: initialRevision } = result(
    await createTerm(agentAuthority, agent, {
      sponsorId,
      termStart: new Date(START),
      termEnd: new Date(END),
      legalEntityId: a.entity,
      planKey: a.plan,
      revision,
    })
  );
  result(
    await decideRevision(staffAuthority, staff, {
      revisionId: initialRevision,
      decision: 'approved',
      invoiceReference: 'synthetic-initial',
    })
  );
  const { revisionId } = result(await addRevision(agentAuthority, agent, { termId, revision }));
  result(
    await decideRevision(staffAuthority, staff, {
      revisionId,
      decision: 'approved',
      invoiceReference: 'synthetic',
    })
  );
  assert.equal(
    result(
      await uploadRoster(agentAuthority, agent, {
        termId,
        secret: 'synthetic-wp16-disposable-fixture-only',
        rows: [{ firstName: 'Test', lastName: 'Member', email: 'seat@example.test' }],
      })
    ).inserted,
    1
  );
  result(
    await terminateTerm(staffAuthority, staff, {
      termId,
      now: new Date(START),
      effectiveAt: new Date(MID),
    })
  );

  // Dunning joins the full subscriptions row to sponsor coverage. Both paths use the same
  // restricted transaction and must distinguish the two existing synthetic users.
  await withTenantAuthority(staffAuthority, async tx => {
    const covered = await readPersonCoverage(tx, a.tenant, a.user);
    assert.equal(covered?.subscription?.id, a.subscription);
    assert.ok(covered.entries.some(entry => entry.id === a.sponsor_roster_entries));
    const without = await readPersonCoverage(tx, a.tenant, a.staff);
    assert.deepEqual(without, { subscription: null, entries: [] });
  });

  const now = new Date(MID);
  const provisioned = await provisionEntry(staffAuthority, {
    entryId: a.sponsor_roster_entries,
    now,
    hasCredential: async () => true,
  });
  assert.equal(provisioned.outcome, 'awaiting_paid_end');
  result(
    await recordHandoverEvidence(
      staffAuthority,
      staff,
      {
        hasCredential: async () => true,
      },
      {
        intentId: a.sponsor_handover_intents,
        now,
        paidUntil: new Date('2040-08-01T00:00:00Z'),
        evidenceId: 'wp16-synthetic',
      }
    )
  );
  assert.deepEqual(
    result(
      await acknowledgeHandoverCharge(staffAuthority, staff, {
        chargeId: a.sponsor_handover_charges,
        now,
      })
    ),
    { acknowledged: true }
  );
  const claimed = await claimDueMail(staffAuthority, now, 20);
  assert.ok(claimed.includes(a.sponsor_mail_outbox));
  assert.equal(
    await finishMail(
      staffAuthority,
      {
        id: a.sponsor_mail_outbox,
        leaseUntil: mailLeaseUntil(now),
      },
      { state: 'sent' },
      now
    ),
    'sent'
  );
}
