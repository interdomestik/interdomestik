import { dbMock } from './agent.shared.test-support';
import { db } from '@interdomestik/database/db';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leadLookupPredicate, scopedLeadPredicate } from './agent.test-support';
import { createLead, updateLeadStatus } from './agent';
import { getAgentSession } from './agent/context';

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
});
