import { authority, hoisted, staff, tx } from './get-assigned-claim-documents.test-support';
import { describe, expect, it } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { getAssignedStaffClaimDocuments } from './get-assigned-claim-documents';

function read(session = staff(), sessionAuthority: typeof authority | null = authority) {
  return getAssignedStaffClaimDocuments({
    claimId: 'claim-1',
    session,
    authority: sessionAuthority,
  });
}
const emptyPage = { page: 1, documents: [], hasNextPage: false };

describe('getAssignedStaffClaimDocuments', () => {
  it('returns the minimal projection and canonical links to assigned staff', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.limit.mockResolvedValueOnce([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        filePath: 'pii/tenants/tenant-a/claims/claim-1/doc-1.pdf',
      },
    ]);

    const documents = await read();

    expect(documents.documents).toEqual([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        url: '/api/documents/doc-1/download',
      },
    ]);
    expect(JSON.stringify(documents)).not.toContain('pii/');
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]![0]).toBe(authority);
    expect(hoisted.froms).toEqual([
      expect.objectContaining({ id: 'claims.id' }),
      expect.objectContaining({ id: 'claim_documents.id' }),
    ]);
    expect(hoisted.selections).toEqual([
      { id: 'claims.id' },
      {
        id: 'claim_documents.id',
        name: 'claim_documents.name',
        fileType: 'claim_documents.file_type',
        fileSize: 'claim_documents.file_size',
      },
    ]);
    expect(hoisted.wheres).toEqual([
      {
        op: 'and',
        args: [
          { op: 'eq', left: 'claims.id', right: 'claim-1' },
          { op: 'eq', left: 'claims.tenant_id', right: 'tenant-a' },
          { op: 'eq', left: 'claims.staff_id', right: 'staff-1' },
          { op: 'ne', left: 'claims.case_lifecycle_state', right: 'draft' },
        ],
      },
      {
        op: 'and',
        args: [
          { op: 'eq', left: 'claim_documents.claim_id', right: 'claim-1' },
          { op: 'eq', left: 'claim_documents.tenant_id', right: 'tenant-a' },
          { op: 'isNull', column: 'link.document_id' },
        ],
      },
    ]);
    expect(hoisted.joins).toEqual([
      {
        table: expect.objectContaining({ id: 'claims.id' }),
        predicate: {
          op: 'and',
          args: [
            { op: 'eq', left: 'claims.id', right: 'claim_documents.claim_id' },
            { op: 'eq', left: 'claims.tenant_id', right: 'tenant-a' },
            { op: 'eq', left: 'claims.staff_id', right: 'staff-1' },
            { op: 'ne', left: 'claims.case_lifecycle_state', right: 'draft' },
          ],
        },
      },
      expect.objectContaining({
        predicate: {
          op: 'and',
          args: [
            { op: 'eq', left: 'link.tenant_id', right: 'tenant-a' },
            { op: 'eq', left: 'link.claim_id', right: 'claim-1' },
            { op: 'eq', left: 'link.document_id', right: 'claim_documents.id' },
          ],
        },
      }),
    ]);
    expect(hoisted.orderBy).toHaveBeenCalledWith(
      'claim_documents.created_at desc nulls last',
      'claim_documents.id'
    );
    expect(hoisted.limit).toHaveBeenLastCalledWith(21);
    expect(hoisted.offset).toHaveBeenCalledWith(0);
  });

  it('encodes document ids in the canonical authorized download route', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.limit.mockResolvedValueOnce([
      { id: 'doc/1?x', name: 'a.pdf', fileType: 'application/pdf', fileSize: 1 },
    ]);

    expect((await read()).documents).toEqual([
      expect.objectContaining({ url: '/api/documents/doc%2F1%3Fx/download' }),
    ]);
  });

  it('issues no document query for a wrong assignee, even in the same branch', async () => {
    hoisted.limit.mockResolvedValueOnce([]);

    await expect(read(staff({ id: 'staff-2' }))).resolves.toEqual(emptyPage);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(hoisted.wheres[0]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([{ op: 'eq', left: 'claims.staff_id', right: 'staff-2' }]),
      })
    );
    expect(hoisted.orderBy).not.toHaveBeenCalled();
  });

  it.each(['branch_manager', 'admin', 'agent', 'member', null])(
    'returns no documents and opens no context for role %s',
    async role => {
      await expect(read(staff({ role }))).resolves.toEqual(emptyPage);
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(tx.select).not.toHaveBeenCalled();
    }
  );

  it('returns no documents and opens no context without a session authority', async () => {
    await expect(read(staff(), null)).resolves.toEqual(emptyPage);
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('reads under the authority it is given, never a tenant carried by the session object', async () => {
    const other = mintTestTenantAuthority('tenant-b');
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.limit.mockResolvedValueOnce([
      { id: 'doc-b', name: 'access.pdf', fileType: 'application/pdf', fileSize: 2 },
    ]);
    expect((await read(staff(), other)).documents).toEqual([
      {
        id: 'doc-b',
        name: 'access.pdf',
        fileType: 'application/pdf',
        fileSize: 2,
        url: '/api/documents/doc-b/download',
      },
    ]);
    expect(hoisted.withTenantContext.mock.calls[0]![0]).toBe(other);
    expect(hoisted.wheres[0]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([{ op: 'eq', left: 'claims.tenant_id', right: 'tenant-b' }]),
      })
    );
    expect(hoisted.wheres[1]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'claim_documents.tenant_id', right: 'tenant-b' },
        ]),
      })
    );
  });

  it('propagates tenant transaction failures to the page caller', async () => {
    hoisted.withTenantContext.mockRejectedValueOnce(new Error('tenant context unavailable'));

    await expect(read()).rejects.toThrow('tenant context unavailable');
    expect(tx.select).not.toHaveBeenCalled();
  });
});
