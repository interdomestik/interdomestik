import { describe, expect, it, vi } from 'vitest';

vi.mock('./durable-case-grants', () => ({
  hasDurableCaseScopedDocumentGrant: vi.fn().mockResolvedValue(false),
}));

import { canReadPolymorphicClaimDocument } from './claim-document-access';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

const baseArgs = {
  polyDoc: { category: 'legal', entityId: 'claim-1' },
  tenantId: 't1',
};

function dbWithClaim(row: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([row]),
      }),
    }),
  };
}

describe('canReadPolymorphicClaimDocument access ordering', () => {
  it.each([
    ['owner', { id: 'member-1', role: 'member' }, { claimOwnerId: 'member-1' }],
    ['assigned agent', { id: 'agent-1', role: 'agent' }, { claimAgentId: 'agent-1' }],
  ])('keeps same-tenant %s access ahead of durable grant lookup', async (_label, user, claim) => {
    await expect(
      canReadPolymorphicClaimDocument({
        ...baseArgs,
        db: dbWithClaim(claim) as never,
        session: { user },
        userRole: user.role,
      })
    ).resolves.toBe(true);
    expect(hasDurableCaseScopedDocumentGrant).not.toHaveBeenCalled();
  });

  it('uses durable grant fallback for otherwise unauthorized claim documents', async () => {
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValueOnce(true);

    await expect(
      canReadPolymorphicClaimDocument({
        ...baseArgs,
        db: dbWithClaim({ claimOwnerId: 'member-1' }) as never,
        session: { user: { id: 'local-legal-1' } },
        userRole: 'staff',
      })
    ).resolves.toBe(true);
    expect(hasDurableCaseScopedDocumentGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'local-legal-1',
        caseId: 'claim-1',
        documentClass: 'legal',
      })
    );
  });
});
