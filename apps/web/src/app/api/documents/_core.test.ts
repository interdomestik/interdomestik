import { beforeEach, describe, expect, it, vi } from 'vitest';

type TenantRun = (context: unknown, action: (tx: never) => unknown) => unknown;
const tenantContext = vi.hoisted(() => ({ run: vi.fn<TenantRun>() }));
vi.mock('@interdomestik/database', async importActual => ({
  ...(await importActual<typeof import('@interdomestik/database')>()),
  withTenantContext: tenantContext.run,
}));
import { sessionAuthority, tenantContextOf } from './document-access.test-support';
import {
  buildContentDispositionHeader,
  DocumentAccessDeps,
  getDocumentAccessCore,
  safeFilename,
} from './_core';

// withTenantContext opens the local transaction (`mockDb`); the base client is the fallback.
const mockDb = { select: vi.fn() };
const mockBaseDb = { select: vi.fn() };
const mockStorage = { createSignedUrl: vi.fn(), download: vi.fn() };
const tenantRun = tenantContext.run.mockImplementation((_, action) => action(mockDb as never));
const mockDeps: DocumentAccessDeps = {
  db: mockBaseDb as unknown as DocumentAccessDeps['db'],
  storage: mockStorage,
};

const memberSession = { user: { id: 'member-1', role: 'member', tenantId: 't1' } };
const otherMemberSession = { user: { id: 'member-2', role: 'member', tenantId: 't1' } };
const branchManagerSession = {
  user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
};
const agentSession = { user: { id: 'agent-1', role: 'agent', tenantId: 't1' } };

