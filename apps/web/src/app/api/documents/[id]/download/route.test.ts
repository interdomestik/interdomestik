import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  logAuditEvent: vi.fn(),
  storageDownload: vi.fn(),
  dbSelect: vi.fn(),
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

vi.mock('@interdomestik/database', () => ({
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

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
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

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/documents/doc-1/download');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when document missing', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    mockSelectChain.where.mockResolvedValue([]);

    const request = new Request('http://localhost:3000/api/documents/doc-404/download');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-404' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Document not found' });
  });

  it('returns 403 and logs audit when forbidden', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    mockSelectChain.where.mockResolvedValue([
      {
        doc: {
          id: 'doc-1',
          claimId: 'claim-1',
          bucket: 'bucket',
          filePath: 'path/file.pdf',
          uploadedBy: 'someone-else',
          name: 'file.pdf',
          fileType: 'application/pdf',
          fileSize: 123,
        },
        claimOwnerId: 'owner-other',
      },
    ]);

    const request = new Request('http://localhost:3000/api/documents/doc-1/download');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({ error: 'Forbidden' });
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.forbidden',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });

  it('streams file and sets content-disposition (attachment by default)', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    // First query (Polymorphic Docs) returns empty
    // Second query (Legacy ClaimDocs) returns found doc
    mockSelectChain.where.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        doc: {
          id: 'doc-1',
          claimId: 'claim-1',
          bucket: 'bucket',
          filePath: 'path/file.pdf',
          uploadedBy: 'someone-else',
          name: 'file.pdf',
          fileType: 'application/pdf',
          fileSize: 123,
        },
        claimOwnerId: 'user-1',
      },
    ]);

    const request = new Request('http://localhost:3000/api/documents/doc-1/download');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');

    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('file.pdf');

    const body = await response.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.download',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });

  it('uses inline disposition when requested', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    // First query (Polymorphic Docs) returns empty
    // Second query (Legacy ClaimDocs) returns found doc
    mockSelectChain.where.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        doc: {
          id: 'doc-1',
          claimId: 'claim-1',
          bucket: 'bucket',
          filePath: 'path/file.pdf',
          uploadedBy: 'someone-else',
          name: 'file.pdf',
          fileType: 'application/pdf',
          fileSize: 123,
        },
        claimOwnerId: 'user-1',
      },
    ]);

    const request = new Request(
      'http://localhost:3000/api/documents/doc-1/download?disposition=inline'
    );
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });

    expect(response.status).toBe(200);
    const contentDisposition = response.headers.get('Content-Disposition');
    expect(contentDisposition).toContain('inline');

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.view',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });
});
