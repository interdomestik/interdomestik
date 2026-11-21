import { authorizedSession } from '@/test/safe-action-harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), publish: vi.fn(), write: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@interdomestik/domain-membership-billing/payment-port', async importOriginal => ({
  ...(await importOriginal<object>()),
  recordExchangeRate: mocks.publish,
}));

import { recordExchangeRate } from '@/actions/membership-billing/record-exchange-rate';

const admin = { id: 'rate-admin', tenantId: 'tenant-a', role: 'tenant_admin' };
const input = { base: 'EUR', quote: 'MKD', rate: '61.5', effectiveOn: '2026-01-02' };

describe('recordExchangeRate action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(admin));
    mocks.write.mockResolvedValue({ ok: true });
  });

  function expectRefusal(actorId: string) {
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'action.refused',
        entityId: 'membershipBilling.recordExchangeRate',
        actorId,
        metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'none' } },
      })
    );
  }

  it('passes the authenticated authority and actor to the port', async () => {
    const context = authorizedSession(admin);
    const rate = { id: 'rate-a', storedBy: admin.id };
    mocks.authorize.mockResolvedValue(context);
    mocks.publish.mockResolvedValue({ ok: true, rate });

    expect(await recordExchangeRate(input)).toEqual({ success: true, data: rate });
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(
      context.authority,
      input,
      context.session.user
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(['member', 'agent', 'staff'])('refuses the %s role before publication', async role => {
    const actor = { ...admin, role };
    mocks.authorize.mockResolvedValue(authorizedSession(actor));

    expect(await recordExchangeRate(input)).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(mocks.publish).not.toHaveBeenCalled();
    expectRefusal(actor.id);
  });

  it.each(['storedBy', 'callerKind', 'tenantId', 'stored_by', 'caller_kind'])(
    'rejects injected %s before publication',
    async field => {
      expect(await recordExchangeRate({ ...input, [field]: 'injected' })).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      expect(mocks.publish).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['forbidden', 'FORBIDDEN'],
    ['not_found', 'NOT_FOUND'],
  ])('records the %s refusal and answers %s', async (code, answer) => {
    mocks.publish.mockResolvedValue({ ok: false, code });

    expect(await recordExchangeRate(input)).toMatchObject({ success: false, code: answer });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expectRefusal(admin.id);
  });

  it.each(['invalid', 'conflict'])(
    'returns business failure %s without a refusal row',
    async code => {
      mocks.publish.mockResolvedValue({ ok: false, code });

      expect(await recordExchangeRate(input)).toMatchObject({ success: false, code });
      expect(mocks.publish).toHaveBeenCalledTimes(1);
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );
});
