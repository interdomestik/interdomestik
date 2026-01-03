import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  logAuditEvent: vi.fn(),
  createSignedUrl: vi.fn(),
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
  claimDocuments: { tenantId: 'claim_documents.tenant_id' },
  claims: { userId: 'user_id' },
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: hoisted.createSignedUrl,
      }),
    },
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

describe('GET /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.dbSelect.mockReturnValue(mockSelectChain);
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.leftJoin.mockReturnThis();
    mockSelectChain.where.mockResolvedValue([]);

    hoisted.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/file' },
      error: null,
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/documents/doc-1');
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

    const request = new Request('http://localhost:3000/api/documents/doc-404');
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

    const request = new Request('http://localhost:3000/api/documents/doc-1');
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

  it('returns 200 with signed url and logs audit when allowed', async () => {
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
        claimOwnerId: 'user-1',
      },
    ]);

    const request = new Request('http://localhost:3000/api/documents/doc-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      url: 'https://signed.example.com/file',
      name: 'file.pdf',
      type: 'application/pdf',
      size: 123,
      expiresIn: 300,
    });

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.signed_url_issued',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });
});
