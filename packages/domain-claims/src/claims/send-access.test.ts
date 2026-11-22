import { claimEffects, mocks, resetSendMocks, staffSession } from './send.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it } from 'vitest';

import { sendMessageDbCore } from './send-message';

function send(user: Record<string, string>, isInternal = false) {
  return sendMessageDbCore({
    session: { user: { tenantId: 'tenant-1', ...user } } as typeof staffSession,
    authority: mintTestTenantAuthority('tenant-1', {
      userId: user.id,
      role: user.role,
      branchId: user.branchId,
    }),
    requestHeaders: new Headers(),
    claimId: 'claim-1',
    content: 'Hello',
    isInternal,
  });
}

// Who may send on a claim: split from send.test.ts to keep each focused test file small.
describe('sendMessageDbCore send access', () => {
  beforeEach(resetSendMocks);

  const DENIED = 'Access denied';
  const INTERNAL_DENIED = 'Only staff can send internal messages';
  const AGENT_DENIED = 'Access denied: You can only message your assigned clients';

  beforeEach(() => {
    mocks.lockClaim.mockResolvedValue([
      {
        id: 'claim-1',
        title: 'Claim',
        userId: 'member-1',
        branchId: 'branch-1',
        caseLifecycleState: 'submitted',
        staffId: 'staff-9',
        claimNumber: null,
        category: 'retail',
      },
    ]);
  });

  // The branch manager owns the claim, so only the branch-manager rule can deny it.
  it.each([
    [
      'a branch manager on their own claim',
      { id: 'member-1', role: 'branch_manager', branchId: 'branch-1' },
      false,
      DENIED,
    ],
    [
      'staff of another branch',
      { id: 'staff-2', role: 'staff', branchId: 'branch-2' },
      false,
      DENIED,
    ],
    ['a member on a claim they do not own', { id: 'member-2', role: 'user' }, false, DENIED],
    ['a member sending internally', { id: 'member-1', role: 'user' }, true, INTERNAL_DENIED],
  ])('denies %s with its established error', async (_label, user, isInternal, error) => {
    const result = await send(user, isInternal);

    expect(result).toEqual({ success: false, error });
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('denies an agent without an active link to the member', async () => {
    mocks.agentAccess.mockResolvedValue(false);

    const result = await send({ id: 'agent-1', role: 'agent', branchId: 'branch-1' });

    expect(result).toEqual({ success: false, error: AGENT_DENIED });
    expect(mocks.agentAccess).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', memberId: 'member-1', tenantId: 'tenant-1' })
    );
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('keeps internal messages staff-only for a linked agent', async () => {
    mocks.agentAccess.mockResolvedValue(true);

    const result = await send({ id: 'agent-1', role: 'agent', branchId: 'branch-1' }, true);

    expect(result).toEqual({ success: false, error: INTERNAL_DENIED });
  });

  it.each([
    ['staff of the claim branch', { id: 'staff-2', role: 'staff', branchId: 'branch-1' }, true],
    ['an admin of any branch', { id: 'admin-1', role: 'admin', branchId: 'branch-7' }, true],
    ['the owning member', { id: 'member-1', role: 'user' }, false],
  ])('allows %s', async (_label, user, isInternal) => {
    const result = await send(user, isInternal);

    expect(result).toMatchObject({ success: true, isInternal });
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
  });

  it('allows a cross-home admin to post publicly and refuses their internal note', async () => {
    const actor = { id: 'admin-1', role: 'admin' };
    mocks.lockLocalActor.mockResolvedValue([]);

    await expect(send(actor, true)).resolves.toEqual({ success: false, error: DENIED });
    expect(mocks.lockLocalActor).toHaveBeenCalledExactlyOnceWith('share');
    expect(mocks.tx.insert).not.toHaveBeenCalled();

    await expect(send(actor)).resolves.toMatchObject({ success: true, isInternal: false });
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
  });

  it('denies staff of the claim branch a member draft without writing', async () => {
    mocks.lockClaim.mockResolvedValue([
      {
        id: 'claim-1',
        title: 'Claim',
        userId: 'member-1',
        branchId: 'branch-1',
        caseLifecycleState: 'draft',
        staffId: null,
      },
    ]);
    const result = await send({ id: 'staff-2', role: 'staff', branchId: 'branch-1' }, true);

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('routes an unnumbered member message and opens its response request in the message transaction', async () => {
    const result = await send({ id: 'member-1', role: 'user' });
    expect(mocks.resolveStaff).toHaveBeenCalledWith(mocks.tx, {
      tenantId: 'tenant-1',
      claimId: 'claim-1',
      staffId: 'staff-9',
    });
    expect(mocks.enqueueStaff).toHaveBeenCalledWith(
      mocks.tx,
      { tenantId: 'tenant-1', claimId: 'claim-1', claimNumber: null, category: 'retail' },
      { kind: 'staff_member_message', messageId: 'message-1' },
      [{ id: 'staff-1', role: 'staff', emailVerified: true }]
    );
    expect(claimEffects.createClaimResponseRequest).toHaveBeenCalledWith(mocks.tx, {
      tenantId: 'tenant-1',
      claimId: 'claim-1',
      kind: 'member_message',
      messageId: 'message-1',
    });
    expect(result).toMatchObject({ success: true, deliveryIds: ['email-2'] });
  });

  it('waits for a concurrent reassignment before resolving the staff recipient', async () => {
    let completeClaimLock!: (claims: object[]) => void;
    const claimLock = new Promise<object[]>(resolve => {
      completeClaimLock = resolve;
    });
    mocks.lockClaim.mockReturnValueOnce(claimLock);
    const result = send({ id: 'member-1', role: 'member' });
    expect(mocks.lockClaim).toHaveBeenCalledExactlyOnceWith('no key update');
    expect(mocks.resolveStaff).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    completeClaimLock([
      {
        title: 'Claim',
        userId: 'member-1',
        branchId: 'branch-1',
        caseLifecycleState: 'submitted',
        staffId: 'reassigned-staff',
        claimNumber: null,
        category: 'retail',
      },
    ]);
    await expect(result).resolves.toMatchObject({ success: true, deliveryIds: ['email-2'] });
    expect(mocks.resolveStaff).toHaveBeenCalledWith(mocks.tx, {
      tenantId: 'tenant-1',
      claimId: 'claim-1',
      staffId: 'reassigned-staff',
    });
  });
});
