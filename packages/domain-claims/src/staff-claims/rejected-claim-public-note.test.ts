import { beforeEach, describe, expect, it, vi } from 'vitest';

import { safePublicStatusNote } from './rejected-claim-public-note';

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  claimEscalationAgreements: {
    claimId: 'agreement.claimId',
    decisionType: 'agreement.decisionType',
    declineReasonCode: 'agreement.declineReasonCode',
    tenantId: 'agreement.tenantId',
  },
  eq: vi.fn((column, value) => ({ column, value })),
}));
vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: mocks.withTenant }));

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({ limit: mocks.lock })),
      })),
    })),
  })),
} as unknown as Parameters<typeof safePublicStatusNote>[0];
const context = {
  claimId: 'claim-1',
  fromStatus: 'rejected' as const,
  isPublic: true,
  note: 'The member committed fraud',
  tenantId: 'tenant-1',
};

describe('rejected claim public notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      label: 'a sensitive decision on a rejected claim',
      fromStatus: 'rejected' as const,
      rows: [{ decisionType: 'declined', declineReasonCode: 'conflict_or_integrity_concern' }],
    },
    {
      label: 'a sensitive decision before the claim is rejected',
      fromStatus: 'evaluation' as const,
      rows: [{ decisionType: 'declined', declineReasonCode: 'conflict_or_integrity_concern' }],
    },
    {
      label: 'a declined decision with no category',
      fromStatus: 'evaluation' as const,
      rows: [{ decisionType: 'declined', declineReasonCode: null }],
    },
    {
      label: 'a missing decision on a rejected claim',
      fromStatus: 'rejected' as const,
      rows: [],
    },
  ])('keeps $label generic', async ({ fromStatus, rows }) => {
    mocks.lock.mockResolvedValueOnce(rows);

    expect(await safePublicStatusNote(tx, { ...context, fromStatus })).toBe(
      'We cannot accept this matter for staff-led recovery.'
    );
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledWith(1);
    expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', 'agreement.tenantId', {
      column: 'agreement.claimId',
      value: 'claim-1',
    });
  });

  it('keeps a public follow-up note for a non-sensitive decline', async () => {
    mocks.lock.mockResolvedValueOnce([
      { decisionType: 'declined', declineReasonCode: 'insufficient_evidence' },
    ]);

    expect(await safePublicStatusNote(tx, { ...context, note: '  More documents needed  ' })).toBe(
      'More documents needed'
    );
  });

  it('does not alter a private staff note', async () => {
    expect(await safePublicStatusNote(tx, { ...context, isPublic: false })).toBe(context.note);
    expect(mocks.lock).not.toHaveBeenCalled();
  });
});
