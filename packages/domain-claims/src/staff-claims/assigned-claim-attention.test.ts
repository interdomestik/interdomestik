import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { ClaimsSession } from '../claims/types';

const mocks = vi.hoisted(() => {
  const query = {
    from: vi.fn(),
    groupBy: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
  };
  return {
    query,
    select: vi.fn(),
    contexts: [] as unknown[],
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    inArray: vi.fn((left, values) => ({ op: 'inArray', left, values })),
  };
});

vi.mock('@interdomestik/database', () => ({
  claimInformationRequests: {
    id: 'request.id',
    claimId: 'request.claim_id',
    tenantId: 'request.tenant_id',
    dueAt: 'request.due_at',
    status: 'request.status',
  },
  claimInformationRequestEvidence: {
    tenantId: 'evidence.tenant_id',
    claimId: 'evidence.claim_id',
    requestId: 'evidence.request_id',
    submittedAt: 'evidence.submitted_at',
  },
  claimCorrespondence: {
    tenantId: 'correspondence.tenant_id',
    claimId: 'correspondence.claim_id',
    direction: 'correspondence.direction',
    followUpAt: 'correspondence.follow_up_at',
  },
  claims: {
    id: 'claim.id',
    tenantId: 'claim.tenant_id',
    staffId: 'claim.staff_id',
    branchId: 'claim.branch_id',
  },
  claimCaseFields: {
    tenantId: 'case_fields.tenant_id',
    claimId: 'case_fields.claim_id',
    caseFollowUpAt: 'case_fields.case_follow_up_at',
  },
  and: mocks.and,
  eq: mocks.eq,
  inArray: mocks.inArray,
  sql: () => ({ mapWith: () => 'outbound.due_at' }),
  withTenantContext: (
    context: unknown,
    action: (tx: { select: typeof mocks.select }) => unknown
  ) => {
    mocks.contexts.push(context);
    return action({ select: mocks.select });
  },
}));

vi.mock('@interdomestik/database/tenant-authority', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/tenant-authority')>();
  return { ...actual, readTenantAuthority: vi.fn(actual.readTenantAuthority) };
});

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: (tenantId: string, column: string, condition: unknown) =>
    mocks.and(mocks.eq(column, tenantId), condition),
}));

import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  deriveAssignedClaimAttention,
  getAssignedStaffClaimAttention,
} from './assigned-claim-attention';

const now = new Date('2026-09-29T12:00:00.000Z');
const authority = mintTestTenantAuthority('tenant-1');
const staffSession = {
  user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
} as ClaimsSession;
// The register admission needs the session's own principal on the authority.
const registerAuthority = mintTestTenantAuthority('tenant-1', { userId: 'staff-1', role: 'staff' });
const descriptorOf = vi.mocked(readTenantAuthority).getMockImplementation()!;

describe('deriveAssignedClaimAttention', () => {
  it('separates member wait from staff review and flags only a passed saved request date', () => {
    const attention = deriveAssignedClaimAttention(
      ['member-case', 'staff-case', 'no-request'],
      [
        {
          claimId: 'member-case',
          memberDueAt: new Date('2026-09-29T11:59:59.000Z'),
          hasEvidence: false,
        },
        { claimId: 'staff-case', memberDueAt: null, hasEvidence: true },
      ],
      now
    );

    expect(attention).toEqual({
      'member-case': {
        nextActor: 'member',
        overdueFollowUpDueAt: '2026-09-29T11:59:59.000Z',
      },
      'staff-case': { nextActor: 'staff', overdueFollowUpDueAt: null },
      'no-request': { nextActor: 'untracked', overdueFollowUpDueAt: null },
    });
  });

  it('keeps an exact-now request out of overdue and prioritizes staff when requests are mixed', () => {
    const attention = deriveAssignedClaimAttention(
      ['mixed', 'due-now'],
      [
        { claimId: 'due-now', memberDueAt: now, hasEvidence: false },
        {
          claimId: 'mixed',
          memberDueAt: new Date('2026-09-28T00:00:00.000Z'),
          hasEvidence: true,
        },
      ],
      now
    );
    expect(attention).toEqual({
      mixed: { nextActor: 'staff', overdueFollowUpDueAt: '2026-09-28T00:00:00.000Z' },
      'due-now': { nextActor: 'member', overdueFollowUpDueAt: null },
    });
  });
});

