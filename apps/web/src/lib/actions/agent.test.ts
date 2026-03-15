import { db } from '@interdomestik/database/db';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLead, logActivity, registerMember, updateLeadStatus } from './agent';
import { getAgentSession } from './agent/context';

vi.mock('./agent/context', () => ({
  getAgentSession: vi.fn(),
}));

vi.mock('./agent/register-member', () => ({
  registerMemberCore: vi.fn(),
}));

vi.mock('./agent/import-members.core', () => ({
  importMembersCore: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
    query: {
      crmLeads: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmLeads: { id: { name: 'id' }, agentId: { name: 'agentId' }, tenantId: { name: 'tenantId' } },
  crmActivities: { id: { name: 'id' }, tenantId: { name: 'tenantId' } },
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
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk' },
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
        user: { id: 'agent1', role: 'agent', tenantId: 'tenant_mk' },
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
        user: { id: 'agent1', role: 'agent' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent1',
      });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
    });

    it('should fail if not owner', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent2',
      });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ error: 'Not found' });
    });
  });

  describe('logActivity', () => {
    it('should log activity', async () => {
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', role: 'agent' },
      });
      (db.query.crmLeads.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'lead1',
        agentId: 'agent1',
      });

      const result = await logActivity('lead1', 'call', 'Called user');
      expect(result).toEqual({ success: true });
      expect(db.insert).toHaveBeenCalled();
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
      formData.set('password', 'GoldenPass123!');
      formData.set('planId', 'standard');

      const result = await registerMember(null, formData);

      expect(result).toBeUndefined();
      expect(redirect).toHaveBeenCalledWith('/en/agent/clients');
    });
  });

  describe('importMembers', () => {
    it('returns unauthorized when bulk import runs without an agent session', async () => {
      const actions = await import('./agent');
      const importMembers = (actions as Record<string, unknown>).importMembers as (
        prevState: unknown,
        formData: FormData
      ) => Promise<unknown>;

      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const formData = new FormData();
      formData.set('rowsJson', '[]');

      await expect(importMembers(null, formData)).resolves.toEqual({
        error: 'Unauthorized',
        summary: undefined,
        results: undefined,
      });
    });

    it('delegates bulk import to the core and returns the structured result', async () => {
      const actions = await import('./agent');
      const { importMembersCore } = await import('./agent/import-members.core');
      const importMembers = (actions as Record<string, unknown>).importMembers as (
        prevState: unknown,
        formData: FormData
      ) => Promise<unknown>;

      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'agent1', name: 'Agent', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
      });

      (importMembersCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'bulk@example.test', fullName: 'Bulk User', ok: true }],
      });

      const formData = new FormData();
      formData.set(
        'rowsJson',
        JSON.stringify([
          {
            fullName: 'Bulk User',
            email: 'bulk@example.test',
            phone: '+38344111222',
            password: 'Secret123!',
            planId: 'standard',
          },
        ])
      );

      await expect(importMembers(null, formData)).resolves.toEqual({
        error: '',
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'bulk@example.test', fullName: 'Bulk User', ok: true }],
      });
    });
  });
});
