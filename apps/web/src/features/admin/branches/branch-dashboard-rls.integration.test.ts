import { describe, expect, it, vi } from 'vitest';

// Explicit runner: pnpm db:rls:test:staff-detail (scripts/staff-detail-rls.md), which runs this
// file after the staff-detail proof. R-06: the branch dashboard role checks (the admin-portal
// allow-list, a branch manager bound to its assigned branch id) proven on a real database,
// connected as the restricted runtime role. Only the session source, Sentry and one broken agent
// read (below) are replaced.
const enabled =
  process.env.S8_STAFF_DETAIL_DB_PROOF === '1' || process.env.REQUIRE_RLS_INTEGRATION === '1';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), captureException: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
// `getBranchAgents` queries a table named `claims`, which does not exist (the table is `claim`):
// a defect on base, outside this change, recorded as a follow-up. Only that one read is replaced,
// so the proof does not depend on it; the branch and stats reads run on the database.
vi.mock('@/actions/branch-dashboard.core', async importOriginal => ({
  ...(await importOriginal<typeof import('@/actions/branch-dashboard.core')>()),
  getBranchAgents: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  withServerActionInstrumentation: (
    _name: string,
    _options: unknown,
    action: () => Promise<unknown>
  ) => action(),
}));

describe.skipIf(!enabled)('branch dashboards with a restricted database role', () => {
  it('admit only the admin-portal roles and bind a branch manager to its branch id', async () => {
    // The web Vitest config supplies an inert DATABASE_URL for ordinary unit tests.
    // This opt-in proof uses the explicit local E2E database target instead.
    const adminConnectionUrl = process.env.E2E_DATABASE_URL!;
    const adminUrl = new URL(adminConnectionUrl);
    const rlsUrl = new URL(process.env.DATABASE_URL_RLS!);
    expect(adminUrl.hostname).toBe('127.0.0.1');
    expect(rlsUrl.hostname).toBe('127.0.0.1');
    expect(rlsUrl.username).not.toBe(adminUrl.username);
    expect(rlsUrl.pathname).toBe(adminUrl.pathname);
    // R-13: this proof writes, so both targets pass the guarded factory's check (a loopback
    // database or the confirmed CI container), as the driver reads them, before any client opens.
    const { assertDisposableUrl } =
      await import('../../../../../../packages/database/src/disposable-client');
    for (const url of [adminConnectionUrl, process.env.DATABASE_URL_RLS!]) assertDisposableUrl(url);
    vi.stubEnv('DATABASE_URL', adminConnectionUrl);

    const { branches, dbAdmin, inArray, sql, tenants } = await import('@interdomestik/database');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    await assertRlsConnectionRoleReady();
    const { mintTenantAuthority } = await import('@interdomestik/database/tenant-authority');
    const { getBranchDashboard } = await import('@/actions/branch-dashboard');
    const { getBranchDashboardV2Data } =
      await import('@/features/admin/branches/dashboard-v2/server/getBranchDashboardV2Data');

    const token = process.env.S8_STAFF_DETAIL_RUN_TOKEN!;
    expect(token).toMatch(/^[a-f0-9]{16}$/);
    const prefix = `branch-dash-${token}`;
    const tenantId = `${prefix}-ks`;
    const branch1 = `${prefix}-b1`;
    const branch2 = `${prefix}-b2`;
    // A sibling whose code is branch 1's id: a lookup by id or code would find both.
    const sibling = `${prefix}-sibling`;
    const branchIds = [branch1, branch2, sibling];

    /** The session and the authority minted from it, as `authorizeSessionTenant` pairs them. */
    const signIn = (role: string, branchId: string | null = null) => {
      const userId = `${prefix}-${role}`;
      mocks.authorize.mockResolvedValue({
        session: { user: { id: userId, role, tenantId, branchId, agentId: null } },
        authority: mintTenantAuthority({
          tenantId,
          accessTenantId: tenantId,
          purpose: 'test',
          principal: { userId, role, branchId, agentId: null },
        }),
      });
    };

    try {
      await dbAdmin.insert(tenants).values({
        id: tenantId,
        name: 'Branch dashboard proof',
        legalName: 'Branch dashboard proof',
        countryCode: 'XK',
      });
      await dbAdmin.insert(branches).values([
        { id: branch1, tenantId, name: 'Branch 1', slug: `${prefix}-1`, code: `${prefix}-c1` },
        { id: branch2, tenantId, name: 'Branch 2', slug: `${prefix}-2`, code: `${prefix}-c2` },
        { id: sibling, tenantId, name: 'Sibling', slug: `${prefix}-3`, code: branch1 },
      ]);

      signIn('staff');
      const posture = await withTenantAuthority(
        (await mocks.authorize()).authority,
        async tx =>
          await tx.execute<{ role: string; bypass: boolean; superuser: boolean }>(
            sql`select current_user as role, rolbypassrls as bypass, rolsuper as superuser
              from pg_roles where rolname = current_user`
          )
      );
      expect(posture[0]).toMatchObject({ role: rlsUrl.username, bypass: false, superuser: false });

      // F3: the action admits only the admin-portal roles (deny by default).
      for (const role of ['staff', 'member', 'agent', 'promoter']) {
        signIn(role);
        await expect(getBranchDashboard(branch1), role).resolves.toEqual({
          success: false,
          error: 'Insufficient permissions',
        });
      }
      // A branch manager reads its own branch only; a blank branch is no branch.
      signIn('branch_manager', branch1);
      const own = await getBranchDashboard(branch1);
      // An allowed read captures no exception; the captured error, if any, explains a failure.
      expect(mocks.captureException.mock.calls).toEqual([]);
      expect(own).toMatchObject({ success: true, data: { branch: { id: branch1 } } });
      await expect(getBranchDashboard(branch2)).resolves.toEqual({
        success: false,
        error: 'Access denied to this branch',
      });
      signIn('branch_manager', '  ');
      await expect(getBranchDashboard(branch1)).resolves.toEqual({
        success: false,
        error: 'Access denied to this branch',
      });
      // The tenant admin reads any branch of its tenant.
      signIn('tenant_admin');
      await expect(getBranchDashboard(branch2)).resolves.toMatchObject({
        success: true,
        data: { branch: { id: branch2 } },
      });

      // S3: the v2 loader. Staff is refused (null); a branch manager's assigned id binds the
      // exact row, never the sibling whose code equals it.
      signIn('staff');
      await expect(getBranchDashboardV2Data(branch1)).resolves.toBeNull();
      // The loader reports its refusals to Sentry; an allowed read reports nothing.
      signIn('branch_manager', branch1);
      mocks.captureException.mockClear();
      expect((await getBranchDashboardV2Data(branch1))?.branch.id).toBe(branch1);
      expect(mocks.captureException.mock.calls).toEqual([]);
      await expect(getBranchDashboardV2Data(sibling)).resolves.toBeNull();
      signIn('tenant_admin');
      mocks.captureException.mockClear();
      expect((await getBranchDashboardV2Data(branch2))?.branch.id).toBe(branch2);
      expect(mocks.captureException.mock.calls).toEqual([]);

      // Only the code matches: with branch 1 gone, its id is still the sibling's code. The
      // manager's lookup by id finds nothing (an id-or-code lookup would return the sibling),
      // while a tenant admin's lookup by code finds the sibling.
      await dbAdmin.delete(branches).where(inArray(branches.id, [branch1]));
      signIn('branch_manager', branch1);
      mocks.captureException.mockClear();
      await expect(getBranchDashboardV2Data(branch1)).resolves.toBeNull();
      expect(mocks.captureException.mock.calls).toEqual([]);
      signIn('tenant_admin');
      expect((await getBranchDashboardV2Data(branch1))?.branch.id).toBe(sibling);
      expect(mocks.captureException.mock.calls).toEqual([]);
    } finally {
      await dbAdmin.delete(branches).where(inArray(branches.id, branchIds));
      await dbAdmin.delete(tenants).where(inArray(tenants.id, [tenantId]));
      vi.unstubAllEnvs();
    }
  });
});
