import { beforeEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const and = vi.fn((...args: unknown[]) => ({ op: 'and', args }));
  const eq = vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right }));

  return {
    authGetSession: vi.fn(),
    headers: vi.fn(),
    ensureTenantId: vi.fn(),
    resolveEvidenceBucketName: vi.fn(),
    findOwnedMemberUploadClaim: vi.fn(),
    findOwnedMemberInformationRequest: vi.fn(),
    createSignedUploadUrl: vi.fn(),
    listStorageObjects: vi.fn(),
    storageFrom: vi.fn(),
    insertValues: vi.fn(),
    metadataClaimRows: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
    withTenantContext: vi.fn(),
    revalidatePath: vi.fn(),
    queueClaimDocumentAiWorkflows: vi.fn(),
    emitClaimAiRunRequestedService: vi.fn(),
    markClaimAiRunDispatchFailedService: vi.fn(),
    and,
    eq,
  };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.authGetSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headers,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('@/lib/storage/evidence-bucket', () => ({
  DEFAULT_EVIDENCE_BUCKET: 'claim-evidence',
  resolveEvidenceBucketName: hoisted.resolveEvidenceBucketName,
}));

vi.mock('@/features/claims/upload/server/access', () => ({
  findOwnedMemberInformationRequest: hoisted.findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim: hoisted.findOwnedMemberUploadClaim,
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
  createAdminClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
  db: {
    insert: hoisted.insert,
    transaction: hoisted.transaction,
  },
  and: hoisted.and,
  eq: hoisted.eq,
  claims: { id: 'claim.id', tenantId: 'claim.tenant_id', userId: 'claim.userId' },
  claimDocuments: 'claim_documents',
  claimDocumentAiExtractionConsents: 'claim_document_ai_extraction_consents',
}));

vi.mock('@interdomestik/domain-claims/claims/ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: hoisted.queueClaimDocumentAiWorkflows,
}));

vi.mock('@/lib/ai/claim-workflows', () => ({
  emitClaimAiRunRequestedService: hoisted.emitClaimAiRunRequestedService,
  markClaimAiRunDispatchFailedService: hoisted.markClaimAiRunDispatchFailedService,
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

beforeEach(() => {
  vi.clearAllMocks();

  hoisted.headers.mockResolvedValue(new Headers());
  hoisted.authGetSession.mockResolvedValue({
    user: { id: 'member-1', tenantId: 'tenant-1', role: 'member' },
  });
  hoisted.ensureTenantId.mockReturnValue('tenant-1');
  hoisted.resolveEvidenceBucketName.mockReturnValue('claim-evidence');
  hoisted.findOwnedMemberUploadClaim.mockResolvedValue({ id: 'claim-1' });
  hoisted.findOwnedMemberInformationRequest.mockResolvedValue({ id: 'request-1' });
  hoisted.storageFrom.mockReturnValue({
    createSignedUploadUrl: hoisted.createSignedUploadUrl,
    list: hoisted.listStorageObjects,
  });
  hoisted.createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example.com/upload', token: 'upload-token-1' },
    error: null,
  });
  hoisted.listStorageObjects.mockResolvedValue({
    data: [
      {
        name: 'uuid-1.pdf',
        metadata: { size: 1024, mimetype: 'application/pdf' },
      },
    ],
    error: null,
  });
  hoisted.insert.mockReturnValue({
    values: hoisted.insertValues,
  });
  hoisted.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      insert: hoisted.insert,
    })
  );
  hoisted.withTenantContext.mockImplementation(async (_context, callback) =>
    callback({
      insert: hoisted.insert,
      select: () => ({ from: () => ({ where: () => ({ for: hoisted.metadataClaimRows }) }) }),
    })
  );
  hoisted.metadataClaimRows.mockResolvedValue([{ userId: 'member-1' }]);
  hoisted.insertValues.mockImplementation(() => ({
    onConflictDoNothing: () => ({ returning: async () => [{ id: 'uuid-1' }] }),
    then: (resolve: (value: unknown) => unknown) => resolve(undefined),
  }));
  hoisted.queueClaimDocumentAiWorkflows.mockResolvedValue([]);

  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.com');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('BETTER_AUTH_SECRET', 'upload-intent-test-secret-32-chars-minimum');
});

export function getUploadActionMocks() {
  return hoisted;
}
