import { dbMock } from './agent.shared.test-support';
import { db } from '@interdomestik/database/db';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leadLookupPredicate, makeCredential } from './agent.test-support';
import { logActivity } from './agent';
import { getAgentSession } from './agent/context';

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
});
