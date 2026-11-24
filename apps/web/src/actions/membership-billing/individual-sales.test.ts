import { authorizedSession } from '@/test/safe-action-harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  write: vi.fn(),
  publish: vi.fn(),
  withdraw: vi.fn(),
  quote: vi.fn(),
  sell: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@interdomestik/domain-membership-billing/payment-port', async importOriginal => ({
  ...(await importOriginal<object>()),
  publishPlanVersion: mocks.publish,
  withdrawPlanVersion: mocks.withdraw,
  getSaleOffer: mocks.quote,
  recordSale: mocks.sell,
}));

import {
  getSaleOffer,
  publishPlanVersion,
  recordSale,
  withdrawPlanVersion,
} from './individual-sales';

const admin = { id: 'billing-admin', tenantId: 'tenant-a', role: 'tenant_admin' };
const quoteInput = { planId: 'plan-1' };
const publishInput = { ...quoteInput, legalEntityId: 'entity-1' };
const withdrawInput = { planVersionId: 'version-1' };
const saleInput = {
  buyer: { memberUserId: 'member-1' },
  ...withdrawInput,
  termsVersion: 'v1',
  rateId: 'rate-1',
  amountMkdMinor: 100n,
  channel: 'cash',
  operationKey: 'key-1',
};

describe.each([
  {
    name: 'publishPlanVersion',
    action: publishPlanVersion,
    invoke: mocks.publish,
    input: publishInput,
    payload: 'version',
    failures: ['invalid'],
  },
  {
    name: 'withdrawPlanVersion',
    action: withdrawPlanVersion,
    invoke: mocks.withdraw,
    input: withdrawInput,
    payload: 'version',
    failures: [],
  },
  {
    name: 'getSaleOffer',
    action: getSaleOffer,
    invoke: mocks.quote,
    input: quoteInput,
    payload: 'offer',
    failures: ['stale_offer', 'rate_unavailable', 'stale_rate'],
  },
  {
    name: 'recordSale',
    action: recordSale,
    invoke: mocks.sell,
    input: saleInput,
    payload: 'sale',
    failures: [
      'invalid',
      'already_covered',
      'stale_offer',
      'stale_rate',
      'rate_unavailable',
      'conflict',
    ],
  },
])('WP-02 billing action $name', ({ name, action, invoke, input, payload, failures }) => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(admin));
    mocks.write.mockResolvedValue({ ok: true });
  });

  function expectRefusal(actorId: string) {
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'action.refused',
        entityId: `membershipBilling.${name}`,
        actorId,
        metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'none' } },
      })
    );
  }

  it('refuses the wrong role before reaching the port', async () => {
    const member = { ...admin, id: 'member-1', role: 'member' };
    mocks.authorize.mockResolvedValue(authorizedSession(member));
    expect(await action(input)).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(invoke).not.toHaveBeenCalled();
    expectRefusal(member.id);
  });

  it('refuses an unauthenticated caller before reaching the port', async () => {
    mocks.authorize.mockResolvedValue(null);
    expect(await action(input)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('passes the authenticated session actor and returns the owner’s projection', async () => {
    const authorized = authorizedSession(admin);
    const data = { id: 'synthetic-result' };
    mocks.authorize.mockResolvedValue(authorized);
    invoke.mockResolvedValue({ ok: true, [payload]: data });
    expect(await action(input)).toEqual({ success: true, data });
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      authorized.authority,
      input,
      authorized.session.user
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('records a forbidden failure', async () => {
    invoke.mockResolvedValue({ ok: false, code: 'forbidden' });
    expect(await action(input)).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expectRefusal(admin.id);
  });

  if (name !== 'publishPlanVersion') {
    it('conceals not_found and records a refusal', async () => {
      invoke.mockResolvedValue({ ok: false, code: 'not_found' });
      expect(await action(input)).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expectRefusal(admin.id);
    });
  }

  for (const code of failures) {
    it(`returns business code ${code} without a refusal record`, async () => {
      invoke.mockResolvedValue({ ok: false, code });
      expect(await action(input)).toMatchObject({ success: false, code });
      expect(mocks.write).not.toHaveBeenCalled();
    });
  }

  it('rejects an injected tenant input before the port', async () => {
    expect(await action({ ...input, tenantId: 'injected' })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

it.each(['publishedBy', 'published_by'])(
  'withdraws no authority from injected publisher %s',
  async key => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(admin));
    expect(await publishPlanVersion({ ...publishInput, [key]: 'injected' })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  }
);

it.each(['soldBy', 'sold_by', 'agentId', 'branchId', 'governingLaw'])(
  'rejects an injected snapshot field %s',
  async key => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(admin));
    expect(await recordSale({ ...saleInput, [key]: 'injected' })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.sell).not.toHaveBeenCalled();
  }
);

it.each(['before\u0000after', '\uD800'])(
  'rejects unpreservable sale terms %j',
  async termsVersion => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(admin));
    expect(await recordSale({ ...saleInput, termsVersion })).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
      issues: { termsVersion: 'invalid_format' },
    });
  }
);

describe('recordSale input validation', () => {
  const authorized = authorizedSession(admin);

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorized);
  });

  it.each([
    { buyer: { leadId: 'lead-1', memberUserId: 'member-1' }, issue: 'invalid_union' },
    { buyer: {}, issue: 'invalid_union' },
    { buyer: { leadId: 'lead-1', memberUserId: undefined }, issue: 'unrecognized_keys' },
    { buyer: { leadId: undefined, memberUserId: 'member-1' }, issue: 'unrecognized_keys' },
  ])('preserves the basis response for buyer $buyer', async ({ buyer, issue }) => {
    expect(await recordSale({ ...saleInput, buyer })).toStrictEqual({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Invalid input',
      issues: { buyer: issue },
    });
    expect(mocks.sell).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('passes a 255-character operation key to the port', async () => {
    const input = { ...saleInput, operationKey: '📄'.repeat(255) };
    const sale = { id: 'synthetic-sale' };
    mocks.sell.mockResolvedValue({ ok: true, sale });

    expect(await recordSale(input)).toStrictEqual({ success: true, data: sale });
    expect(mocks.sell).toHaveBeenCalledExactlyOnceWith(
      authorized.authority,
      input,
      authorized.session.user
    );
  });

  it('refuses a 256-character operation key at the action entry', async () => {
    expect(await recordSale({ ...saleInput, operationKey: '📄'.repeat(256) })).toStrictEqual({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Invalid input',
      issues: { operationKey: 'too_big' },
    });
    expect(mocks.sell).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('returns the same validation response for a refused key from the command', async () => {
    const issues = { operationKey: 'too_big' };
    mocks.sell.mockResolvedValue({ ok: false, code: 'invalid', issues });

    expect(await recordSale(saleInput)).toStrictEqual({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Invalid input',
      issues,
    });
    expect(mocks.sell).toHaveBeenCalledExactlyOnceWith(
      authorized.authority,
      saleInput,
      authorized.session.user
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('preserves a plain invalid command response as a business failure', async () => {
    mocks.sell.mockResolvedValue({ ok: false, code: 'invalid' });

    expect(await recordSale(saleInput)).toStrictEqual({
      success: false,
      code: 'invalid',
      error: 'Request failed',
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
