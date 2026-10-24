import { describe, expect, it } from 'vitest';

const enabled = process.env.S8_STAFF_DETAIL_DB_PROOF === '1';

describe.skipIf(!enabled)('mounted staff detail with a restricted database role', () => {
  it('reads attributed history, denies other assignments and tenants, and clears tenant context', async () => {
    // The web Vitest config supplies an inert DATABASE_URL for ordinary unit tests.
    // This opt-in proof uses the explicit local E2E database target instead.
    const adminConnectionUrl = process.env.E2E_DATABASE_URL!;
    const adminUrl = new URL(adminConnectionUrl);
    const rlsUrl = new URL(process.env.DATABASE_URL_RLS!);
    expect(adminUrl.hostname).toBe('127.0.0.1');
    expect(rlsUrl.hostname).toBe('127.0.0.1');
    expect(rlsUrl.username).not.toBe(adminUrl.username);
    expect(rlsUrl.pathname).toBe(adminUrl.pathname);
    expect(process.env.DATABASE_URL).toBe(adminConnectionUrl);
    expect(process.env.DB_MAX_CONNECTIONS).toBe('1');

    const { claimStageHistory, claims, dbAdmin, dbRls, inArray, sql, user, withTenantContext } =
      await import('@interdomestik/database');
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    await assertRlsConnectionRoleReady();
    const { getStaffClaimDetail } = await import('@interdomestik/domain-claims');
    const { getPublicStatusHistoryCore, getStaffClaimDetailsCore } = await import('./_core');

    const token = process.env.S8_STAFF_DETAIL_RUN_TOKEN!;
    expect(token).toMatch(/^[a-f0-9]{16}$/);
    const prefix = `s8-staff-detail-${token}`;
    const staffId = `${prefix}-staff`;
    const otherStaffId = `${prefix}-other-staff`;
    const memberId = `${prefix}-member`;
    const foreignMemberId = `${prefix}-foreign-member`;
    const assignedClaimId = `${prefix}-assigned`;
    const otherClaimId = `${prefix}-other`;
    const foreignClaimId = `${prefix}-foreign`;
    const publicHistoryId = `${prefix}-public`;
    const privateHistoryId = `${prefix}-private`;
    const foreignHistoryId = `${prefix}-foreign-history`;
    const now = new Date('2026-01-02T00:00:00.000Z');
    const userIds = [staffId, otherStaffId, memberId, foreignMemberId];
    const claimIds = [assignedClaimId, otherClaimId, foreignClaimId];
    const historyIds = [publicHistoryId, privateHistoryId, foreignHistoryId];

    try {
      const posture = await withTenantContext({ tenantId: 'tenant_ks', role: 'staff' }, tx =>
        tx.execute<{ role: string; bypass: boolean; superuser: boolean }>(
          sql`select current_user as role, rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = current_user`
        )
      );
      expect(posture[0]).toMatchObject({ bypass: false, superuser: false });
      expect(posture[0]?.role).toBe(rlsUrl.username);

      await dbAdmin.insert(user).values([
        {
          id: staffId,
          tenantId: 'tenant_ks',
          name: 'Fixture Staff',
          email: `${staffId}@example.test`,
          emailVerified: true,
          role: 'staff',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: otherStaffId,
          tenantId: 'tenant_ks',
          name: 'Fixture Other Staff',
          email: `${otherStaffId}@example.test`,
          emailVerified: true,
          role: 'staff',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: memberId,
          tenantId: 'tenant_ks',
          name: 'Fixture Member',
          email: `${memberId}@example.test`,
          emailVerified: true,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: foreignMemberId,
          tenantId: 'tenant_mk',
          name: 'Foreign Fixture Member',
          email: `${foreignMemberId}@example.test`,
          emailVerified: true,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await dbAdmin.insert(claims).values([
        {
          id: assignedClaimId,
          tenantId: 'tenant_ks',
          userId: memberId,
          staffId,
          title: 'Assigned fixture',
          category: 'retail',
          companyName: 'Fixture',
        },
        {
          id: otherClaimId,
          tenantId: 'tenant_ks',
          userId: memberId,
          staffId: otherStaffId,
          title: 'Other assignment fixture',
          category: 'retail',
          companyName: 'Fixture',
        },
        {
          id: foreignClaimId,
          tenantId: 'tenant_mk',
          userId: foreignMemberId,
          staffId,
          title: 'Foreign fixture',
          category: 'retail',
          companyName: 'Fixture',
        },
      ]);
      await dbAdmin.insert(claimStageHistory).values([
        {
          id: publicHistoryId,
          tenantId: 'tenant_ks',
          claimId: assignedClaimId,
          toStatus: 'submitted',
          changedById: otherStaffId,
          changedByRole: 'staff',
          note: 'Public fixture note',
          isPublic: true,
          createdAt: now,
        },
        {
          id: privateHistoryId,
          tenantId: 'tenant_ks',
          claimId: assignedClaimId,
          toStatus: 'submitted',
          changedById: otherStaffId,
          changedByRole: 'staff',
          note: 'Private fixture note',
          isPublic: false,
          createdAt: now,
        },
        {
          id: foreignHistoryId,
          tenantId: 'tenant_mk',
          claimId: foreignClaimId,
          toStatus: 'submitted',
          changedById: foreignMemberId,
          changedByRole: 'member',
          note: 'Foreign fixture note',
          isPublic: true,
          createdAt: now,
        },
      ]);

      const detail = await getStaffClaimDetail({
        claimId: assignedClaimId,
        staffId,
        tenantId: 'tenant_ks',
      });
      expect(detail?.member).toMatchObject({ id: memberId, fullName: 'Fixture Member' });

      const mountedDetail = await getStaffClaimDetailsCore({
        claimId: assignedClaimId,
        role: 'staff',
        staffId,
        tenantId: 'tenant_ks',
      });
      expect(mountedDetail.kind).toBe('ok');
      if (mountedDetail.kind === 'ok') {
        expect(mountedDetail.claim).toMatchObject({ user: { id: memberId } });
        expect(mountedDetail.stageHistory).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: publicHistoryId,
              changedByName: 'Fixture Other Staff',
              changedByEmail: `${otherStaffId}@example.test`,
            }),
          ])
        );
      }

      const publicHistory = await getPublicStatusHistoryCore({
        claimId: assignedClaimId,
        role: 'staff',
        tenantId: 'tenant_ks',
      });
      expect(publicHistory.map(entry => entry.id)).toEqual([publicHistoryId]);
      expect(publicHistory[0]?.note).toBe('Public fixture note');

      expect(
        await getStaffClaimDetail({ claimId: otherClaimId, staffId, tenantId: 'tenant_ks' })
      ).toBeNull();
      expect(
        await getStaffClaimDetail({ claimId: foreignClaimId, staffId, tenantId: 'tenant_ks' })
      ).toBeNull();
      expect(
        await getStaffClaimDetail({
          branchId: 'branch-not-assigned',
          claimId: assignedClaimId,
          staffId,
          tenantId: 'tenant_ks',
        })
      ).toBeNull();
      expect(
        await getStaffClaimDetailsCore({
          claimId: otherClaimId,
          role: 'staff',
          staffId,
          tenantId: 'tenant_ks',
        })
      ).toEqual({ kind: 'not_found' });
      expect(
        await getStaffClaimDetailsCore({
          claimId: foreignClaimId,
          role: 'staff',
          staffId,
          tenantId: 'tenant_ks',
        })
      ).toEqual({ kind: 'not_found' });
      expect(
        await getPublicStatusHistoryCore({
          claimId: foreignClaimId,
          role: 'staff',
          tenantId: 'tenant_ks',
        })
      ).toEqual([]);

      // This reader is called only after page admission. Switching tenants in a
      // separate transaction must reveal only that tenant's own public row.
      const foreignHistory = await getPublicStatusHistoryCore({
        claimId: foreignClaimId,
        role: 'staff',
        tenantId: 'tenant_mk',
      });
      expect(foreignHistory.map(entry => entry.id)).toEqual([foreignHistoryId]);

      const after = await dbRls.execute<{ tenant: string | null }>(
        sql`select nullif(current_setting('app.current_tenant_id', true), '') as tenant`
      );
      expect(after[0]?.tenant).toBeNull();
    } finally {
      await dbAdmin.delete(claimStageHistory).where(inArray(claimStageHistory.id, historyIds));
      await dbAdmin.delete(claims).where(inArray(claims.id, claimIds));
      await dbAdmin.delete(user).where(inArray(user.id, userIds));
    }
  });
});
