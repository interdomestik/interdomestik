import { beforeEach, describe, expect, it, vi } from 'vitest';

// WP-02 owner decision B (2026-11-19): these four guards keep their plain `Error('Unauthorized')`
// until the next Tenant Guard admission converts them to the typed error. Each one must still
// refuse with that exact text and before any tenant read.
const mocks = vi.hoisted(() => ({
  withTenantAuthority: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  crmActivities: {},
  desc: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  db: { execute: (...args: unknown[]) => mocks.execute(...args) },
  agentClients: {},
  memberActivities: {},
  user: {},
}));

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (...args: unknown[]) => mocks.withTenantAuthority(...args),
}));

const session = { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } };

async function expectPlainUnauthorized(call: Promise<unknown>) {
  const error = await call.then(
    () => null,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).name).toBe('Error');
  expect((error as Error).message).toBe('Unauthorized');
  expect(mocks.withTenantAuthority).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
}

describe('the plain Unauthorized guards kept by decision B', () => {
  beforeEach(() => {
    mocks.withTenantAuthority.mockReset();
    mocks.execute.mockReset();
  });

  it('getLeadActivitiesCore refuses a missing session before any read', async () => {
    const { getLeadActivitiesCore } = await import('./get-lead');
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    await expectPlainUnauthorized(
      getLeadActivitiesCore({
        session: null,
        authority: mintTestTenantAuthority('tenant-1'),
        leadId: 'lead-1',
      })
    );
  });

  it('getLeadActivitiesCore refuses a missing tenant authority before any read', async () => {
    const { getLeadActivitiesCore } = await import('./get-lead');
    await expectPlainUnauthorized(
      getLeadActivitiesCore({ session, authority: null, leadId: 'lead-1' })
    );
  });

  it('getMemberActivitiesCore refuses a missing session before any read', async () => {
    const { getMemberActivitiesCore } = await import('./get-member');
    const { mintTestTenantAuthority } =
      await import('@interdomestik/database/testing/tenant-authority');
    await expectPlainUnauthorized(
      getMemberActivitiesCore({
        session: null,
        authority: mintTestTenantAuthority('tenant-1'),
        memberId: 'member-1',
      })
    );
  });

  it('getMemberActivitiesCore refuses a missing tenant authority before any read', async () => {
    const { getMemberActivitiesCore } = await import('./get-member');
    await expectPlainUnauthorized(
      getMemberActivitiesCore({ session, authority: null, memberId: 'member-1' })
    );
  });
});
