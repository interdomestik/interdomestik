import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

/** The audit row was written under the session authority of this tenant. */
const auditTenant = (tenantId: string) =>
  expect.toSatisfy(
    (authority: TenantAuthority) => readTenantAuthority(authority).tenantId === tenantId
  );

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  logAuditEvent: vi.fn(),
  storageDownload: vi.fn(),
  dbSelect: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoisted.logAuditEvent,
}));

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
};

type ClaimDocumentRowInput = {
  readonly uploadedBy: string;
  readonly claimOwnerId: string;
  readonly claimStaffId?: string;
  readonly name?: string;
};

// A legacy claim document joined with its claim's owner (and assigned staff, when given).
function claimDocumentRow({ uploadedBy, claimOwnerId, claimStaffId, name }: ClaimDocumentRowInput) {
  return {
    doc: {
      id: 'doc-1',
      claimId: 'claim-1',
      bucket: 'claim-evidence',
      filePath: 'pii/tenants/tenant_mk/claims/claim-1/file.pdf',
      uploadedBy,
      name: name ?? 'file.pdf',
      fileType: 'application/pdf',
      fileSize: 123,
    },
    claimOwnerId,
    claimCaseLifecycleState: 'submitted',
    ...(claimStaffId === undefined ? {} : { claimStaffId }),
  };
}

// First query (Polymorphic Docs) returns empty; second query (Legacy ClaimDocs) returns the row.
function mockLegacyClaimDocument(row: ReturnType<typeof claimDocumentRow>): void {
  mockSelectChain.where.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
}

function mockAssignedClaimDocument(claimStaffId: string) {
  mockLegacyClaimDocument(
    claimDocumentRow({ uploadedBy: 'user-1', claimOwnerId: 'user-1', claimStaffId })
  );
}

function signIn(id: string, role: string): void {
  hoisted.getSession.mockResolvedValue({ user: { id, role, tenantId: 'tenant_mk' } });
}

function download(id: string, query = ''): Promise<Response> {
  const request = new Request(`http://localhost:3000/api/documents/${id}/download${query}`);
  return GET(request, { params: Promise.resolve({ id }) });
}

vi.mock('@interdomestik/database', () => ({
  withTenantContext: vi.fn(async (_context, action) => action({ select: hoisted.dbSelect })),
  db: {
    select: hoisted.dbSelect,
  },
  documents: { id: 'id', tenantId: 'tenant_id' },
  claimDocuments: { tenantId: 'claim_documents.tenant_id' },
  claims: { userId: 'user_id' },
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: hoisted.storageDownload,
      }),
    },
  }),
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();

  return {
    ...actual,
    eq: vi.fn(),
    and: vi.fn(),
    relations: vi.fn(),
  };
});

vi.mock('@sentry/nextjs', () => ({
  setTag: hoisted.setTag,
}));

describe('GET /api/documents/[id]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.dbSelect.mockReturnValue(mockSelectChain);
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.leftJoin.mockReturnThis();
    mockSelectChain.where.mockResolvedValue([]);

    hoisted.storageDownload.mockResolvedValue({
      data: new Blob(['hello'], { type: 'text/plain' }),
      error: null,
    });
  });

  it.each([
    ['no session', null],
    ['a session without a user', { session: { id: 'session-1' }, user: null }],
  ])('returns 401 when unauthenticated (%s)', async (_name, session) => {
    hoisted.getSession.mockResolvedValue(session);

    const response = await download('doc-1');
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when document missing', async () => {
    signIn('user-1', 'user');
    mockSelectChain.where.mockResolvedValue([]);

    const response = await download('doc-404');
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Document not found' });
  });

  it('returns 403 and logs audit when forbidden', async () => {
    signIn('user-1', 'user');
    mockSelectChain.where.mockResolvedValue([
      claimDocumentRow({ uploadedBy: 'someone-else', claimOwnerId: 'owner-other' }),
    ]);

    const response = await download('doc-1');
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({ error: 'Forbidden' });
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: auditTenant('tenant_mk'),
        action: 'document.forbidden',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });

  it.each(['', '?disposition=inline', '?disposition=attachment'])(
    'denies branch managers before storage download (%s) and records the denial',
    async query => {
      signIn('user-1', 'branch_manager');
      const response = await download('doc-1', query);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
      expect(hoisted.storageDownload).not.toHaveBeenCalled();
      expect(hoisted.dbSelect).not.toHaveBeenCalled();
      expect(hoisted.logAuditEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          action: 'document.forbidden',
          entityId: 'doc-1',
          actorRole: 'branch_manager',
        })
      );
    }
  );

  it('denies staff who are not assigned to the claim', async () => {
    signIn('staff-other', 'staff');
    mockAssignedClaimDocument('staff-assigned');

    const response = await download('doc-1');

    expect(response.status).toBe(403);
    expect(hoisted.storageDownload).not.toHaveBeenCalled();
  });

  it('allows the staff member assigned to the claim', async () => {
    signIn('staff-assigned', 'staff');
    mockAssignedClaimDocument('staff-assigned');

    const response = await download('doc-1');

    expect(response.status).toBe(200);
    expect(hoisted.storageDownload).toHaveBeenCalledTimes(1);
  });

  it('streams file and sets content-disposition (attachment by default)', async () => {
    signIn('user-1', 'user');
    mockLegacyClaimDocument(
      claimDocumentRow({ uploadedBy: 'someone-else', claimOwnerId: 'user-1' })
    );

    const response = await download('doc-1');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');

    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('file.pdf');

    const body = await response.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: auditTenant('tenant_mk'),
        action: 'document.download',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
    expect(hoisted.setTag).toHaveBeenCalledWith('slo_alert', 'd07.document.download');
  });

  it('uses inline disposition when requested', async () => {
    signIn('user-1', 'user');
    mockLegacyClaimDocument(
      claimDocumentRow({
        uploadedBy: 'someone-else',
        claimOwnerId: 'user-1',
        name: 'IHÇK SHKURT 2026.pdf',
      })
    );

    const response = await download('doc-1', '?disposition=inline');

    expect(response.status).toBe(200);
    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toBe(
      'inline; filename="IHCK SHKURT 2026.pdf"; filename*=UTF-8\'\'IHC%CC%A7K%20SHKURT%202026.pdf'
    );

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: auditTenant('tenant_mk'),
        action: 'document.view',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });
});
