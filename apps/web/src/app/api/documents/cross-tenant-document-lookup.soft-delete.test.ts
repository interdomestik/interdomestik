import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findActorCrossGrantContexts: vi.fn(),
  hasDurableCaseScopedDocumentGrant: vi.fn(),
  isNull: vi.fn((field: unknown) => ({ op: 'isNull', field })),
  sql: vi.fn(() => undefined),
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
  isNull: mocks.isNull,
  sql: mocks.sql,
}));

vi.mock('@interdomestik/database/schema', () => ({
  claimDocuments: {
    claimId: 'claim_documents.claim_id',
    id: 'claim_documents.id',
    tenantId: 'claim_documents.tenant_id',
  },
  claims: { id: 'claims.id' },
  documents: {
    deletedAt: 'documents.deleted_at',
    entityId: 'documents.entity_id',
    entityType: 'documents.entity_type',
    id: 'documents.id',
    tenantId: 'documents.tenant_id',
  },
}));

vi.mock('./durable-case-grants', () => ({
  findActorCrossGrantContexts: mocks.findActorCrossGrantContexts,
  hasDurableCaseScopedDocumentGrant: mocks.hasDurableCaseScopedDocumentGrant,
}));

import { lookupCrossGrantDoc } from './cross-tenant-document-lookup';

function selectResult(rows: unknown[], legacy = false) {
  const chain = { where: vi.fn().mockResolvedValue(rows) };
  return {
    from: vi.fn().mockReturnValue(legacy ? { leftJoin: vi.fn().mockReturnValue(chain) } : chain),
  };
}

function dbWith(polyRows: unknown[], legacyRows: unknown[] = []) {
  const db = { select: vi.fn() };
  db.select.mockReturnValueOnce(selectResult(polyRows));
  db.select.mockReturnValueOnce(selectResult(legacyRows, true));
  return db;
}

describe('lookupCrossGrantDoc soft-delete filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findActorCrossGrantContexts.mockResolvedValue([
      { caseId: 'claim-1', documentClasses: ['legal'], homeTenantId: 'tenant_home' },
    ]);
  });

  it('requires active polymorphic documents before durable grant authorization', async () => {
    await lookupCrossGrantDoc({
      accessTenantId: 'tenant_mk',
      actorId: 'legal-1',
      db: dbWith([]) as never,
      documentId: 'doc-1',
    });

    expect(mocks.isNull).toHaveBeenCalledWith('documents.deleted_at');
    expect(mocks.and).toHaveBeenCalledWith(
      expect.objectContaining({ left: 'documents.id', right: 'doc-1' }),
      expect.objectContaining({ left: 'documents.tenant_id', right: 'tenant_home' }),
      expect.objectContaining({ left: 'documents.entity_type', right: 'claim' }),
      expect.objectContaining({ left: 'documents.entity_id', right: 'claim-1' }),
      expect.objectContaining({ field: 'documents.deleted_at', op: 'isNull' })
    );
  });
});
