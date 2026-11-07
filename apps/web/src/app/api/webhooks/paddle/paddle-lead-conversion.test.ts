import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { MemberEmailConflictError } from '@interdomestik/domain-leads/member-email-conflict';
import { isRetryablePaddleWebhookError } from '@interdomestik/domain-membership-billing/paddle-webhooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  convertLeadToMember: vi.fn(),
  hasTenantLeadForConversion: vi.fn(),
  recordPaddleLeadEmailConflict: vi.fn(),
}));

vi.mock('@interdomestik/domain-leads', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
  hasTenantLeadForConversion: hoisted.hasTenantLeadForConversion,
  recordPaddleLeadEmailConflict: hoisted.recordPaddleLeadEmailConflict,
}));

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
    hoisted.recordPaddleLeadEmailConflict.mockResolvedValue(undefined);
  });

  it('records the conflict without the email and completes', async () => {
    hoisted.convertLeadToMember.mockRejectedValue(new MemberEmailConflictError());

    await expect(reconcile()).resolves.toBeUndefined();
    expect(hoisted.recordPaddleLeadEmailConflict).toHaveBeenCalledWith(authority, {
      leadId: 'lead_1',
    });
  });

  it('retries the delivery when the conflict cannot be recorded', async () => {
    hoisted.convertLeadToMember.mockRejectedValue(new MemberEmailConflictError());
    hoisted.recordPaddleLeadEmailConflict.mockRejectedValue(new Error('audit down'));

    const failure = await reconcile().catch(error => error);
    expect(isRetryablePaddleWebhookError(failure)).toBe(true);
  });

  it('retries the delivery on any other conversion failure', async () => {
    const error = new Error('db down');
    hoisted.convertLeadToMember.mockRejectedValue(error);

    const failure = await reconcile().catch(caught => caught);
    expect(isRetryablePaddleWebhookError(failure)).toBe(true);
    expect((failure as Error).cause).toBe(error);
    expect(hoisted.recordPaddleLeadEmailConflict).not.toHaveBeenCalled();
  });
});
