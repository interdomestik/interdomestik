import type { TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { TenantLocaleMetadata } from '@interdomestik/database/tenant-directory';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// Reuse the migrated loopback DB and restricted LOGIN from scripts/staff-detail-rls.md.
// With E2E_DATABASE_URL and DATABASE_URL_RLS supplied, run from apps/web:
// S1_MEMBER_DETAIL_DB_PROOF=1 pnpm exec vitest run --maxWorkers=1 --no-file-parallelism \
//   --testTimeout=30000 src/features/claims/tracking/server/member-detail-pool.integration.test.ts
const enabled = process.env.S1_MEMBER_DETAIL_DB_PROOF === '1';
const trace = vi.hoisted(() => ({ held: false, events: [] as string[] }));

vi.mock('@sentry/nextjs', () => ({
  setTag: (): void => undefined,
  withServerActionInstrumentation: async <T>(
    _name: string,
    _options: unknown,
    action: () => Promise<T>
  ): Promise<T> => action(),
}));
vi.mock('@interdomestik/database/tenant-directory', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-directory')>();
  return {
    ...actual,
    readTenantLocaleMetadata: async (tenantId: string): Promise<TenantLocaleMetadata | null> => {
      expect(trace.held).toBe(false);
      trace.events.push('directory-start');
      const metadata = await actual.readTenantLocaleMetadata(tenantId);
      trace.events.push('directory-complete');
      return metadata;
    },
  };
});
vi.mock('@interdomestik/database/tenant-authority-context', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/database/tenant-authority-context')>();
  return {
    ...actual,
    withTenantAuthority: async <T>(
      authority: TenantAuthority,
      action: (tx: TenantTransaction) => Promise<T>
    ): Promise<T> =>
      actual.withTenantAuthority(authority, async tx => {
        trace.held = true;
        trace.events.push('transaction-open');
        try {
          return await action(tx);
        } finally {
          trace.events.push('transaction-close');
          trace.held = false;
        }
      }),
  };
});

describe.skipIf(!enabled)('member detail with separate single-connection SQL pools', () => {
  it('finishes directory I/O before the restricted transaction and preserves visibility', async () => {
    const adminUrl = new URL(process.env.E2E_DATABASE_URL!);
    const rlsUrl = new URL(process.env.DATABASE_URL_RLS!);
    for (const target of [adminUrl, rlsUrl]) {
      expect(target.hostname).toBe('127.0.0.1');
      expect(
        target.pathname === '/interdomestik_test' ||
          (target.pathname === '/postgres' && target.port === '54322')
      ).toBe(true);
    }
    expect(rlsUrl.pathname).toBe(adminUrl.pathname);
    expect(rlsUrl.port).toBe(adminUrl.port);
    expect(rlsUrl.username).not.toBe(adminUrl.username);
    vi.stubEnv('DATABASE_URL', adminUrl.toString());
    vi.stubEnv('DB_MAX_CONNECTIONS', '1');
    vi.stubEnv('REQUIRE_RLS_INTEGRATION', '1');

    const { dbAdmin, dbRls, claims, tenants, user, eq, sql } =
      await import('@interdomestik/database');
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    const { getMemberClaimDetail } = await import('./getMemberClaimDetail');
    await assertRlsConnectionRoleReady();

    const prefix = `s1-member-pool-${randomUUID()}`;
    const tenantId = `${prefix}-tenant`;
    const memberId = `${prefix}-member`;
    const claimId = `${prefix}-claim`;
    const authority = mintTestTenantAuthority(tenantId, { userId: memberId, role: 'member' });
    const session = { user: { id: memberId, role: 'member', tenantId } };

    try {
      // A unique directory code avoids changing the existing MK row in a seeded DB.
      // The unit matrix separately exercises MK's document/consent reads and display.
      await dbAdmin
        .insert(tenants)
        .values({ id: tenantId, name: prefix, legalName: prefix, code: prefix, countryCode: 'MK' });
      await dbAdmin.insert(user).values({
        id: memberId,
        tenantId,
        name: 'Pool fixture member',
        email: `${memberId}@example.test`,
        emailVerified: true,
        role: 'member',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      await dbAdmin.insert(claims).values({
        id: claimId,
        tenantId,
        userId: memberId,
        title: 'Pool fixture claim',
        category: 'vehicle',
        companyName: 'Fixture',
        caseLifecycleState: 'submitted',
      });
      trace.events = [];

      const detail = await getMemberClaimDetail(session, authority, claimId);

      expect(detail?.id).toBe(claimId);
      expect(detail?.vaultConsentDisplay).toEqual({ kind: 'hidden' });
      expect(trace.events).toEqual([
        'directory-start',
        'directory-complete',
        'transaction-open',
        'transaction-close',
      ]);
      expect(
        await getMemberClaimDetail(
          { user: { ...session.user, id: `${prefix}-other` } },
          authority,
          claimId
        )
      ).toBeNull();
      const after = await dbRls.execute<{ tenant: string | null }>(
        sql`select nullif(current_setting('app.current_tenant_id', true), '') as tenant`
      );
      expect(after[0]?.tenant).toBeNull();
    } finally {
      await dbAdmin.delete(claims).where(eq(claims.id, claimId));
      await dbAdmin.delete(user).where(eq(user.id, memberId));
      await dbAdmin.delete(tenants).where(eq(tenants.id, tenantId));
      vi.unstubAllEnvs();
    }
  });
});
