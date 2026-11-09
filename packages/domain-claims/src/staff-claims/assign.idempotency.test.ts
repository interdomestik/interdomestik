import { mocks, createSession } from './assign.test-support';
import { withTenantContext } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { E2E_CASE_FIXTURES, E2E_USER_IDS } from '../../../database/src/e2e-role-fixtures';
import { E2E_USERS } from '../../../database/src/e2e-users';
import { createMutationCopy } from '../../../database/src/testing/mutation-copy';

import { assignClaimCore } from './assign';

const runId = randomUUID();
const actorId = E2E_USER_IDS.KS_STAFF;
const peerId = E2E_USER_IDS.KS_STAFF_UNASSIGNED;
const authority = mintTestTenantAuthority(E2E_CASE_FIXTURES.KS_ANCHOR.tenantId);

function start(key: keyof typeof E2E_CASE_FIXTURES) {
  const copy = createMutationCopy({
    runId,
    workerId: process.env.VITEST_POOL_ID ?? 'main',
    scenario: key,
  });
  const claim = copy.row(E2E_CASE_FIXTURES[key]);
  mocks.selectChain.limit.mockResolvedValue([claim]);
  const session = createSession({
    userId: actorId,
    tenantId: claim.tenantId,
    branchId: claim.branchId,
  });
  return { claim, params: { authority, claimId: claim.id, session } };
}

function expectAssignmentGuard(previousStaffId: string | null) {
  const guard = previousStaffId
    ? { left: 'claims.staff_id', right: previousStaffId, op: 'eq' }
    : { column: 'claims.staff_id', op: 'isNull' };
  expect(mocks.updateSetChain.where).toHaveBeenCalledWith({
    op: 'and',
    conditions: [expect.objectContaining({ scoped: true }), guard],
  });
}

describe('staff assignment from isolated catalogue cases (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ values: mocks.auditValues });
    mocks.ensureTenantId.mockReturnValue(E2E_CASE_FIXTURES.KS_ANCHOR.tenantId);
    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.update.mockReturnValue(mocks.updateChain);
    mocks.updateChain.set.mockReturnValue(mocks.updateSetChain);
    mocks.updateSetChain.where.mockReturnValue(mocks.updateWhereChain);
    mocks.userFindFirst.mockResolvedValue({
      email: E2E_USERS.KS_STAFF_UNASSIGNED.email,
      id: peerId,
      name: E2E_USERS.KS_STAFF_UNASSIGNED.name,
    });
  });

  it('replays self-assignment of KS_ANCHOR without mutation or audit', async () => {
    const { params } = start('KS_ANCHOR');
    const result = await assignClaimCore(params);
    expect(result).toEqual({ success: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it('replays the selected assignee of KS_PEER_STAFF without resolving or updating it', async () => {
    const { params } = start('KS_PEER_STAFF');
    expect(await assignClaimCore({ ...params, staffId: peerId })).toEqual({ success: true });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it('does not update or audit an already unassigned claim', async () => {
    const { params } = start('KS_UNASSIGNED');
    await expect(assignClaimCore({ ...params, staffId: null })).resolves.toEqual({ success: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it('denies a branchless actor outside the selected case scope', async () => {
    const { params } = start('KS_OTHER_BRANCH');
    mocks.selectChain.limit.mockResolvedValue([]);
    const result = await assignClaimCore({
      ...params,
      session: createSession({
        userId: actorId,
        tenantId: E2E_USERS.KS_STAFF.tenantId,
        branchId: null,
      }),
    });
    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', actorId);
    expect(mocks.isNull).toHaveBeenCalledWith('claims.staff_id');
    expect(mocks.or).toHaveBeenCalled();
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows a branchless actor to assign an eligible tenant staff member', async () => {
    const { claim, params } = start('KS_UNASSIGNED');
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: claim.id }]);
    const result = await assignClaimCore({
      ...params,
      session: createSession({ userId: actorId, tenantId: claim.tenantId, branchId: null }),
      staffId: peerId,
    });
    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.auditValues).toHaveBeenCalledTimes(1);
  });

  it('denies a simulated CAS loser without an audit effect', async () => {
    const { params } = start('KS_UNASSIGNED');
    mocks.updateWhereChain.returning.mockResolvedValue([]);
    const result = await assignClaimCore({ ...params, staffId: peerId });
    expectAssignmentGuard(null);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.auditValues).not.toHaveBeenCalled();
  });

  it.each([
    ['KS_UNASSIGNED', actorId, 'claim.assigned'],
    ['KS_ANCHOR', peerId, 'claim.assigned'],
    ['KS_ANCHOR', null, 'claim.unassigned'],
  ] as const)(
    'changes %s to %s once and replays without another write',
    async (key, staffId, action) => {
      const { claim, params } = start(key);
      mocks.updateWhereChain.returning.mockResolvedValue([{ id: claim.id }]);
      const previousStaffId = claim.staffId;
      const request = { ...params, staffId };
      expect(await assignClaimCore(request)).toEqual({ success: true });
      expectAssignmentGuard(previousStaffId);
      // Model the committed row on the next read; this is replay coverage, not SQL proof.
      mocks.selectChain.limit.mockResolvedValue([{ ...claim, staffId }]);
      expect(await assignClaimCore(request)).toEqual({ success: true });
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ staffId }));
      expect(mocks.auditValues).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          action,
          entityId: claim.id,
          metadata: { previousStaffId, newStaffId: staffId },
        })
      );
      expect(E2E_CASE_FIXTURES[key].staffId).toBe(previousStaffId);
    }
  );

  it.each([peerId, null])(
    'rolls back a catalogue assignment to %s on audit failure',
    async staffId => {
      const { claim, params } = start('KS_ANCHOR');
      let committed: Record<string, unknown> = { ...claim };
      mocks.updateWhereChain.returning.mockResolvedValue([{ id: claim.id }]);
      mocks.auditValues.mockRejectedValueOnce(new Error('audit insert failed'));
      const original = vi.mocked(withTenantContext).getMockImplementation()!;
      vi.mocked(withTenantContext).mockImplementation(async (context, action) => {
        const result = await original(context, action);
        committed = { ...committed, ...mocks.updateChain.set.mock.lastCall?.[0] };
        return result;
      });
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await expect(assignClaimCore({ ...params, staffId })).resolves.toEqual({
          success: false,
          error: 'Failed to assign claim',
        });
        expectAssignmentGuard(claim.staffId);
        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.auditValues).toHaveBeenCalledTimes(1);
        expect(committed).toEqual(claim);
        expect(E2E_CASE_FIXTURES.KS_ANCHOR.staffId).toBe(claim.staffId);
      } finally {
        vi.mocked(withTenantContext).mockImplementation(original);
        errorLog.mockRestore();
      }
    }
  );
});
