import { describe, expect, it } from 'vitest';

const enabled = process.env.CRM003_DUPLICATE_DB_PROOF === '1';

/**
 * Opt-in database proof for IDA-CRM-003: discover and resolve against real PostgreSQL under a
 * restricted NOBYPASSRLS role, with truly concurrent resolutions (DB_MAX_CONNECTIONS > 1).
 * Fixtures use fresh tenants per run. The web Vitest config supplies an inert DATABASE_URL, so
 * the proof points the database module at its explicit loopback targets before importing it.
 */
describe.skipIf(!enabled)('duplicate referral review against PostgreSQL', () => {
  it('scopes discovery, resolves once under concurrency and keeps the winner', async () => {
    const adminUrl = new URL(process.env.CRM003_ADMIN_DATABASE_URL!);
    const rlsUrl = new URL(process.env.CRM003_RLS_DATABASE_URL!);
    expect(adminUrl.hostname).toBe('127.0.0.1');
    expect(rlsUrl.hostname).toBe('127.0.0.1');
    expect(rlsUrl.username).not.toBe(adminUrl.username);
    expect(Number(process.env.DB_MAX_CONNECTIONS)).toBeGreaterThan(1);
    process.env.DATABASE_URL = adminUrl.toString();
    process.env.DATABASE_URL_RLS = rlsUrl.toString();

    const { auditLog, branches, dbAdmin, eq, inArray, memberLeads, sql, tenants, user } =
      await import('@interdomestik/database');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    const { listDuplicateReferrals } = await import('./list-duplicate-referrals');
    const { duplicateResolutionId, resolveDuplicateReferralCore } =
      await import('./duplicate-resolution');

    const run = `crm003-${Date.now().toString(36)}`;
    const [tenantA, tenantB] = [`${run}-ta`, `${run}-tb`];
    const [branch1, branch2, foreignBranch] = [`${run}-b1`, `${run}-b2`, `${run}-bf`];
    const [agent, admin, manager1, manager2, foreignAgent] = [
      `${run}-agent`,
      `${run}-admin`,
      `${run}-bm1`,
      `${run}-bm2`,
      `${run}-fagent`,
    ];
    const now = new Date('2026-11-07T10:00:00.000Z');
    const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
    const people = [
      [agent, tenantA, 'agent', branch1],
      [admin, tenantA, 'tenant_admin', null],
      [manager1, tenantA, 'branch_manager', branch1],
      [manager2, tenantA, 'branch_manager', branch2],
      [foreignAgent, tenantB, 'agent', foreignBranch],
    ] as const;
    const referral = (id: string, tenantId: string, leadId: string | null, submitting: string) => ({
      id: `${run}-${id}`,
      tenantId,
      actorId: tenantId === tenantA ? agent : foreignAgent,
      actorRole: 'agent',
      action: 'AGENT_LEAD_POSSIBLE_DUPLICATE',
      entityType: 'member_lead',
      entityId: leadId,
      metadata: { submittingBranchId: submitting, review: 'pending' },
      createdAt: at(Number(id.slice(1))),
    });
    const ctx = (role: string, userId: string, branchId: string | null, tenantId = tenantA) => ({
      authority: mintTestTenantAuthority(tenantId, { userId, role }),
      userRole: role,
      scope: { branchId },
      actorId: userId,
    });
    const ids = (rows: { referralId: string }[]) =>
      rows.map(row => row.referralId.slice(run.length + 1));

    try {
      await dbAdmin
        .insert(tenants)
        .values([tenantA, tenantB].map(id => ({ id, name: id, legalName: id, countryCode: 'XK' })));
      await dbAdmin.insert(branches).values([
        { id: branch1, tenantId: tenantA, name: 'B1', slug: `${run}-b1` },
        { id: branch2, tenantId: tenantA, name: 'B2', slug: `${run}-b2` },
        { id: foreignBranch, tenantId: tenantB, name: 'BF', slug: `${run}-bf` },
      ]);
      await dbAdmin.insert(user).values(
        people.map(([id, tenantId, role, branchId]) => ({
          id,
          tenantId,
          role,
          branchId,
          name: id,
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        }))
      );
      const lead = (id: string, tenantId: string, branchId: string, agentId: string) => ({
        id: `${run}-${id}`,
        tenantId,
        branchId,
        agentId,
        firstName: 'Fixture',
        lastName: id,
        email: `${run}-${id}@example.test`,
        phone: '+38344000000',
        consentNoticeVersion: 'lead-notice-v1',
        captureChannel: 'agent_assisted' as const,
        consentCapturedAt: now,
        consentCapturedBy: agentId,
      });
      await dbAdmin
        .insert(memberLeads)
        .values([
          lead('l1', tenantA, branch1, agent),
          lead('l2', tenantA, branch2, agent),
          lead('lf', tenantB, foreignBranch, foreignAgent),
        ]);
      await dbAdmin.insert(auditLog).values([
        referral('r1', tenantA, `${run}-l1`, branch1), // own branch for manager 1
        referral('r2', tenantA, `${run}-l2`, branch1), // cross-branch: tenant reviewers only
        referral('r3', tenantA, null, branch1), // lead gone: tenant reviewers only
        referral('r4', tenantB, `${run}-lf`, foreignBranch), // another tenant
      ]);

      const adminCtx = ctx('tenant_admin', admin, null);
      const posture = await withTenantAuthority(adminCtx.authority, tx =>
        tx.execute<{ role: string; bypass: boolean; superuser: boolean }>(
          sql`select current_user as role, rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = current_user`
        )
      );
      expect(posture[0]).toMatchObject({ role: rlsUrl.username, bypass: false, superuser: false });
      const bm1 = ctx('branch_manager', manager1, branch1);
      const bm2 = ctx('branch_manager', manager2, branch2);

      // Discovery: a drainable FIFO queue, scoped by tenant and by both branches for managers.
      expect(ids(await listDuplicateReferrals(adminCtx))).toEqual(['r1', 'r2', 'r3']);
      expect(ids(await listDuplicateReferrals(bm1))).toEqual(['r1']);
      expect(ids(await listDuplicateReferrals(bm2))).toEqual([]);
      await expect(listDuplicateReferrals(ctx('staff', agent, branch1))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      // A manager cannot resolve what discovery hides, and a foreign tenant's referral is unknown.
      await expect(
        resolveDuplicateReferralCore(bm1, { referralId: `${run}-r2`, outcome: 'dismissed' })
      ).resolves.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        resolveDuplicateReferralCore(adminCtx, { referralId: `${run}-r4`, outcome: 'dismissed' })
      ).resolves.toMatchObject({ code: 'NOT_FOUND' });

      // A resolution whose transaction rolls back leaves the referral pending and its id free.
      const resolutionRow = (referralId: string, entityType: string) => ({
        id: duplicateResolutionId(tenantA, referralId),
        tenantId: tenantA,
        actorId: admin,
        actorRole: 'tenant_admin',
        action: 'AGENT_LEAD_DUPLICATE_RESOLVED',
        entityType,
        entityId: referralId,
        metadata: { outcome: 'dismissed' },
        createdAt: now,
      });
      await expect(
        withTenantAuthority(adminCtx.authority, async tx => {
          await tx.insert(auditLog).values(resolutionRow(`${run}-r3`, 'lead_duplicate_referral'));
          throw new Error('rollback after the resolution insert');
        })
      ).rejects.toThrow('rollback after the resolution insert');
      expect(ids(await listDuplicateReferrals(adminCtx))).toEqual(['r1', 'r2', 'r3']);

      // Concurrent identical resolutions: one row, one first writer, the rest replay it.
      const same = await Promise.all(
        Array.from({ length: 6 }, () =>
          resolveDuplicateReferralCore(adminCtx, { referralId: `${run}-r3`, outcome: 'dismissed' })
        )
      );
      expect(same.every(result => result.success)).toBe(true);
      expect(same.filter(result => result.success && !result.data?.alreadyResolved)).toHaveLength(
        1
      );

      // Concurrent conflicting resolutions: one winner; every loser is refused, not overwritten.
      const conflicting = await Promise.all(
        (['kept_existing', 'dismissed', 'kept_existing', 'dismissed'] as const).map(outcome =>
          resolveDuplicateReferralCore(outcome === 'dismissed' ? bm1 : adminCtx, {
            referralId: `${run}-r1`,
            outcome,
          })
        )
      );
      const winners = conflicting.filter(result => result.success);
      expect(new Set(winners.map(result => result.success && result.data?.outcome)).size).toBe(1);
      expect(conflicting.filter(result => !result.success)).toEqual(
        Array.from({ length: conflicting.length - winners.length }, () =>
          expect.objectContaining({ code: 'ALREADY_RESOLVED' })
        )
      );

      const resolutions = await dbAdmin
        .select()
        .from(auditLog)
        .where(inArray(auditLog.entityId, [`${run}-r1`, `${run}-r3`]));
      expect(resolutions).toHaveLength(2);
      expect(resolutions.every(row => row.action === 'AGENT_LEAD_DUPLICATE_RESOLVED')).toBe(true);

      // A lost response retried later replays the stored outcome.
      const winner = winners[0];
      const winningOutcome = winner?.success ? winner.data?.outcome : undefined;
      if (!winningOutcome) throw new Error('expected a winning resolution');
      await expect(
        resolveDuplicateReferralCore(adminCtx, {
          referralId: `${run}-r1`,
          outcome: winningOutcome,
        })
      ).resolves.toMatchObject({ success: true, data: { alreadyResolved: true } });

      // The queue drains; the resolved view shows the closures with their outcome.
      expect(ids(await listDuplicateReferrals(adminCtx))).toEqual(['r2']);
      expect(ids(await listDuplicateReferrals(adminCtx, 'resolved')).sort()).toEqual(['r1', 'r3']);
      expect(ids(await listDuplicateReferrals(bm1, 'resolved'))).toEqual(['r1']);

      // A stored row in the resolution slot with another entity type is never accepted as the
      // winner: the resolve is refused and the referral stays pending.
      await dbAdmin.insert(auditLog).values(resolutionRow(`${run}-r2`, 'unrelated_entity'));
      await expect(
        resolveDuplicateReferralCore(adminCtx, { referralId: `${run}-r2`, outcome: 'dismissed' })
      ).resolves.toMatchObject({ success: false, code: 'ALREADY_RESOLVED' });
      expect(ids(await listDuplicateReferrals(adminCtx))).toEqual(['r2']);

      // Moving the lead out of the manager's branch withdraws visibility and resolution.
      await dbAdmin
        .update(memberLeads)
        .set({ branchId: branch1 })
        .where(eq(memberLeads.id, `${run}-l2`));
      expect(ids(await listDuplicateReferrals(bm1))).toEqual(['r2']);
      await dbAdmin
        .update(memberLeads)
        .set({ branchId: branch2 })
        .where(eq(memberLeads.id, `${run}-l2`));
      expect(ids(await listDuplicateReferrals(bm1))).toEqual([]);
      await expect(
        resolveDuplicateReferralCore(bm1, { referralId: `${run}-r2`, outcome: 'dismissed' })
      ).resolves.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await dbAdmin.delete(auditLog).where(inArray(auditLog.tenantId, [tenantA, tenantB]));
      await dbAdmin.delete(memberLeads).where(inArray(memberLeads.tenantId, [tenantA, tenantB]));
      await dbAdmin.delete(user).where(inArray(user.tenantId, [tenantA, tenantB]));
      await dbAdmin.delete(branches).where(inArray(branches.tenantId, [tenantA, tenantB]));
      await dbAdmin.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    }
  }, 60_000);
});
