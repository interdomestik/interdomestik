import { describe, expect, it, vi } from 'vitest';

// The staff-detail runner checks the disposable target and provisions the restricted login.
const enabled =
  process.env.S8_STAFF_DETAIL_DB_PROOF === '1' || process.env.REQUIRE_RLS_INTEGRATION === '1';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), captureException: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

describe.skipIf(!enabled)('refusal audit with a restricted database role', () => {
  it('records one production action refusal in the session access tenant', async () => {
    const adminUrl = new URL(process.env.E2E_DATABASE_URL!);
    const runtimeUrl = new URL(process.env.DATABASE_URL_RLS!);
    expect(adminUrl.hostname).toBe('127.0.0.1');
    expect(runtimeUrl.host).toBe(adminUrl.host);
    expect(runtimeUrl.pathname).toBe(adminUrl.pathname);
    expect(runtimeUrl.username).not.toBe(adminUrl.username);
    // R-13: this proof writes, so both targets pass the guarded factory's check (a loopback
    // database or the confirmed CI container), as the driver reads them, before any client opens.
    const { assertDisposableUrl } =
      await import('../../../../packages/database/src/disposable-client');
    for (const url of [process.env.E2E_DATABASE_URL!, process.env.DATABASE_URL_RLS!]) {
      assertDisposableUrl(url);
    }
    // Override the web unit config's inert URL before the database modules load.
    vi.stubEnv('DATABASE_URL', adminUrl.href);

    const { and, auditLog, dbAdmin, eq, inArray, sql, tenants, user } =
      await import('@interdomestik/database');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    const { getMemberNotes } = await import('@/actions/member-notes');

    const token = process.env.S8_STAFF_DETAIL_RUN_TOKEN!;
    expect(token).toMatch(/^[a-f0-9]{16}$/);
    const accessTenantId = `refusal-audit-${token}-access`;
    const homeTenantId = `refusal-audit-${token}-home`;
    const actorId = `refusal-audit-${token}-actor`;
    const operation = 'memberNotes.list';
    const actor = {
      id: actorId,
      tenantId: homeTenantId,
      name: 'Refusal audit fixture',
      email: `${actorId}@example.test`,
      role: 'member',
    };
    const accessAuthority = mintTestTenantAuthority(accessTenantId);
    const homeAuthority = mintTestTenantAuthority(homeTenantId);
    const byRefusal = and(
      eq(auditLog.actorId, actorId),
      eq(auditLog.action, 'action.refused'),
      eq(auditLog.entityId, operation)
    );

    try {
      await dbAdmin.insert(tenants).values([
        {
          id: accessTenantId,
          name: 'Access fixture',
          legalName: 'Access fixture',
          countryCode: 'XK',
        },
        { id: homeTenantId, name: 'Home fixture', legalName: 'Home fixture', countryCode: 'MK' },
      ]);
      const now = new Date();
      await dbAdmin
        .insert(user)
        .values({ ...actor, emailVerified: true, createdAt: now, updatedAt: now });
      mocks.getSession.mockResolvedValue({ user: { ...actor, accessTenantId }, session: {} });

      const posture = await withTenantAuthority(accessAuthority, tx =>
        tx.execute<{ role: string; bypass: boolean; superuser: boolean }>(
          sql`select current_user as role, rolbypassrls as bypass, rolsuper as superuser
              from pg_roles where rolname = current_user`
        )
      );
      expect(posture[0]).toEqual({ role: runtimeUrl.username, bypass: false, superuser: false });
      await expect(getMemberNotes({ memberId: actorId })).resolves.toEqual({
        success: false,
        code: 'FORBIDDEN',
        error: 'Forbidden',
      });
      expect(mocks.captureException).not.toHaveBeenCalled();

      const rows = await withTenantAuthority(accessAuthority, async tx =>
        tx.select().from(auditLog).where(byRefusal)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId,
        actorRole: 'member',
        tenantId: accessTenantId,
        action: 'action.refused',
        entityType: 'server_action',
        entityId: operation,
      });
      expect(rows[0]?.metadata).toEqual({
        code: 'FORBIDDEN',
        basis: 'role',
        subject: { type: 'member', id: actorId },
      });
      const allRows = await dbAdmin.select({ id: auditLog.id }).from(auditLog).where(byRefusal);
      expect(allRows).toEqual([{ id: rows[0]?.id }]);
      const hiddenRows = await withTenantAuthority(homeAuthority, async tx =>
        tx.select({ id: auditLog.id }).from(auditLog).where(byRefusal)
      );
      expect(hiddenRows).toEqual([]);
    } finally {
      await dbAdmin.delete(auditLog).where(eq(auditLog.actorId, actorId));
      await dbAdmin.delete(user).where(eq(user.id, actorId));
      await dbAdmin.delete(tenants).where(inArray(tenants.id, [accessTenantId, homeTenantId]));
      vi.unstubAllEnvs();
    }
  });
});
