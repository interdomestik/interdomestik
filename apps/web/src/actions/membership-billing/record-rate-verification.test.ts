import { authorizedSession } from '@/test/safe-action-harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), write: vi.fn(), verify: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@interdomestik/domain-membership-billing/payment-port', async importOriginal => ({
  ...(await importOriginal<object>()),
  recordRateVerification: mocks.verify,
}));

import { recordRateVerification } from './record-rate-verification';

const name = 'membershipBilling.recordRateVerification';
const actor = { id: 'verifier', tenantId: 'verifier-tenant', role: 'tenant_admin' };
const input = {
  legalEntityId: 'entity-1',
  rateId: 'rate-1',
  observedRate: '61.500',
  sourceRef: 'NBRM:2026-01-07',
  operationKey: 'e87a2960-c761-48a8-a1b3-5b04a4dc4bc6',
};

function expectRefusal(actorRole: string) {
  expect(mocks.write).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      action: 'action.refused',
      entityId: name,
      actorId: actor.id,
      actorRole,
      metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'none' } },
    })
  );
}

describe('recordRateVerification action', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(actor));
    mocks.write.mockResolvedValue({ ok: true });
  });

  it.each(['tenant_admin', 'admin'])(
    'binds the authenticated %s and returns evidence',
    async role => {
      const authorized = authorizedSession({ ...actor, role });
      const verification = { id: 'stored-verification' };
      mocks.authorize.mockResolvedValue(authorized);
      mocks.verify.mockResolvedValue({ ok: true, verification });

      expect(await recordRateVerification(input)).toEqual({ success: true, data: verification });
      expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(
        authorized.authority,
        input,
        authorized.session.user
      );
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it.each(['agent', 'staff', 'member', 'super_admin'])(
    'records a refusal for role %s',
    async role => {
      mocks.authorize.mockResolvedValue(authorizedSession({ ...actor, role }));

      expect(await recordRateVerification(input)).toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.verify).not.toHaveBeenCalled();
      expectRefusal(role);
    }
  );

  it('records an unauthenticated refusal through the wrapper logger', async () => {
    mocks.authorize.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await recordRateVerification(input)).toMatchObject({
        success: false,
        code: 'UNAUTHORIZED',
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith('[SafeAction] refused', {
        operation: name,
        basis: 'role',
        code: 'UNAUTHORIZED',
        subjectType: 'none',
      });
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it.each(['tenantId', 'verifiedBy', 'bookId', 'verifiedAt', 'rateEffectiveOn'])(
    'refuses the injected %s field before the command',
    async key => {
      expect(await recordRateVerification({ ...input, [key]: 'injected' })).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      expect(mocks.verify).not.toHaveBeenCalled();
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['forbidden', 'FORBIDDEN'],
    ['not_found', 'NOT_FOUND'],
  ])('maps %s to %s and records the refusal', async (domainCode, actionCode) => {
    mocks.verify.mockResolvedValue({ ok: false, code: domainCode });

    expect(await recordRateVerification(input)).toMatchObject({ success: false, code: actionCode });
    expectRefusal(actor.role);
  });

  it.each(['invalid', 'conflict', 'rate_mismatch', 'stale_rate'])(
    'returns the branded business failure %s without an audit receipt',
    async code => {
      mocks.verify.mockResolvedValue({ ok: false, code });

      expect(await recordRateVerification(input)).toMatchObject({ success: false, code });
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );
});
