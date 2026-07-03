import { ExtractionPipelineError } from '@/lib/ai/extraction-pipeline';
import { sql, type TenantTransaction } from '@interdomestik/database';

export const DELETED_DOCUMENT_ERROR_CODE = 'document_ai_document_deleted';
export const DELETED_DOCUMENT_ERROR_MESSAGE =
  'AI run skipped because the source document was deleted.';

export async function lockActiveDocument(
  tx: TenantTransaction,
  args: { documentId: string; tenantId: string }
) {
  // db-access-guard: tenant-scoped -- reason: row lock is constrained by exact tenantId and documentId before policy AI extraction persistence
  return tx.execute<{ id: string }>(sql`
    select "id"
    from "documents"
    where "id" = ${args.documentId}
      and "tenant_id" = ${args.tenantId}
      and "deleted_at" is null
    for update
  `);
}

export function throwDeletedDocumentError(): never {
  throw new ExtractionPipelineError(DELETED_DOCUMENT_ERROR_CODE, DELETED_DOCUMENT_ERROR_MESSAGE);
}
