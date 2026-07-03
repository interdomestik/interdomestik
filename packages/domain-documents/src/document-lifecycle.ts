import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { and, eq, inArray } from 'drizzle-orm';

import { logAuditEvent } from './audit';

const DELETED_DOCUMENT_RUN_STATUSES = ['queued', 'processing', 'in_progress'];
const DOCUMENT_AI_DELETED_CODE = 'document_ai_document_deleted';
const DOCUMENT_AI_DELETED_MESSAGE = 'AI run skipped because the source document was deleted.';

/**
 * Soft delete a document and purge AI-derived document payloads.
 * The source file remains in storage but database reads must no longer expose it.
 */
export async function softDeleteDocument(params: {
  tenantId: string;
  documentId: string;
  deletedBy: string;
}): Promise<void> {
  const { tenantId, documentId, deletedBy } = params;
  const deletedAt = new Date();

  await db.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: document soft-delete is constrained by exact tenantId and documentId.
    const [deletedDocument] = await tx
      .update(schema.documents)
      .set({ deletedAt, deletedBy })
      .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, tenantId)))
      .returning({
        entityId: schema.documents.entityId,
        entityType: schema.documents.entityType,
      });

    // db-access-guard: tenant-scoped -- reason: non-terminal AI run failure is constrained by exact tenantId, documentId, and status.
    await tx
      .update(schema.aiRuns)
      .set({
        status: 'failed',
        completedAt: deletedAt,
        errorCode: DOCUMENT_AI_DELETED_CODE,
        errorMessage: DOCUMENT_AI_DELETED_MESSAGE,
        requestJson: {},
        outputJson: null,
        responseJson: null,
      })
      .where(
        and(
          eq(schema.aiRuns.documentId, documentId),
          eq(schema.aiRuns.tenantId, tenantId),
          inArray(schema.aiRuns.status, DELETED_DOCUMENT_RUN_STATUSES)
        )
      );

    // db-access-guard: tenant-scoped -- reason: claim run error-code compatibility is constrained by exact tenantId, documentId, and entity type.
    await tx
      .update(schema.aiRuns)
      .set({
        errorCode: 'claim_ai_document_deleted',
        errorMessage: 'Claim AI run skipped because the source document was deleted.',
      })
      .where(
        and(
          eq(schema.aiRuns.documentId, documentId),
          eq(schema.aiRuns.tenantId, tenantId),
          eq(schema.aiRuns.entityType, 'claim')
        )
      );

    // db-access-guard: tenant-scoped -- reason: AI output redaction is constrained by exact tenantId and documentId.
    await tx
      .update(schema.aiRuns)
      .set({ requestJson: {}, outputJson: null, responseJson: null })
      .where(and(eq(schema.aiRuns.documentId, documentId), eq(schema.aiRuns.tenantId, tenantId)));

    // db-access-guard: tenant-scoped -- reason: derived extraction purge is constrained by exact tenantId and documentId after in-flight runs are failed.
    await tx
      .delete(schema.documentExtractions)
      .where(
        and(
          eq(schema.documentExtractions.documentId, documentId),
          eq(schema.documentExtractions.tenantId, tenantId)
        )
      );

    if (deletedDocument?.entityType === 'policy' && deletedDocument.entityId) {
      // db-access-guard: tenant-scoped -- reason: policy AI projection redaction is constrained by exact tenantId and policy id.
      await tx
        .update(schema.policies)
        .set({ analysisJson: {}, provider: null, policyNumber: null })
        .where(
          and(
            eq(schema.policies.id, deletedDocument.entityId),
            eq(schema.policies.tenantId, tenantId)
          )
        );
    }
  });

  await logAuditEvent({
    tenantId,
    documentId,
    accessType: 'delete',
    accessedBy: deletedBy,
  });
}
