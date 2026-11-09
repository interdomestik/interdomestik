import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  convertLeadToMember: vi.fn(),
  hasTenantLeadForConversion: vi.fn(),
  sendMemberActivationInvite: vi.fn(),
}));

vi.mock('@interdomestik/domain-leads', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
  hasTenantLeadForConversion: hoisted.hasTenantLeadForConversion,
  recordPaddleLeadEmailConflict: vi.fn(),
}));
vi.mock('@/lib/member-activation-invite', () => ({
  sendMemberActivationInvite: hoisted.sendMemberActivationInvite,
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

// ACQ-2b2: the member is invited only after the conversion committed, and only once.
describe('reconcilePaddleLeadConversion activation invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.hasTenantLeadForConversion.mockResolvedValue(true);
  });

  it('invites the committed email after a conversion', async () => {
    hoisted.convertLeadToMember.mockResolvedValue({ userId: 'u1', email: 'a@b.test' });
    hoisted.sendMemberActivationInvite.mockResolvedValue({ sent: true });

    await expect(reconcile()).resolves.toBeUndefined();
    expect(hoisted.sendMemberActivationInvite).toHaveBeenCalledWith({
      email: 'a@b.test',
      tenantId: 'tenant_1',
    });
  });

  it('sends nothing when a redelivery finds the lead already converted', async () => {
    hoisted.convertLeadToMember.mockResolvedValue(null);

    await expect(reconcile()).resolves.toBeUndefined();
    expect(hoisted.sendMemberActivationInvite).not.toHaveBeenCalled();
  });

  it('acknowledges the webhook when the invite cannot be delivered', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.convertLeadToMember.mockResolvedValue({ userId: 'u1', email: 'a@b.test' });
    hoisted.sendMemberActivationInvite.mockResolvedValue({
      sent: false,
      reason: 'delivery_failed',
    });

    await expect(reconcile()).resolves.toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain('a@b.test');
    log.mockRestore();
  });
  it('settles suppression without logging a delivery failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    hoisted.convertLeadToMember.mockResolvedValue({ userId: 'u1', email: 'a@b.test' });
    hoisted.sendMemberActivationInvite.mockResolvedValue({
      sent: false,
      reason: 'email_suppressed',
    });
    try {
      const result = await reconcile();
      expect(result).toBeUndefined();
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
