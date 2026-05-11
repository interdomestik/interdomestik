import { db } from '@interdomestik/database/db';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLead, logActivity, registerMember, updateLeadStatus } from './agent';
import { getAgentSession } from './agent/context';

const IMPORT_AGENT_SESSION = {
  user: { id: 'agent1', name: 'Agent', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
} as const;

const dbMock = db as unknown as {
  returning: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
};

function makeCredential(label: string) {
  return ['member', label, 'access'].join('-');
}

function buildImportRow(index = 0) {
  return {
    fullName: `Bulk User ${index}`,
    email: `bulk-${index}@example.test`,
    phone: `+38344111${String(index).padStart(3, '0')}`,
    password: makeCredential(`bulk-${index}`),
    planId: 'standard' as const,
  };
}

async function loadImportMembersAction() {
  const actions = await import('./agent');
  return (actions as Record<string, unknown>).importMembers as (
    prevState: unknown,
    formData: FormData
  ) => Promise<unknown>;
}

function createRowsFormData(rows: unknown[]) {
  const formData = new FormData();
  formData.set('rowsJson', JSON.stringify(rows));
  return formData;
}

function scopedLeadPredicate(leadId = 'lead1', tenantId = 'tenant_mk', agentId = 'agent1') {
  return expect.objectContaining({
    op: 'and',
    args: expect.arrayContaining([
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'id' }),
        right: leadId,
      }),
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'tenantId' }),
        right: tenantId,
      }),
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'agentId' }),
        right: agentId,
      }),
    ]),
  });
}

function leadLookupPredicate(leadId = 'lead1', tenantId = 'tenant_mk') {
  return expect.objectContaining({
    op: 'and',
    args: expect.arrayContaining([
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'tenantId' }),
        right: tenantId,
      }),
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'id' }),
        right: leadId,
      }),
    ]),
  });
}

vi.mock('./agent/context', () => ({
  getAgentSession: vi.fn(),
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

  describe('createLead', () => {
    it('should create lead if valid', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });

      const formData = new FormData();
      formData.set('type', 'individual');
      formData.set('stage', 'new');
      formData.set('fullName', 'John Doe');
      formData.set('phone', '123456');
      formData.set('source', 'manual');

      const result = await createLead(null, formData);

      if (result && 'error' in result) {
        console.log('Validation failed:', result);
      }

      expect(db.insert).toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith('/en/agent/leads');
    });

    it('should return error if unauthorized', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await createLead(null, new FormData());
      expect(result).toEqual({ error: 'Unauthorized', fields: undefined });
    });

    it('should return validation error if fields missing', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      const formData = new FormData();
      // Empty

      const result = await createLead(null, formData);
      expect(result).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('updateLeadStatus', () => {
    it('should update status if owned by agent', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent1',
        branchId: 'b1',
        stage: 'new',
        tenantId: 'tenant_mk',
      });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ success: true });
      expect(ensureTenantId).toHaveBeenCalledWith({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      expect(db.query.crmLeads.findFirst).toHaveBeenCalledWith({
        where: leadLookupPredicate(),
      });
      expect(db.update).toHaveBeenCalled();
      expect(dbMock.where).toHaveBeenCalledWith(scopedLeadPredicate());
    });

    it('should fail if not owner', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ error: 'Not found' });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should hide same-tenant lead ownership denials as not found when updating status', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent2',
        branchId: 'b1',
        tenantId: 'tenant_mk',
      });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ error: 'Not found' });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should reject missing tenant identity before updating status', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent', tenantId: null },
      });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ error: 'Missing tenantId' });
      expect(db.query.crmLeads.findFirst).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });
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
      expect(redirect).toHaveBeenCalledWith('/en/agent/clients');
    });
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
