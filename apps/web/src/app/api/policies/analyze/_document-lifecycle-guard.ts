import {
  buildDeletedDocumentFailure,
  throwDeletedDocumentError as throwDeletedRunDocumentError,
  type DeletedDocumentFailure,
} from '@/lib/ai/document-run-lifecycle';
import { sql, type TenantTransaction } from '@interdomestik/database';

export const DELETED_DOCUMENT_ERROR_CODE = 'document_ai_document_deleted';
export const DELETED_DOCUMENT_ERROR_MESSAGE =
  'AI run skipped because the source document was deleted.';
export const POLICY_DELETED_DOCUMENT_FAILURE: DeletedDocumentFailure = {
  errorCode: DELETED_DOCUMENT_ERROR_CODE,
  errorMessage: DELETED_DOCUMENT_ERROR_MESSAGE,
};

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
  throwDeletedRunDocumentError(POLICY_DELETED_DOCUMENT_FAILURE);
}

export function buildDeletedPolicyRunFailure(completedAt: Date) {
  return buildDeletedDocumentFailure(completedAt, POLICY_DELETED_DOCUMENT_FAILURE);
}