const branchScopedClaimRow = {
  claimOwnerId: 'member-1',
  claimBranchId: 'branch-a',
  claimStaffId: 'staff-2',
  claimAgentId: null,
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

type SelectMockChain = {
  where: ReturnType<typeof vi.fn>;
  leftJoin?: ReturnType<typeof vi.fn>;
};

function createSelectMock(result: unknown[], isLegacy = false) {
  const chain: SelectMockChain = { where: vi.fn().mockResolvedValue(result) };
  if (isLegacy) chain.leftJoin = vi.fn().mockReturnValue(chain);
  return { from: vi.fn().mockReturnValue(chain) };
}

function setupMocks(poly: unknown[] = [], legacy: unknown[] = []) {
  mockDb.select.mockReset().mockReturnValue(createSelectMock([], true));
  mockDb.select.mockReturnValueOnce(createSelectMock(poly));
  mockDb.select.mockReturnValueOnce(createSelectMock(legacy, true));
  mockBaseDb.select.mockReset().mockReturnValue(createSelectMock([]));
}

/** Queues the agent's tenant row (branch A) and its active link to the claim owner. */
function grantAgentScope() {
  mockDb.select.mockReturnValueOnce(createSelectMock([{ branchId: 'branch-a' }]));
  mockDb.select.mockReturnValueOnce(createSelectMock([{ id: 'link-1' }]));
}

type CoreSession = Parameters<typeof getDocumentAccessCore>[0]['session'];
const execAccess = (session: CoreSession, documentId: string, mode: Mode = 'download') => {
  const authority = sessionAuthority(session);
  return getDocumentAccessCore({ authority, deps: mockDeps, documentId, mode, session });
};
type Mode = 'download' | 'signed_url';

describe('getDocumentAccessCore Hardening', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('content disposition filename safety', () => {
    it('uses a byte-safe fallback filename while preserving UTF-8 filename metadata', () => {
      const filename = 'IHÇK SHKURT 2026.pdf';

      expect(safeFilename(filename)).toBe('IHCK SHKURT 2026.pdf');
      expect(buildContentDispositionHeader({ disposition: 'inline', filename })).toBe(
        'inline; filename="IHCK SHKURT 2026.pdf"; filename*=UTF-8\'\'IHC%CC%A7K%20SHKURT%202026.pdf'
      );
    });
  });

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

    it('returns signed-url audit metadata for claim documents', async () => {
      setupMocks([polymorphicDocs.claim], [branchScopedClaimRow]);

      expect(await execAccess(memberSession, 'doc1', 'signed_url')).toEqual(
        expect.objectContaining({
          ok: true,
          document: expect.objectContaining({
            id: 'doc1',
            bucket: 'claim-evidence',
            filePath: 'path',
          }),
          audit: {
            action: 'document.signed_url_issued',
            entityType: 'claim_document',
            entityId: 'doc1',
            actorRole: 'member',
            metadata: {
              claimId: null,
              bucket: 'claim-evidence',
              filePath: 'path',
              expiresInSeconds: 300,
            },
          },
        })
      );
    });

    it('denies access to other member claim', async () => {
      setupMocks([polymorphicDocs.claim], [branchScopedClaimRow]);
      const res = await execAccess(otherMemberSession, 'doc1');
      expect(res).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows assigned agent access to claim document', async () => {
      setupMocks([polymorphicDocs.claim], [{ ...branchScopedClaimRow, claimAgentId: 'agent-1' }]);
      grantAgentScope();
      expect((await execAccess(agentSession, 'doc1')).ok).toBe(true);
    });

    it('denies unassigned agent access to claim document', async () => {
      setupMocks([polymorphicDocs.claim], [{ ...branchScopedClaimRow, claimAgentId: 'agent-2' }]);
      const res = await execAccess(agentSession, 'doc1');
      expect(res).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('denies unassigned agent access to claim document they uploaded', async () => {
      setupMocks(
        [{ ...polymorphicDocs.claim, uploadedBy: 'agent-1' }],
        [{ ...branchScopedClaimRow, claimAgentId: 'agent-2' }]
      );
      const res = await execAccess(agentSession, 'doc1');
      expect(res).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows access to own policy document', async () => {
      setupMocks([polymorphicDocs.policy], [{ policyOwnerId: 'member-1' }]);
      expect((await execAccess(memberSession, 'doc-policy')).ok).toBe(true);
    });

    it('uses the policy storage bucket for policy documents', async () => {
      setupMocks([polymorphicDocs.policy], [{ policyOwnerId: 'member-1' }]);

      await expect(execAccess(memberSession, 'doc-policy')).resolves.toEqual(
        expect.objectContaining({
          ok: true,
          audit: expect.objectContaining({
            entityType: 'policy_document',
          }),
          document: expect.objectContaining({
            bucket: 'policies',
            filePath: 'path/to/policy',
          }),
        })
      );
    });

    it('denies policy document access to uploader when the policy belongs to another member', async () => {
      setupMocks(
        [{ ...polymorphicDocs.policy, uploadedBy: 'member-1' }],
        [{ policyOwnerId: 'member-2' }]
      );

      await expect(execAccess(memberSession, 'doc-policy')).resolves.toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    });

    it('denies access if tenant mismatches', async () => {
      setupMocks([], []);
      const session = { user: { ...memberSession.user, tenantId: 'wrong' } };
      const res = await execAccess(session, 'doc1');
      expect(res).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Document not found' });
      const context = tenantContextOf(tenantRun.mock.calls[0]?.[0]);
      expect(context).toEqual({ accessTenantId: 'wrong', role: 'member', tenantId: 'wrong' });
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
      expect(mockBaseDb.select).not.toHaveBeenCalled();
    });

    it('allows assigned agent access to legacy docs', async () => {
      setupMocks([], [{ doc: legacyDoc, ...branchScopedClaimRow, claimAgentId: 'agent-1' }]);
      grantAgentScope();
      expect((await execAccess(agentSession, 'doc1')).ok).toBe(true);
    });

    it('denies unassigned agent access to legacy docs', async () => {
      setupMocks([], [{ doc: legacyDoc, ...branchScopedClaimRow, claimAgentId: 'agent-2' }]);
      expect(await execAccess(agentSession, 'doc1')).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
    });

    it('denies unassigned agent access to legacy docs they uploaded', async () => {
      setupMocks(
        [],
        [
          {
            doc: { ...legacyDoc, uploadedBy: 'agent-1' },
            ...branchScopedClaimRow,
            claimAgentId: 'agent-2',
          },
        ]
      );
      expect(await execAccess(agentSession, 'doc1')).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });
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
