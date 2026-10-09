import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function mockAuthenticatedMember(): void {
  hoisted.getSession.mockResolvedValue({
    user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
  });
}

function mockLegacyDocumentAccess(uploadedBy = 'user-1'): void {
  mockSelectChain.where.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      doc: {
        id: 'doc-1',
        claimId: 'claim-1',
        bucket: 'claim-evidence',
        filePath: 'pii/tenants/tenant_mk/claims/claim-1/file.pdf',
        uploadedBy,
        name: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 123,
      },
      claimOwnerId: 'user-1',
    },
  ]);
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
        createSignedUrl: hoisted.createSignedUrl,
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

  afterEach(() => {
    vi.unstubAllEnvs();
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
          bucket: 'claim-evidence',
          filePath: 'pii/tenants/tenant_mk/claims/claim-1/file.pdf',
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

  it('fails closed without recording issuance when storage signing fails', async () => {
    mockAuthenticatedMember();
    mockLegacyDocumentAccess();
    hoisted.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error('signing unavailable'),
    });

    const request = new Request('http://localhost:3000/api/documents/doc-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to generate download URL' });
    expect(hoisted.logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'document.signed_url_issued' })
    );
  });

  it('returns 200 with signed url and logs audit when allowed', async () => {
    mockAuthenticatedMember();
    mockLegacyDocumentAccess('someone-else');

    const request = new Request('http://localhost:3000/api/documents/doc-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(data).toEqual({
      url: 'https://signed.example.com/file',
      name: 'file.pdf',
      type: 'application/pdf',
      size: 123,
      expiresIn: 300,
    });
    expect(hoisted.createSignedUrl).toHaveBeenCalledWith(
      'pii/tenants/tenant_mk/claims/claim-1/file.pdf',
      300,
      { download: 'file.pdf' }
    );

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document.signed_url_issued',
        entityType: 'claim_document',
        entityId: 'doc-1',
      })
    );
  });

  it('uses the authenticated download proxy only for deterministic local E2E storage', async () => {
    vi.stubEnv('INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING', '1');
    vi.stubEnv('INTERDOMESTIK_LOCAL_E2E', '1');
    vi.stubEnv('PLAYWRIGHT', '1');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    mockAuthenticatedMember();
    mockLegacyDocumentAccess();

    const request = new Request('http://localhost:3000/api/documents/doc-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        url: '/api/documents/doc-1/download',
        delivery: 'authenticated-proxy',
      })
    );
    expect(hoisted.createSignedUrl).not.toHaveBeenCalled();
  });
});
