import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { MemberEmailConflictError } from '@interdomestik/domain-leads/member-email-conflict';
import { isRetryablePaddleWebhookError } from '@interdomestik/domain-membership-billing/paddle-webhooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  convertLeadToMember: vi.fn(),
  hasTenantLeadForConversion: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@interdomestik/domain-leads', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
  hasTenantLeadForConversion: hoisted.hasTenantLeadForConversion,
}));
vi.mock('@/lib/audit.core', () => ({ logAuditEvent: hoisted.recordAuditEvent }));

import { reconcilePaddleLeadConversion } from './paddle-lead-conversion';

const authority = mintTestTenantAuthority('tenant_1');
const reconcile = () =>
  reconcilePaddleLeadConversion({
    eventType: 'transaction.completed',
    data: { id: 'txn_1', customData: { leadId: 'lead_1', tenantId: 'tenant_1' } },
    authority,
    subscription: null,
  });

// ACQ-2b1: an email that already has an account is a deterministic collision, so the webhook
// records it for an operator and is acknowledged instead of failing on every redelivery.
describe('reconcilePaddleLeadConversion email conflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
    hoisted.recordAuditEvent.mockResolvedValue(undefined);
  });

  it('records the conflict without the email and completes', async () => {
    hoisted.convertLeadToMember.mockRejectedValue(new MemberEmailConflictError());

    await expect(reconcile()).resolves.toBeUndefined();
    expect(hoisted.recordAuditEvent).toHaveBeenCalledWith({
      authority,
      actorRole: 'system',
      action: 'PADDLE_LEAD_CONVERSION_EMAIL_CONFLICT',
      entityType: 'member_lead',
      entityId: 'lead_1',
      metadata: { disposition: 'member_email_conflict', reconciliation: 'operator' },
    });
  });

  it('retries the delivery when the conflict cannot be recorded', async () => {
    hoisted.convertLeadToMember.mockRejectedValue(new MemberEmailConflictError());
    hoisted.recordAuditEvent.mockRejectedValue(new Error('audit down'));

    const failure = await reconcile().catch(error => error);
    expect(isRetryablePaddleWebhookError(failure)).toBe(true);
  });

  it('keeps any other conversion failure as it was', async () => {
    const error = new Error('db down');
    hoisted.convertLeadToMember.mockRejectedValue(error);

    await expect(reconcile()).rejects.toBe(error);
    expect(hoisted.recordAuditEvent).not.toHaveBeenCalled();
  });
});
