import { beforeEach, describe, expect, it, vi } from 'vitest';

type StagedWrite = { table: string; values: Record<string, unknown> };
type QueryChain = {
  for: () => Promise<unknown[]>;
  from: () => QueryChain;
  limit: () => Promise<unknown[]>;
  where: () => QueryChain;
};

const hoisted = vi.hoisted(() => {
  const table = (tableName: string, columns: string[]) => ({
    tableName,
    ...Object.fromEntries(columns.map(column => [column, `${tableName}.${column}`])),
  });
  return {
    committed: [] as Array<{ table: string; values: Record<string, unknown> }>,
    contexts: [] as unknown[],
    failTable: { value: null as string | null },
    globalTransaction: vi.fn(),
    selectRows: [] as unknown[][],
    tables: {
      auditLog: table('audit_log', []),
      claimDocuments: table('claim_documents', ['id', 'tenantId', 'claimId']),
      claims: table('claims', ['id', 'tenantId', 'userId']),
      consents: table('claim_document_ai_extraction_consents', []),
      requestEvidence: table('claim_information_request_evidence', [
        'requestId',
        'documentId',
        'tenantId',
        'claimId',
      ]),
      requests: table('claim_information_requests', ['id', 'claimId', 'tenantId', 'status']),
    },
    withTenantContext: vi.fn(),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  auditLog: hoisted.tables.auditLog,
  claimDocumentAiExtractionConsents: hoisted.tables.consents,
  claimDocuments: hoisted.tables.claimDocuments,
  claimInformationRequestEvidence: hoisted.tables.requestEvidence,
  claimInformationRequests: hoisted.tables.requests,
  claims: hoisted.tables.claims,
  // Exposed only so the tests prove metadata writes never use the ambient global client.
  db: { transaction: hoisted.globalTransaction },
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  withTenantContext: hoisted.withTenantContext,
}));

import {
  ClaimDocumentActorRoleError,
  InformationRequestUploadConflictError,
  persistClaimDocumentMetadata,
} from './claim-document-write';

type PersistParams = Parameters<typeof persistClaimDocumentMetadata>[0];

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';
const STORAGE_PATH = 'pii/tenants/tenant-1/claims/claim-1/doc-1.pdf';
const CONSENT = {
  granted: true,
  locale: 'en',
  privacyVersion: 'privacy-2026-05',
  sourceSurface: 'member_claim_evidence_upload',
};
const MEMBER_WITH_CONSENT = { actorRole: 'member', aiExtractionConsent: CONSENT } as const;
const DOCUMENT_VALUES = {
  id: 'doc-1',
  tenantId: 'tenant-1',
  claimId: 'claim-1',
  name: 'evidence.pdf',
  filePath: STORAGE_PATH,
  fileType: 'application/pdf',
  fileSize: 1024,
  bucket: 'claim-evidence',
  category: 'evidence',
  uploadedBy: 'member-1',
};

function params(overrides: Partial<PersistParams> = {}): PersistParams {
  return {
    category: 'evidence',
    claimId: 'claim-1',
    fileId: 'doc-1',
    fileSize: 1024,
    logPrefix: '[test]',
    mimeType: 'application/pdf',
    originalName: 'evidence.pdf',
    resolvedBucket: 'claim-evidence',
    storagePath: STORAGE_PATH,
    tenantId: 'tenant-1',
    userId: 'member-1',
    ...overrides,
  };
}

function createTx(staged: StagedWrite[]) {
  const write = async (table: string, values: Record<string, unknown>) => {
    if (hoisted.failTable.value === table) {
      throw new Error('new row violates row-level security policy');
    }
    staged.push({ table, values });
  };
  return {
    select: vi.fn(() => {
      const rows = hoisted.selectRows.shift() ?? [];
      const chain: QueryChain = {
        for: async () => rows,
        from: () => chain,
        limit: async () => rows,
        where: () => chain,
      };
      return chain;
    }),
    insert: vi.fn((target: { tableName: string }) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            await write(target.tableName, values);
            return [{ id: values.id }];
          },
        }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          write(target.tableName, values).then(resolve, reject),
      }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.committed.length = 0;
  hoisted.contexts.length = 0;
  hoisted.failTable.value = null;
  hoisted.selectRows.length = 0;
  // Mirrors a real transaction: staged writes commit only when the callback resolves.
  hoisted.withTenantContext.mockImplementation(
    async (context: unknown, action: (tx: unknown) => Promise<unknown>) => {
      hoisted.contexts.push(context);
      const staged: StagedWrite[] = [];
      const result = await action(createTx(staged));
      hoisted.committed.push(...staged);
      return result;
    }
  );
});

