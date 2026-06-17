import { beforeEach, describe, expect, it, vi } from 'vitest';

const sqlMocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, and: sqlMocks.and, eq: sqlMocks.eq };
});

import { getDocumentAccessCore, type DocumentAccessDeps } from './_core';

const mockDb = { select: vi.fn() };
const mockDeps: DocumentAccessDeps = {
  db: mockDb as unknown as DocumentAccessDeps['db'],
  storage: {
    createSignedUrl: vi.fn(),
    download: vi.fn(),
  },
};

function selectResult(rows: unknown[]) {
  const chain = { where: vi.fn().mockResolvedValue(rows) };
  return { from: vi.fn().mockReturnValue(chain) };
}

describe('getDocumentAccessCore access tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnValue(
      selectResult([
        {
          id: 'doc-1',
          entityType: 'claim',
          entityId: 'claim-1',
          fileName: 'legal.pdf',
          mimeType: 'application/pdf',
          fileSize: 10,
          storagePath: 'pii/tenants/tenant_access/claims/claim-1/legal.pdf',
          uploadedBy: 'member-1',
        },
      ])
    );
  });

  it('uses accessTenantId instead of legal, recovery, booking, host, or ambient tenant values', async () => {
    const session = {
      user: {
        id: 'support-1',
        role: 'global_support',
        tenantId: 'tenant_legal_compat',
        accessTenantId: 'tenant_access',
        legalTenantId: 'tenant_legal',
        recoveryLegalTenantId: 'tenant_recovery',
        bookingTenantId: 'tenant_booking',
        hostTenantId: 'tenant_host',
      },
    };

    const result = await getDocumentAccessCore({
      deps: mockDeps,
      documentId: 'doc-1',
      mode: 'download',
      session,
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, tenantId: 'tenant_access' }));
    expect(sqlMocks.eq).toHaveBeenCalledWith(expect.anything(), 'tenant_access');
    expect(sqlMocks.eq).not.toHaveBeenCalledWith(expect.anything(), 'tenant_legal_compat');
    expect(sqlMocks.eq).not.toHaveBeenCalledWith(expect.anything(), 'tenant_legal');
    expect(sqlMocks.eq).not.toHaveBeenCalledWith(expect.anything(), 'tenant_recovery');
  });
});
