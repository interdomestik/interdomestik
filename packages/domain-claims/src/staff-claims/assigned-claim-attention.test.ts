import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsSession } from '../claims/types';

const mocks = vi.hoisted(() => {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
  };
  return {
    query,
    select: vi.fn(),
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
  claims: { id: 'claim.id', tenantId: 'claim.tenant_id', staffId: 'claim.staff_id' },
  and: mocks.and,
  eq: mocks.eq,
  inArray: mocks.inArray,
  withTenantContext: (
    _context: unknown,
    action: (tx: { select: typeof mocks.select }) => unknown
  ) => action({ select: mocks.select }),
}));

import {
  deriveAssignedClaimAttention,
  getAssignedStaffClaimAttention,
} from './assigned-claim-attention';

const now = new Date('2026-09-29T12:00:00.000Z');
const staffSession = {
  user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
} as ClaimsSession;

describe('deriveAssignedClaimAttention', () => {
  it('separates member wait from staff review and flags only a passed saved request date', () => {
    const attention = deriveAssignedClaimAttention(
      ['member-case', 'staff-case', 'no-request'],
      [
        {
          claimId: 'member-case',
          requestId: 'request-1',
          dueAt: new Date('2026-09-29T11:59:59.000Z'),
          submittedAt: null,
        },
        {
          claimId: 'staff-case',
          requestId: 'request-2',
          dueAt: new Date('2026-09-28T00:00:00.000Z'),
          submittedAt: new Date('2026-09-29T09:00:00.000Z'),
        },
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
      ['case-1'],
      [
        { claimId: 'case-1', requestId: 'r1', dueAt: now, submittedAt: null },
        {
          claimId: 'case-1',
          requestId: 'r2',
          dueAt: new Date('2026-09-28T00:00:00.000Z'),
          submittedAt: null,
        },
        {
          claimId: 'case-1',
          requestId: 'r3',
          dueAt: new Date('2026-09-27T00:00:00.000Z'),
          submittedAt: new Date('2026-09-28T00:00:00.000Z'),
        },
      ],
      now
    );
    expect(attention['case-1']).toEqual({
      nextActor: 'staff',
      overdueFollowUpDueAt: '2026-09-28T00:00:00.000Z',
    });
  });
});

describe('getAssignedStaffClaimAttention', () => {
  beforeEach(() => {
    mocks.select.mockReset().mockReturnValue(mocks.query);
    mocks.query.from.mockReturnValue(mocks.query);
    mocks.query.innerJoin.mockReturnValue(mocks.query);
    mocks.query.leftJoin.mockReturnValue(mocks.query);
    mocks.query.where.mockReset().mockResolvedValue([]);
  });

  it('denies non-staff and never queries their claim IDs', async () => {
    await expect(
      getAssignedStaffClaimAttention(
        { user: { ...staffSession.user, role: 'branch_manager' } } as ClaimsSession,
        ['claim-1']
      )
    ).rejects.toThrow('Staff access required');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('scopes the read by tenant, open request, selected claims and assigned staff', async () => {
    const result = await getAssignedStaffClaimAttention(staffSession, ['claim-1'], now);

    expect(result['claim-1']).toEqual({ nextActor: 'untracked', overdueFollowUpDueAt: null });
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
    mocks.query.where.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(getAssignedStaffClaimAttention(staffSession, ['claim-1'])).rejects.toThrow(
      'database unavailable'
    );
  });
});
