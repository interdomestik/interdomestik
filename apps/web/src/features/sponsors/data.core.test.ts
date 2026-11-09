import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, memberLeads, tenantSettings } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ROLES } from '@interdomestik/shared-auth';
import { companyLeads, sponsorUploadEnabled, termOptions } from './data.core';
import { context } from './test-fixtures';

const mocks = vi.hoisted(() => ({
  leadReader: vi.fn(),
  leads: vi.fn(),
  plans: vi.fn(),
  entities: vi.fn(),
  setting: vi.fn(),
}));
vi.mock('@/app/[locale]/(agent)/agent/leads/_core', () => ({
  getAgentLeadsCore: mocks.leadReader,
}));
vi.mock('@/app/[locale]/(agent)/agent/_layout.core', () => ({ getAgentTier: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      query: {
        memberLeads: { findMany: mocks.leads },
        membershipPlans: { findMany: mocks.plans },
        legalEntities: { findMany: mocks.entities },
        tenantSettings: { findFirst: mocks.setting },
      },
    }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  const leads = [
    { id: 'eligible', leadKind: 'company', companyName: 'Company', status: 'new' },
    { id: 'lost', leadKind: 'company', status: 'lost' },
    { id: 'disqualified', leadKind: 'company', status: 'disqualified' },
    { id: 'expired', leadKind: 'company', status: 'expired' },
    { id: 'individual', leadKind: 'individual', status: 'new' },
  ];
  mocks.leads.mockResolvedValue(leads);
  mocks.leadReader.mockResolvedValue(leads);
  mocks.plans.mockResolvedValue([{ id: 'plan', name: 'Standard' }]);
  mocks.entities.mockResolvedValue([{ id: 'entity', legalName: 'Entity' }]);
});

describe('sponsor option readers', () => {
  it('reuses the agent lead reader inside tenant authority and filters company eligibility', async () => {
    const agent = {
      ...context,
      actor: { ...context.actor, role: ROLES.agent, agentTier: 'office' },
    };
    expect(await companyLeads(agent)).toEqual([{ id: 'eligible', label: 'Company' }]);
    expect(mocks.leadReader).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', agentId: 'staff-1', branchId: 'branch-1' },
      expect.objectContaining({ db: expect.any(Object) })
    );
    expect(mocks.leads).not.toHaveBeenCalled();
  });
  it('scopes branch manager leads to their branch and tenant', async () => {
    await companyLeads({ ...context, actor: { ...context.actor, role: ROLES.branch_manager } });
    const args = mocks.leads.mock.calls[0]?.[0] as {
      where: (table: typeof memberLeads, operators: { and: typeof and; eq: typeof eq }) => SQL;
    };
    const query = new PgDialect().sqlToQuery(args.where(memberLeads, { and, eq }));
    expect(query.params).toEqual(['tenant-1', 'branch-1']);
  });
  it('loads plans and entities and refuses unprivileged reads', async () => {
    expect(await termOptions(context)).toEqual({
      plans: [{ id: 'plan', label: 'Standard' }],
      entities: [{ id: 'entity', label: 'Entity' }],
    });
    const denied = { ...context, actor: { ...context.actor, role: ROLES.auditor } };
    mocks.leads.mockClear();
    mocks.plans.mockClear();
    mocks.entities.mockClear();
    expect(await companyLeads(denied)).toEqual([]);
    expect(await termOptions(denied)).toEqual({ plans: [], entities: [] });
    expect(await sponsorUploadEnabled(denied)).toBe(false);
    expect(mocks.leads).not.toHaveBeenCalled();
    expect(mocks.plans).not.toHaveBeenCalled();
    expect(mocks.entities).not.toHaveBeenCalled();
    expect(mocks.setting).not.toHaveBeenCalled();
  });
  it('reads the exact tenant switch and defaults dark for missing or malformed settings', async () => {
    for (const setting of [
      undefined,
      { value: {} },
      { value: { enabled: 'true' } },
      { value: { enabled: false } },
    ]) {
      mocks.setting.mockResolvedValue(setting);
      expect(await sponsorUploadEnabled(context)).toBe(false);
    }
    mocks.setting.mockResolvedValue({ value: { enabled: true } });
    expect(await sponsorUploadEnabled(context)).toBe(true);
    const args = mocks.setting.mock.calls[0]?.[0] as {
      where: (table: typeof tenantSettings, operators: { and: typeof and; eq: typeof eq }) => SQL;
    };
    expect(new PgDialect().sqlToQuery(args.where(tenantSettings, { and, eq })).params).toEqual([
      'tenant-1',
      'acquisition',
      'sponsored_import',
    ]);
  });
});
