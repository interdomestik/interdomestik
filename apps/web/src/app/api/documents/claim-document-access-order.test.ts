import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./durable-case-grants', () => ({
  hasDurableCaseScopedDocumentGrant: vi.fn().mockResolvedValue(false),
}));
vi.mock('./agent-document-scope', () => ({
  hasAgentClaimDocumentScope: vi.fn().mockResolvedValue(true),
}));

import { canReadPolymorphicClaimDocument } from './claim-document-access';
import { hasAgentClaimDocumentScope } from './agent-document-scope';
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['owner', { id: 'member-1', role: 'member' }, { claimOwnerId: 'member-1' }],
    [
      'active-client agent',
      { id: 'agent-1', role: 'agent' },
      { claimAgentId: 'agent-1', claimOwnerId: 'member-1' },
    ],
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

  it('asks the agent scope with the claim attribution, owner and branch in the access tenant', async () => {
    const claim = { claimAgentId: 'agent-1', claimOwnerId: 'member-1', claimBranchId: 'branch-a' };
    await canReadPolymorphicClaimDocument({
      ...baseArgs,
      db: dbWithClaim(claim) as never,
      session: { user: { id: 'agent-1', branchId: 'session-branch' } },
      userRole: 'agent',
    });

    expect(hasAgentClaimDocumentScope).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        claim: expect.objectContaining({
          agentId: 'agent-1',
          ownerId: 'member-1',
          branchId: 'branch-a',
        }),
        tenantId: 't1',
      })
    );
  });

  it('falls through to case grants when the agent has no client scope', async () => {
    vi.mocked(hasAgentClaimDocumentScope).mockResolvedValueOnce(false);
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValueOnce(true);

    await expect(
      canReadPolymorphicClaimDocument({
        ...baseArgs,
        db: dbWithClaim({ claimAgentId: 'agent-1', claimOwnerId: 'member-1' }) as never,
        session: { user: { id: 'agent-1' } },
        userRole: 'agent',
      })
    ).resolves.toBe(true);
    expect(hasDurableCaseScopedDocumentGrant).toHaveBeenCalled();
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