describe('getAssignedStaffClaimAttention', () => {
  beforeEach(() => {
    mocks.contexts.length = 0;
    mocks.select.mockReset().mockReturnValue(mocks.query);
    mocks.query.from.mockReturnValue(mocks.query);
    mocks.query.innerJoin.mockReturnValue(mocks.query);
    mocks.query.leftJoin.mockReturnValue(mocks.query);
    mocks.query.where.mockReset().mockReturnValueOnce(mocks.query).mockResolvedValue([]);
    mocks.query.groupBy.mockReset().mockResolvedValue([]);
  });

  it('denies non-staff and never queries their claim IDs', async () => {
    await expect(
      getAssignedStaffClaimAttention(
        { user: { ...staffSession.user, role: 'branch_manager' } } as ClaimsSession,
        authority,
        ['claim-1']
      )
    ).rejects.toThrow('Staff access required');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('denies a missing authority and never queries', async () => {
    await expect(getAssignedStaffClaimAttention(staffSession, null, ['claim-1'])).rejects.toThrow(
      'Staff access required'
    );
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('scopes the read by tenant, open request, selected claims and assigned staff', async () => {
    const result = await getAssignedStaffClaimAttention(
      staffSession,
      registerAuthority,
      ['claim-1'],
      now
    );

    expect(result['claim-1']).toEqual({ nextActor: 'untracked', overdueFollowUpDueAt: null });
    expect(mocks.contexts).toHaveLength(1);
    expect(mocks.contexts[0]).toBe(registerAuthority);
    expect(mocks.query.groupBy).toHaveBeenCalledWith('request.claim_id');
    expect(mocks.query.where).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          { op: 'eq', left: 'request.tenant_id', right: 'tenant-1' },
          { op: 'inArray', left: 'request.claim_id', values: ['claim-1'] },
          { op: 'eq', left: 'request.status', right: 'open' },
          { op: 'eq', left: 'claim.staff_id', right: 'staff-1' },
        ]),
      })
    );
  });

  it('propagates a failed read instead of showing an empty staff queue', async () => {
    mocks.query.groupBy.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      getAssignedStaffClaimAttention(staffSession, registerAuthority, ['claim-1'])
    ).rejects.toThrow('database unavailable');
  });

  it('keeps the member request as the source when its overdue date is earlier', async () => {
    mocks.query.groupBy.mockResolvedValueOnce([
      {
        claimId: 'claim-1',
        memberDueAt: new Date('2026-09-26T12:00:00.000Z'),
        hasEvidence: false,
      },
    ]);
    mocks.query.where
      .mockReset()
      .mockReturnValueOnce(mocks.query)
      .mockResolvedValueOnce([
        {
          claimId: 'claim-1',
          caseDueAt: new Date('2026-09-28T12:00:00.000Z'),
          outboundDueAt: null,
        },
      ]);
    const result = await getAssignedStaffClaimAttention(
      staffSession,
      registerAuthority,
      ['claim-1'],
      now
    );
    expect(result['claim-1']).toEqual({
      nextActor: 'member',
      overdueFollowUpDueAt: '2026-09-26T12:00:00.000Z',
    });
    expect(result['claim-1'].overdueFollowUpSource).toBeUndefined();
  });

  it('includes the earliest past case or unanswered outbound follow-up for the assigned claim', async () => {
    mocks.query.where
      .mockReset()
      .mockReturnValueOnce(mocks.query)
      .mockResolvedValueOnce([
        {
          claimId: 'claim-1',
          caseDueAt: new Date('2026-09-28T12:00:00.000Z'),
          outboundDueAt: new Date('2026-09-27T12:00:00.000Z'),
        },
      ]);
    await expect(
      getAssignedStaffClaimAttention(staffSession, registerAuthority, ['claim-1'], now)
    ).resolves.toEqual({
      'claim-1': {
        nextActor: 'untracked',
        overdueFollowUpDueAt: '2026-09-27T12:00:00.000Z',
        overdueFollowUpSource: 'case_register',
      },
    });
    expect(mocks.query.leftJoin).toHaveBeenCalledWith(
      expect.objectContaining({ caseFollowUpAt: 'case_fields.case_follow_up_at' }),
      expect.anything()
    );
    expect(mocks.query.where).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          { op: 'eq', left: 'claim.tenant_id', right: 'tenant-1' },
        ]),
      })
    );
  });

  it('reads no deadlines without the register admission', async () => {
    // The authority carries no principal of this session.
    await expect(
      getAssignedStaffClaimAttention(staffSession, authority, ['claim-1'], now)
    ).resolves.toEqual({ 'claim-1': { nextActor: 'untracked', overdueFollowUpDueAt: null } });
    expect(mocks.query.where).not.toHaveBeenCalled();
  });

  it('limits register deadlines to the branch of a branch-bound staff member', async () => {
    // The test minting helper has no branch; read the same authority with a branch-bound principal.
    const read = vi.mocked(readTenantAuthority);
    const descriptor = read.getMockImplementation()!(registerAuthority);
    read.mockImplementation(() => ({
      ...descriptor,
      principal: { userId: 'staff-1', role: 'staff', branchId: 'branch-1', agentId: null },
    }));
    const branchAuthority = registerAuthority;
    const branchSession = {
      user: { ...staffSession.user, branchId: 'branch-1' },
    } as ClaimsSession;
    mocks.query.where.mockReset().mockReturnValueOnce(mocks.query).mockResolvedValueOnce([]);
    await getAssignedStaffClaimAttention(branchSession, branchAuthority, ['claim-1'], now);
    expect(mocks.query.where).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        conditions: expect.arrayContaining([
          { op: 'eq', left: 'claim.staff_id', right: 'staff-1' },
          { op: 'eq', left: 'claim.branch_id', right: 'branch-1' },
        ]),
      })
    );
    expect(mocks.query.where).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            conditions: expect.arrayContaining([
              { op: 'eq', left: 'claim.staff_id', right: 'staff-1' },
              { op: 'eq', left: 'claim.branch_id', right: 'branch-1' },
            ]),
          }),
        ]),
      })
    );
    read.mockImplementation(descriptorOf);
  });
});
