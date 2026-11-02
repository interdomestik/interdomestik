import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendCaseGrantDocumentAudit: vi.fn(),
  authorizeSessionTenant: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  appendCaseGrantDocumentAudit: mocks.appendCaseGrantDocumentAudit,
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));

import { logAllowedDocumentAccess, logDeniedDocumentAccess } from './_core';

const headers = new Headers({ 'user-agent': 'test' });
const session = { user: { id: 'user-1', role: 'staff' } } as never;
const authority = mintTestTenantAuthority('tenant_access', { userId: 'user-1', role: 'staff' });

function allowed(tenantId: string, claimId: string | null = 'claim-1') {
  return {
    ok: true,
    tenantId,
    document: { id: 'doc-1', claimId },
    audit: {
      action: 'document.view',
      actorRole: 'staff',
      entityId: 'doc-1',
      entityType: 'claim_document',
      metadata: { disposition: 'inline' },
    },
  } as never;
}

describe('document access audit authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeSessionTenant.mockResolvedValue({ session, authority });
  });

  it('records a local read under the session authority without extra metadata', async () => {
    await logAllowedDocumentAccess({
      access: allowed('tenant_access'),
      headers,
      logAuditEvent: mocks.logAuditEvent,
      session,
    });

    expect(mocks.authorizeSessionTenant).toHaveBeenCalledWith(headers);
    const [event] = mocks.logAuditEvent.mock.calls[0];
    expect(event.authority).toBe(authority);
    expect(event.metadata).toEqual({ disposition: 'inline' });
  });

  it('records a cross-tenant grant read in the home tenant through the case-grant append', async () => {
    mocks.appendCaseGrantDocumentAudit.mockResolvedValue(true);

    await logAllowedDocumentAccess({
      access: allowed('tenant_home'),
      headers,
      logAuditEvent: mocks.logAuditEvent,
      session,
    });

    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    const [reader, event] = mocks.appendCaseGrantDocumentAudit.mock.calls[0];
    expect(reader).toBe(authority);
    expect(event).toEqual({
      homeTenantId: 'tenant_home',
      documentId: 'doc-1',
      source: 'claim_documents',
      action: 'document.view',
      entityType: 'claim_document',
      metadata: { disposition: 'inline' },
    });
  });

  it('names the documents table for a polymorphic grant read, which carries no claim', async () => {
    mocks.appendCaseGrantDocumentAudit.mockResolvedValue(true);

    await logAllowedDocumentAccess({
      access: allowed('tenant_home', null),
      headers,
      logAuditEvent: mocks.logAuditEvent,
      session,
    });

    expect(mocks.appendCaseGrantDocumentAudit.mock.calls[0][1].source).toBe('documents');
  });

  it.each([
    ['refused', async () => false],
    ['failing', async () => Promise.reject(new Error('db down'))],
  ])('a %s case-grant append never falls back to another tenant', async (_label, outcome) => {
    mocks.appendCaseGrantDocumentAudit.mockImplementation(outcome);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await logAllowedDocumentAccess({
      access: allowed('tenant_home'),
      headers,
      logAuditEvent: mocks.logAuditEvent,
      session,
    });

    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('records a forbidden read under the session authority', async () => {
    await logDeniedDocumentAccess({
      access: { ok: false, code: 'FORBIDDEN', message: 'Forbidden' } as never,
      documentId: 'doc-1',
      headers,
      logAuditEvent: mocks.logAuditEvent,
      session,
    });

    const [event] = mocks.logAuditEvent.mock.calls[0];
    expect(event).toMatchObject({ action: 'document.forbidden', entityId: 'doc-1' });
    expect(event.authority).toBe(authority);
  });

  it.each([
    ['no session', async () => null],
    ['another user', async () => ({ session: { user: { id: 'user-2' } }, authority })],
    [
      'a session without tenant',
      async () => {
        throw new Error('Missing tenant');
      },
    ],
  ])('writes no audit row under %s', async (_label, resolve) => {
    mocks.authorizeSessionTenant.mockImplementationOnce(resolve);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await logAllowedDocumentAccess({
      access: allowed('tenant_access'),
      headers,
      logAuditEvent: mocks.logAuditEvent,
      session,
    });

    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
