import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    addBreadcrumb: vi.fn(),
    db: { insert },
    insert,
    insertValues,
    nanoid: vi.fn(() => 'audit-1'),
  };
});

vi.mock('@interdomestik/database/db', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database/schema', () => ({
  documentAccessLog: 'documentAccessLog',
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: mocks.addBreadcrumb,
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

import { captureAudit, logAuditEvent } from './audit';

describe('document audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records audit events with nullable metadata normalized', async () => {
    await logAuditEvent({
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      accessType: 'upload',
    });

    expect(mocks.insert).toHaveBeenCalledWith('documentAccessLog');
    expect(mocks.insertValues).toHaveBeenCalledWith({
      id: 'audit-1',
      tenantId: 'tenant-1',
      documentId: 'doc-1',
      accessType: 'upload',
      accessedBy: null,
      accessedAt: expect.any(Date),
      ipAddress: null,
      userAgent: null,
      shareToken: null,
    });
  });

  it('degrades safely when Sentry is unavailable at runtime', () => {
    expect(() =>
      captureAudit('download', { documentId: 'doc-1', tenantId: 'tenant-1' })
    ).not.toThrow();
  });
});
