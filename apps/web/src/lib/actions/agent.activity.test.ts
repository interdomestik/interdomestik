import { db } from '@interdomestik/database/db';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leadLookupPredicate, makeCredential } from './agent.test-support';
import { logActivity, registerMember } from './agent';
import { getAgentSession } from './agent/context';

const dbMock = db as unknown as {
  returning: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
};
vi.mock('./agent/context', () => ({
  getAgentSession: vi.fn(),
  getAgentAuthority: vi.fn(async () =>
    (await import('@interdomestik/database/testing/tenant-authority')).mintTestTenantAuthority(
      'tenant_mk'
    )
  ),
}));

vi.mock('./agent/register-member', () => ({
  registerMemberCore: vi.fn(),
}));

vi.mock('./agent/import-members.core', () => ({
  importMembersCore: vi.fn(),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn((session: { user?: { tenantId?: string | null } } | null) => {
    const tenantId = session?.user?.tenantId;
    if (!tenantId) {
      throw new Error('Missing tenantId');
    }
    return tenantId;
  }),
}));

vi.mock('@interdomestik/database/db', () => {
  const mockedDb = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        agentId: 'agent1',
        completedAt: null,
        createdAt: new Date('2026-05-10T08:00:00.000Z'),
        branchId: 'b1',
        id: 'test-id',
        leadId: 'lead1',
        occurredAt: new Date('2026-05-10T08:00:00.000Z'),
        scheduledAt: null,
        stage: 'contacted',
        summary: 'Called user',
        tenantId: 'tenant_mk',
        type: 'call',
      },
    ]),
    transaction: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    query: {
      crmLeads: {
        findFirst: vi.fn(),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({ branchId: 'b1' }),
      },
    },
  };
  mockedDb.transaction.mockImplementation(
    async (callback: (tx: typeof mockedDb) => Promise<unknown>) => callback(mockedDb)
  );
  return { db: mockedDb };
});

vi.mock('@interdomestik/database', async importOriginal => {
  const { db: mockedDb } = await import('@interdomestik/database/db');
  return {
    ...(await importOriginal<typeof import('@interdomestik/database')>()),
    withTenantContext: async (_context: unknown, callback: (tx: unknown) => unknown) =>
      callback(mockedDb),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  crmLeadOwnershipHistory: {
    agentId: { name: 'ownershipAgentId' },
    branchId: { name: 'ownershipBranchId' },
    changedById: { name: 'ownershipChangedById' },
    createdAt: { name: 'ownershipCreatedAt' },
    effectiveFrom: { name: 'ownershipEffectiveFrom' },
    effectiveTo: { name: 'ownershipEffectiveTo' },
    id: { name: 'ownershipId' },
    leadId: { name: 'ownershipLeadId' },
    reason: { name: 'ownershipReason' },
    tenantId: { name: 'ownershipTenantId' },
  },
  crmLeadStageHistory: {
    changedById: { name: 'historyChangedById' },
    createdAt: { name: 'historyCreatedAt' },
    fromStage: { name: 'historyFromStage' },
    id: { name: 'historyId' },
    leadId: { name: 'historyLeadId' },
    occurredAt: { name: 'historyOccurredAt' },
    tenantId: { name: 'historyTenantId' },
    toStage: { name: 'historyToStage' },
  },
  crmLeads: {
    id: { name: 'id' },
    agentId: { name: 'agentId' },
    branchId: { name: 'branchId' },
    lostAt: { name: 'lostAt' },
    stage: { name: 'stage' },
    tenantId: { name: 'tenantId' },
    updatedAt: { name: 'updatedAt' },
    wonAt: { name: 'wonAt' },
  },
  crmActivities: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
  user: { id: { name: 'userId' }, tenantId: { name: 'userTenantId' } },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  isNull: vi.fn((value: unknown) => ({ op: 'isNull', value })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) =>
      key.toLowerCase() === 'referer' ? 'https://example.test/en/agent/clients/new' : null,
  }),
}));

vi.mock('nanoid', async importOriginal => {
  const actual = await importOriginal<typeof import('nanoid')>();
  return {
    ...actual,
    nanoid: () => 'test-id',
    customAlphabet: () => () => 'ABCD',
  };
});

describe('agent actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logActivity', () => {
    it('should log activity', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent1',
        branchId: 'b1',
        tenantId: 'tenant_mk',
      });

      const result = await logActivity('lead1', 'call', 'Called user');
      expect(result).toEqual({ success: true });
      expect(ensureTenantId).toHaveBeenCalledWith({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      expect(db.query.crmLeads.findFirst).toHaveBeenCalledWith({
        where: leadLookupPredicate(),
      });
      expect(db.insert).toHaveBeenCalled();
      expect(dbMock.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_mk',
          leadId: 'lead1',
          agentId: 'agent1',
        })
      );
    });

    it('should reject missing tenant identity before logging activity', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: undefined },
      });

      const result = await logActivity('lead1', 'call', 'Called user');
      expect(result).toEqual({ error: 'Missing tenantId' });
      expect(db.query.crmLeads.findFirst).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should hide same-tenant lead ownership denials as not found when logging activity', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent2',
        branchId: 'b1',
        tenantId: 'tenant_mk',
      });

      const result = await logActivity('lead1', 'call', 'Called user');
      expect(result).toEqual({ error: 'Not found' });
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('registerMember', () => {
    it('should redirect to agent clients after registering member (locale-aware redirect wrapper)', async () => {
      const { getAgentSession } = await import('./agent/context');
      const { registerMemberCore } = await import('./agent/register-member');

      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', name: 'Agent', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });

      (registerMemberCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      const formData = new FormData();
      formData.set('fullName', 'P2-A-2026-02-13');
      formData.set('email', 'p2-a@example.test');
      formData.set('phone', '+38344111222');
      formData.set('password', makeCredential('registered-member'));
      formData.set('planId', 'standard');

      const result = await registerMember(null, formData);

      expect(result).toBeUndefined();
      expect(registerMemberCore).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent1' }),
        expect.anything(),
        'b1',
        formData
      );
      expect(redirect).toHaveBeenCalledWith('/en/agent/clients');
    });
  });
});
