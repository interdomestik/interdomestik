import { beforeEach, describe, expect, it } from 'vitest';

import { getMemberDetailMocks, memberDetailAuthority } from './getMemberClaimDetail-test-support';
import { getMemberClaimDetail } from './getMemberClaimDetail';
import { configureMemberDetailTest } from './getMemberClaimDetail-setup.test-support';

const hoisted = getMemberDetailMocks();

const memberSession = {
  user: {
    id: 'member-1',
    role: 'member',
    tenantId: 'tenant-1',
  },
} as const;

describe('getMemberClaimDetail tracing', () => {
  beforeEach(() => {
    configureMemberDetailTest();
    hoisted.admit.mockResolvedValue({
      ok: true,
      authorized: { session: memberSession, authority: memberDetailAuthority },
    });
  });

  it('admits and loads inside the action span with response recording disabled', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce(undefined);
    hoisted.withServerActionInstrumentation.mockImplementationOnce(async (_name, _options, run) => {
      expect(hoisted.admit).not.toHaveBeenCalled();
      await run();
      expect(hoisted.admit).toHaveBeenCalledOnce();
      expect(hoisted.context).toHaveBeenCalledOnce();
      expect(hoisted.claimFindFirst).toHaveBeenCalledOnce();
      return null;
    });

    await getMemberClaimDetail('claim-traced');

    expect(hoisted.withServerActionInstrumentation).toHaveBeenCalledWith(
      'claims.tracking.detail',
      { recordResponse: false },
      expect.any(Function)
    );
    expect(hoisted.setTag.mock.calls).toEqual([
      ['tenantId', 'tenant-1'],
      ['claimId', 'claim-traced'],
    ]);
    expect(hoisted.setTag.mock.invocationCallOrder[1]).toBeLessThan(
      hoisted.context.mock.invocationCallOrder[0]
    );
  });
});
