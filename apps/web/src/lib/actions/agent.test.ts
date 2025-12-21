import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLead, logActivity, updateLeadStatus } from './agent';

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
  crmLeads: { id: 'id', agentId: 'agentId' },
  crmActivities: { id: 'id' },
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({}),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id',
}));

describe('agent actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLead', () => {
    it('should create lead if valid', async () => {
      (auth.api.getSession as any).mockResolvedValue({ user: { id: 'agent1', role: 'agent' } });

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
      expect(redirect).toHaveBeenCalledWith('/agent/leads');
    });

    it('should return error if unauthorized', async () => {
      (auth.api.getSession as any).mockResolvedValue(null);
      const result = await createLead(null, new FormData());
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should return validation error if fields missing', async () => {
      (auth.api.getSession as any).mockResolvedValue({ user: { id: 'agent1', role: 'agent' } });
      const formData = new FormData();
      // Empty

      const result = await createLead(null, formData);
      expect(result).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('updateLeadStatus', () => {
    it('should update status if owned by agent', async () => {
      (auth.api.getSession as any).mockResolvedValue({ user: { id: 'agent1', role: 'agent' } });
      (db.query.crmLeads.findFirst as any).mockResolvedValue({ id: 'lead1', agentId: 'agent1' });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
    });

    it('should fail if not owner', async () => {
      (auth.api.getSession as any).mockResolvedValue({ user: { id: 'agent1', role: 'agent' } });
      (db.query.crmLeads.findFirst as any).mockResolvedValue({ id: 'lead1', agentId: 'agent2' });

      const result = await updateLeadStatus('lead1', 'contacted');
      expect(result).toEqual({ error: 'Not found' });
    });
  });

  describe('logActivity', () => {
    it('should log activity', async () => {
      (auth.api.getSession as any).mockResolvedValue({ user: { id: 'agent1', role: 'agent' } });
      (db.query.crmLeads.findFirst as any).mockResolvedValue({ id: 'lead1', agentId: 'agent1' });

      const result = await logActivity('lead1', 'call', 'Called user');
      expect(result).toEqual({ success: true });
      expect(db.insert).toHaveBeenCalled();
    });
  });
});
