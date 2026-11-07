import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  auditLog: { table: 'audit_log' },
  values: vi.fn(),
  withTenantAuthority: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ auditLog: hoisted.auditLog }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: hoisted.withTenantAuthority,
}));

import { recordPaddleLeadEmailConflict } from './lead-email-conflict-audit';

const authority = mintTestTenantAuthority('tenant-1');
const tx = { insert: vi.fn(() => ({ values: hoisted.values })) };

// ACQ-2b1: the Paddle webhook acknowledges a collision only after this row is durable.
describe('recordPaddleLeadEmailConflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.values.mockResolvedValue(undefined);
    hoisted.withTenantAuthority.mockImplementation((_authority, run) => run(tx));
  });

  it('writes the tenant-scoped disposition without the email', async () => {
    await recordPaddleLeadEmailConflict(authority, { leadId: 'lead-1' });

    expect(hoisted.withTenantAuthority).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(tx.insert).toHaveBeenCalledWith(hoisted.auditLog);
    expect(hoisted.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: null,
        actorRole: 'system',
        action: 'PADDLE_LEAD_CONVERSION_EMAIL_CONFLICT',
        entityType: 'member_lead',
        entityId: 'lead-1',
        metadata: { disposition: 'member_email_conflict', reconciliation: 'operator' },
      })
    );
  });

  it('propagates a failed write instead of swallowing it', async () => {
    const failure = new Error('audit insert failed');
    hoisted.values.mockRejectedValue(failure);

    await expect(recordPaddleLeadEmailConflict(authority, { leadId: 'lead-1' })).rejects.toBe(
      failure
    );
  });
});
