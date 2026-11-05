import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findActorCrossGrantContexts: vi.fn(),
  hasDurableCaseScopedDocumentGrant: vi.fn(),
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

function transactionalDbWith(polyRows: unknown[], legacyRows: unknown[] = []) {
  const tx = dbWith(polyRows, legacyRows);
  const execute = vi.fn().mockResolvedValue(undefined);
  return {
    execute,
    tx,
    db: {
      transaction: vi.fn(
        async (action: (innerTx: typeof tx & { execute: typeof vi.fn }) => unknown) =>
          action({ ...tx, execute })
      ),
    },
  };
}

const request = {
  accessTenantId: 'tenant_mk',
  actorId: 'local-legal-1',
  documentId: 'doc-1',
};

describe('lookupCrossGrantDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findActorCrossGrantContexts.mockResolvedValue([
      { caseId: 'claim-1', documentClasses: ['legal'], homeTenantId: 'tenant_home' },
    ]);
    mocks.hasDurableCaseScopedDocumentGrant.mockResolvedValue(false);
  });

  it('returns authorized home-tenant claim documents for durable grants only', async () => {
    const doc = {
      category: 'legal',
      entityId: 'claim-1',
      entityType: 'claim',
      id: 'doc-1',
      tenantId: 'tenant_home',
    };
    mocks.hasDurableCaseScopedDocumentGrant.mockResolvedValueOnce(true);

    await expect(lookupCrossGrantDoc({ ...request, db: dbWith([doc]) as never })).resolves.toEqual({
      doc,
      homeTenantId: 'tenant_home',
      kind: 'poly',
    });
    expect(mocks.findActorCrossGrantContexts).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTenantId: 'tenant_mk',
        actorId: 'local-legal-1',
      })
    );
  });

  it('returns not found for existing cross-tenant claim documents without a matching grant', async () => {
    const doc = {
      category: 'identity',
      entityId: 'claim-1',
      entityType: 'claim',
      id: 'doc-1',
      tenantId: 'tenant_home',
    };

    await expect(
      lookupCrossGrantDoc({ ...request, db: dbWith([doc]) as never })
    ).resolves.toBeNull();
  });

  it('returns not found for non-claim cross-tenant documents', async () => {
    await expect(
      lookupCrossGrantDoc({
        ...request,
        db: dbWith([{ entityId: 'member-1', entityType: 'member', id: 'doc-1' }]) as never,
      })
    ).resolves.toBeNull();
    expect(mocks.hasDurableCaseScopedDocumentGrant).not.toHaveBeenCalled();
  });

  it('does not read document tables when no cross-tenant grant context exists', async () => {
    const db = dbWith([{ id: 'doc-1' }]);
    mocks.findActorCrossGrantContexts.mockResolvedValueOnce([]);

    await expect(lookupCrossGrantDoc({ ...request, db: db as never })).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.hasDurableCaseScopedDocumentGrant).not.toHaveBeenCalled();
  });

  it('sets home tenant context on the supplied db before reading granted documents', async () => {
    const doc = {
      category: 'legal',
      entityId: 'claim-1',
      entityType: 'claim',
      id: 'doc-1',
      tenantId: 'tenant_home',
    };
    const { db, execute } = transactionalDbWith([doc]);
    mocks.hasDurableCaseScopedDocumentGrant.mockResolvedValueOnce(true);

    await expect(lookupCrossGrantDoc({ ...request, db: db as never })).resolves.toEqual(
      expect.objectContaining({ kind: 'poly' })
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.map(([statement]) => sqlParam(statement))).toEqual([
      undefined,
      'tenant_home',
      'tenant_home',
    ]);
    expect(mocks.hasDurableCaseScopedDocumentGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTenantId: 'tenant_mk',
        caseId: 'claim-1',
        homeTenantId: 'tenant_home',
      })
    );
  });
});

function sqlParam(statement: unknown) {
  return (statement as { queryChunks?: unknown[] }).queryChunks?.[1];
}
