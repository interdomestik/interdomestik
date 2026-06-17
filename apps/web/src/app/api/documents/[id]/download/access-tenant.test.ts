import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  logAuditEvent: vi.fn(),
  storageDownload: vi.fn(),
  dbSelect: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: hoisted.getSession } } }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: hoisted.logAuditEvent }));
vi.mock('@sentry/nextjs', () => ({ setTag: hoisted.setTag }));

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
};

vi.mock('@interdomestik/database', () => ({
  db: { select: hoisted.dbSelect },
  documents: { id: 'id', tenantId: 'tenant_id' },
  claimDocuments: { tenantId: 'claim_documents.tenant_id' },
  claims: { userId: 'user_id' },
  createAdminClient: () => ({ storage: { from: () => ({ download: hoisted.storageDownload }) } }),
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, and: vi.fn(), eq: vi.fn(), relations: vi.fn() };
});

import { GET } from './route';

describe('GET /api/documents/[id]/download access tenant audit', () => {
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

  it('uses access tenant for allowed download audit records', async () => {
    hoisted.getSession.mockResolvedValue({
      user: {
        accessTenantId: 'tenant_access',
        id: 'user-1',
        role: 'user',
        tenantId: 'tenant_legal_compat',
      },
    });
    mockSelectChain.where.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        claimOwnerId: 'user-1',
        doc: {
          bucket: 'claim-evidence',
          claimId: 'claim-1',
          filePath: 'pii/tenants/tenant_access/claims/claim-1/file.pdf',
          fileSize: 123,
          fileType: 'application/pdf',
          id: 'doc-1',
          name: 'file.pdf',
          uploadedBy: 'someone-else',
        },
      },
    ]);

    const request = new Request('http://localhost:3000/api/documents/doc-1/download');
    const response = await GET(request, { params: Promise.resolve({ id: 'doc-1' }) });

    expect(response.status).toBe(200);
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'document.download', tenantId: 'tenant_access' })
    );
    expect(hoisted.logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_legal_compat' })
    );
  });
});
