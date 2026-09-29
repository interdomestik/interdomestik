import { beforeEach, describe, expect, it, vi } from 'vitest';

import { safePublicStatusNote } from './rejected-claim-public-note';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  claimEscalationAgreements: {
    claimId: 'agreement.claimId',
    declineReasonCode: 'agreement.declineReasonCode',
    tenantId: 'agreement.tenantId',
  },
  eq: vi.fn((column, value) => ({ column, value })),
}));
vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: mocks.withTenant }));

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: mocks.limit })),
    })),
  })),
} as unknown as Parameters<typeof safePublicStatusNote>[0];
const context = {
  claimId: 'claim-1',
  currentStatus: 'rejected' as const,
  isPublicChange: true,
  note: 'The member committed fraud',
  tenantId: 'tenant-1',
};

describe('rejected claim public notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([[{ declineReasonCode: 'conflict_or_integrity_concern' }], []])(
    'keeps a sensitive or missing decision generic',
    async (...rows) => {
      mocks.limit.mockResolvedValue(rows);

      expect(await safePublicStatusNote(tx, context)).toBe(
        'We cannot accept this matter for staff-led recovery.'
      );
      expect(mocks.withTenant).toHaveBeenCalledWith('tenant-1', 'agreement.tenantId', {
        column: 'agreement.claimId',
        value: 'claim-1',
      });
    }
  );

  it('keeps a public follow-up note for a non-sensitive decline', async () => {
    mocks.limit.mockResolvedValue([{ declineReasonCode: 'insufficient_evidence' }]);

    expect(await safePublicStatusNote(tx, { ...context, note: '  More documents needed  ' })).toBe(
      'More documents needed'
    );
  });

  it('does not alter a private staff note', async () => {
    expect(await safePublicStatusNote(tx, { ...context, isPublicChange: false })).toBe(
      context.note
    );
    expect(mocks.limit).not.toHaveBeenCalled();
  });
});
