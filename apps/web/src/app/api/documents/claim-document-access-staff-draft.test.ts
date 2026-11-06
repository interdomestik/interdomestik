import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./durable-case-grants', () => ({
  hasDurableCaseScopedDocumentGrant: vi.fn().mockResolvedValue(true),
}));
vi.mock('./agent-document-scope', () => ({
  hasAgentClaimDocumentScope: vi.fn().mockResolvedValue(false),
}));

import {
  canReadLegacyClaimDocument,
  canReadPolymorphicClaimDocument,
} from './claim-document-access';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';
import { canReadPolymorphicDocument } from './polymorphic-document-access';

const staff = { id: 'staff-1', branchId: 'branch-a' };
const draftClaim = {
  agentId: null,
  branchId: 'branch-a',
  caseLifecycleState: 'draft',
  ownerId: 'member-1',
  staffId: 'staff-1',
};
const legacyDocument = { claimId: 'claim-1', category: 'legal', uploadedBy: 'staff-1' };

function dbWithClaim(row: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([row]) }),
    }),
  };
}

function readLegacy(claim: typeof draftClaim) {
  return canReadLegacyClaimDocument({
    claim,
    db: {} as never,
    document: legacyDocument as never,
    session: { user: staff } as never,
    tenantId: 't1',
    userRole: 'staff',
  });
}

describe('staff document reads on a member draft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies assigned staff, the uploader and a grant holder on a draft legacy document', async () => {
    await expect(readLegacy(draftClaim)).resolves.toBe(false);
    await expect(readLegacy({ ...draftClaim, caseLifecycleState: null as never })).resolves.toBe(
      false
    );
    expect(hasDurableCaseScopedDocumentGrant).not.toHaveBeenCalled();
  });

  it('keeps assigned staff access once the claim is submitted', async () => {
    await expect(readLegacy({ ...draftClaim, caseLifecycleState: 'submitted' })).resolves.toBe(
      true
    );
  });

  it('denies assigned staff a draft polymorphic document even with a durable grant', async () => {
    const row = {
      claimAgentId: null,
      claimBranchId: 'branch-a',
      claimCaseLifecycleState: 'draft',
      claimOwnerId: 'member-1',
      claimStaffId: 'staff-1',
    };
    await expect(
      canReadPolymorphicClaimDocument({
        db: dbWithClaim(row) as never,
        polyDoc: { category: 'legal', entityId: 'claim-1' },
        session: { user: staff } as never,
        tenantId: 't1',
        userRole: 'staff',
      })
    ).resolves.toBe(false);
    expect(hasDurableCaseScopedDocumentGrant).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', false],
    [null, false],
    ['submitted', true],
  ])(
    'treats a staff uploader of a %s claim upload through the polymorphic entry as %s',
    async (lifecycle, allowed) => {
      const row = {
        claimAgentId: null,
        claimBranchId: 'branch-b',
        claimCaseLifecycleState: lifecycle,
        claimOwnerId: 'member-1',
        claimStaffId: null,
      };
      await expect(
        canReadPolymorphicDocument({
          db: dbWithClaim(row) as never,
          polyDoc: {
            category: 'legal',
            entityId: 'claim-1',
            entityType: 'claim',
            id: 'doc-1',
            uploadedBy: 'staff-1',
          },
          session: { user: staff } as never,
          tenantId: 't1',
          userRole: 'staff',
        })
      ).resolves.toBe(allowed);
    }
  );

  it('still lets a member read the documents of their own draft', async () => {
    await expect(
      canReadLegacyClaimDocument({
        claim: draftClaim,
        db: {} as never,
        document: { ...legacyDocument, uploadedBy: 'member-1' } as never,
        session: { user: { id: 'member-1' } } as never,
        tenantId: 't1',
        userRole: 'member',
      })
    ).resolves.toBe(true);
  });
});
