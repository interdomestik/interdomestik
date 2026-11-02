import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildImportRow,
  createRowsFormData,
  IMPORT_AGENT_SESSION,
  loadImportMembersAction,
} from './agent.test-support';
import { getAgentSession } from './agent/context';

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

  describe('importMembers', () => {
    it('returns unauthorized when bulk import runs without an agent session', async () => {
      const importMembers = await loadImportMembersAction();
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(importMembers(null, createRowsFormData([]))).resolves.toEqual({
        error: 'Unauthorized',
        summary: undefined,
        results: undefined,
      });
    });

    it('delegates bulk import to the core and returns the structured result', async () => {
      const importMembers = await loadImportMembersAction();
      const { importMembersCore } = await import('./agent/import-members.core');

      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        IMPORT_AGENT_SESSION
      );

      (importMembersCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'bulk@example.test', fullName: 'Bulk User', ok: true }],
      });

      await expect(
        importMembers(
          null,
          createRowsFormData([
            {
              ...buildImportRow(),
              fullName: 'Bulk User',
              email: 'bulk@example.test',
            },
          ])
        )
      ).resolves.toEqual({
        error: '',
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'bulk@example.test', fullName: 'Bulk User', ok: true }],
      });
      expect(importMembersCore).toHaveBeenCalledWith(
        expect.objectContaining({ authority: expect.anything() })
      );
    });

    it('rejects oversized batches before the import core is called', async () => {
      const importMembers = await loadImportMembersAction();
      const { importMembersCore } = await import('./agent/import-members.core');
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        IMPORT_AGENT_SESSION
      );

      const rows = Array.from({ length: 201 }, (_, index) => buildImportRow(index));

      await expect(importMembers(null, createRowsFormData(rows))).resolves.toEqual({
        error: 'Validation failed',
        summary: undefined,
        results: undefined,
      });
      expect(importMembersCore).not.toHaveBeenCalled();
    });
  });
});
