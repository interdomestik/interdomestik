import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentAccessDeps, getDocumentAccessCore } from './_core';

const mockDb = { select: vi.fn() } as any;
const mockStorage = { createSignedUrl: vi.fn(), download: vi.fn() };
const mockDeps: DocumentAccessDeps = { db: mockDb, storage: mockStorage };

const memberSession = { user: { id: 'member-1', role: 'member', tenantId: 't1' } };
const otherMemberSession = { user: { id: 'member-2', role: 'member', tenantId: 't1' } };
const branchManagerSession = {
  user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
};

const branchScopedClaimRow = {
  claimOwnerId: 'member-1',
  claimBranchId: 'branch-a',
  claimStaffId: 'staff-2',
};

const polymorphicDocs = {
  profile: {
    id: 'doc-profile',
    entityType: 'member',
    entityId: 'member-1',
    storagePath: 'path/to/profile',
    uploadedBy: 'staff-1',
    tenantId: 't1',
  },
  claim: {
    id: 'doc1',
    entityType: 'claim',
    entityId: 'claim-1',
    storagePath: 'path',
    uploadedBy: 'other',
    tenantId: 't1',
  },
  policy: {
    id: 'doc-policy',
    entityType: 'policy',
    entityId: 'policy-1',
    storagePath: 'path/to/policy',
    uploadedBy: 'staff-1',
    tenantId: 't1',
  },
};

const legacyDoc = {
  id: 'doc1',
  claimId: 'claim-1',
  bucket: 'claim-evidence',
  filePath: 'path',
  uploadedBy: 'other-user',
};

function createSelectMock(result: any[], isLegacy = false) {
  const chain: any = { where: vi.fn().mockResolvedValue(result) };
  if (isLegacy) chain.leftJoin = vi.fn().mockReturnValue(chain);
  return { from: vi.fn().mockReturnValue(chain) };
}

function setupMocks(poly: any[] = [], legacy: any[] = []) {
  mockDb.select.mockReset();
  mockDb.select.mockReturnValueOnce(createSelectMock(poly));
  mockDb.select.mockReturnValueOnce(createSelectMock(legacy, true));
}

async function execAccess(session: any, docId: string) {
  return getDocumentAccessCore({ session, documentId: docId, mode: 'download', deps: mockDeps });
}

describe('getDocumentAccessCore Hardening', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Polymorphic Documents', () => {
    it('allows access to own profile document', async () => {
      setupMocks([polymorphicDocs.profile]);
      expect((await execAccess(memberSession, 'doc-profile')).ok).toBe(true);
    });

    it('denies access to other member profile', async () => {
      setupMocks([polymorphicDocs.profile]);
      const res = await execAccess(otherMemberSession, 'doc-profile');
      expect(res).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows access to documents in own claim', async () => {
      setupMocks([polymorphicDocs.claim], [branchScopedClaimRow]);
      expect((await execAccess(memberSession, 'doc1')).ok).toBe(true);
    });

    it('denies access to other member claim', async () => {
      setupMocks([polymorphicDocs.claim], [branchScopedClaimRow]);
      const res = await execAccess(otherMemberSession, 'doc1');
      expect(res).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows access to own policy document', async () => {
      setupMocks([polymorphicDocs.policy], [{ policyOwnerId: 'member-1' }]);
      expect((await execAccess(memberSession, 'doc-policy')).ok).toBe(true);
    });

    it('denies access if tenant mismatches', async () => {
      setupMocks([], []);
      const session = { user: { ...memberSession.user, tenantId: 'wrong' } };
      const res = await execAccess(session, 'doc1');
      expect(res).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Document not found' });
    });
  });

  describe('Legacy Claim Documents', () => {
    it('denies staff access outside branch', async () => {
      setupMocks([], [{ doc: legacyDoc, ...branchScopedClaimRow, claimBranchId: 'branch-b' }]);
      const session = { user: { id: 's1', role: 'staff', tenantId: 't1', branchId: 'branch-a' } };
      expect(await execAccess(session, 'doc1')).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    });

    it('allows claim owner access to legacy docs', async () => {
      setupMocks([], [{ doc: legacyDoc, ...branchScopedClaimRow }]);
      expect((await execAccess(memberSession, 'doc1')).ok).toBe(true);
    });
  });

  describe('Role-based Access', () => {
    it('allows admin full access', async () => {
      setupMocks([polymorphicDocs.profile]);
      const session = { user: { id: 'a1', role: 'admin', tenantId: 't1' } };
      expect((await execAccess(session, 'doc-profile')).ok).toBe(true);
    });

    it('allows branch manager access within branch', async () => {
      setupMocks([polymorphicDocs.claim], [branchScopedClaimRow]);
      expect((await execAccess(branchManagerSession, 'doc1')).ok).toBe(true);
    });
  });
});