describe('persistClaimDocumentMetadata ordinary tenant context', () => {
  it('writes member metadata on the member tenant transaction only', async () => {
    const created = await persistClaimDocumentMetadata(params({ actorRole: 'member' }));

    expect(created).toBe(true);
    expect(hoisted.contexts).toEqual([{ tenantId: 'tenant-1', role: 'member' }]);
    expect(hoisted.globalTransaction).not.toHaveBeenCalled();
    expect(hoisted.committed).toEqual([{ table: 'claim_documents', values: DOCUMENT_VALUES }]);
  });

  it('keeps the trusted admin role rather than attributing it to a member', async () => {
    const created = await persistClaimDocumentMetadata(
      params({ actorRole: 'admin', userId: 'admin-1' })
    );

    expect(created).toBe(true);
    expect(hoisted.contexts).toEqual([{ tenantId: 'tenant-1', role: 'admin' }]);
    expect(hoisted.committed).toEqual([
      { table: 'claim_documents', values: { ...DOCUMENT_VALUES, uploadedBy: 'admin-1' } },
    ]);
  });

  it('commits the opted-in consent row atomically with the document', async () => {
    await persistClaimDocumentMetadata(params(MEMBER_WITH_CONSENT));

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.committed.map(write => write.table)).toEqual([
      'claim_documents',
      'claim_document_ai_extraction_consents',
    ]);
    expect(hoisted.committed[1]?.values).toEqual(
      expect.objectContaining({
        actorId: 'member-1',
        claimId: 'claim-1',
        documentId: 'doc-1',
        privacyVersion: 'privacy-2026-05',
        status: 'accepted',
        subjectId: 'member-1',
        tenantId: 'tenant-1',
      })
    );
  });

  it.each(['claim_documents', 'claim_document_ai_extraction_consents'])(
    'rolls back every write when the %s insert is rejected',
    async failingTable => {
      hoisted.failTable.value = failingTable;

      await expect(persistClaimDocumentMetadata(params(MEMBER_WITH_CONSENT))).rejects.toThrow(
        'row-level security'
      );
      expect(hoisted.committed).toEqual([]);
      expect(hoisted.globalTransaction).not.toHaveBeenCalled();
    }
  );

  it('fails closed before any transaction without a trusted ordinary role', async () => {
    await expect(persistClaimDocumentMetadata(params())).rejects.toBeInstanceOf(
      ClaimDocumentActorRoleError
    );
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.globalTransaction).not.toHaveBeenCalled();
  });
});

describe('persistClaimDocumentMetadata request-linked path', () => {
  const linked = { informationRequestId: REQUEST_ID };

  it('keeps the member context, ownership locks, evidence link, and audit row', async () => {
    hoisted.selectRows.push([{ userId: 'member-1' }], [{ id: REQUEST_ID }]);

    const created = await persistClaimDocumentMetadata(params(linked));

    expect(created).toBe(true);
    expect(hoisted.contexts).toEqual([{ tenantId: 'tenant-1', role: 'member' }]);
    expect(hoisted.committed.map(write => write.table)).toEqual([
      'claim_documents',
      'claim_information_request_evidence',
      'audit_log',
    ]);
    expect(hoisted.committed[1]?.values).toEqual({
      tenantId: 'tenant-1',
      claimId: 'claim-1',
      requestId: REQUEST_ID,
      documentId: 'doc-1',
      submittedByMemberId: 'member-1',
    });
    expect(hoisted.committed[2]?.values).toEqual(
      expect.objectContaining({
        action: 'claim_information_request.evidence_submitted',
        actorId: 'member-1',
        actorRole: 'member',
        entityId: REQUEST_ID,
        metadata: { documentId: 'doc-1' },
      })
    );
  });

  it.each([
    {
      label: 'another owner',
      claimRows: [{ userId: 'member-2' }],
      requestRows: [{ id: REQUEST_ID }],
    },
    {
      label: 'a closed or missing request',
      claimRows: [{ userId: 'member-1' }],
      requestRows: [],
    },
  ])('rejects $label without partial writes', async ({ claimRows, requestRows }) => {
    hoisted.selectRows.push(claimRows, requestRows);

    await expect(
      persistClaimDocumentMetadata(params({ ...linked, actorRole: 'member' }))
    ).rejects.toBeInstanceOf(InformationRequestUploadConflictError);
    expect(hoisted.committed).toEqual([]);
  });

  it('refuses a non-member role for member-only request evidence', async () => {
    await expect(
      persistClaimDocumentMetadata(params({ ...linked, actorRole: 'staff' }))
    ).rejects.toBeInstanceOf(ClaimDocumentActorRoleError);
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });
});
