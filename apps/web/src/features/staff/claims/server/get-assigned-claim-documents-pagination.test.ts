import { authority, hoisted, staff } from './get-assigned-claim-documents.test-support';
import { describe, expect, it } from 'vitest';
import {
  getAssignedStaffClaimDocuments,
  getRegisterPickerDocuments,
} from './get-assigned-claim-documents';

describe('evidence pagination and register picker', () => {
  it('pages through ordinary evidence past row 100 and clamps the requested size', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `doc-${101 + index}`,
      name: 'Evidence',
      fileType: 'application/pdf',
      fileSize: 1,
    }));
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]).mockResolvedValueOnce(rows);
    const result = await getAssignedStaffClaimDocuments({
      claimId: 'claim-1',
      session: staff(),
      authority,
      page: 3,
      perPage: 1000,
    });
    expect(hoisted.offset).toHaveBeenCalledExactlyOnceWith(100);
    expect(hoisted.limit).toHaveBeenLastCalledWith(51);
    expect(result.documents).toHaveLength(50);
    expect(result.documents[0]?.url).toBe('/api/documents/doc-101/download');
    expect(result.hasNextPage).toBe(true);
  });

  it('filters the 100-row picker by citation provenance without joining request evidence', async () => {
    const document = {
      id: 'doc-linked',
      name: 'Request evidence.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
    };
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]).mockResolvedValueOnce([document]);

    await expect(
      getRegisterPickerDocuments({ claimId: 'claim-1', session: staff(), authority })
    ).resolves.toEqual([{ ...document, url: '/api/documents/doc-linked/download' }]);

    expect(hoisted.wheres[1]).toEqual({
      op: 'and',
      args: [
        { op: 'eq', left: 'claim_documents.claim_id', right: 'claim-1' },
        { op: 'eq', left: 'claim_documents.tenant_id', right: 'tenant-a' },
        'public.claim_document_provenance_ok(claim_documents.tenant_id, claim_documents.claim_id, claim_documents.id)',
      ],
    });
    expect(hoisted.joins).toEqual([
      { table: expect.objectContaining({ id: 'claims.id' }), predicate: expect.anything() },
    ]);
    expect(hoisted.orderBy).toHaveBeenCalledExactlyOnceWith(
      'claim_documents.created_at desc nulls last',
      'claim_documents.id'
    );
    expect(hoisted.limit).toHaveBeenLastCalledWith(100);
    expect(hoisted.offset).not.toHaveBeenCalled();
  });
});
