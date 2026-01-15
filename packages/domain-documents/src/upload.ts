/**
 * Document Upload - M3.1
 *
 * Upload handler that stores documents with tenant isolation
 * and emits audit events for all uploads.
 */
import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { captureAudit, logAuditEvent } from './audit';
import { buildStoragePath, validateTenantOwnership } from './storage';

export interface UploadParams {
  tenantId: string;
  entityType: 'claim' | 'member' | 'thread' | 'share_pack';
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category?:
    | 'evidence'
    | 'correspondence'
    | 'contract'
    | 'receipt'
    | 'identity'
    | 'medical'
    | 'legal'
    | 'export'
    | 'other';
  description?: string;
  uploadedBy: string;
  // The actual file bytes are handled by Supabase Storage
  // This function records metadata after successful storage upload
}

export interface UploadResult {
  documentId: string;
  storagePath: string;
}

/**
 * Record a document upload in the database.
 *
 * MUST be called AFTER the file is successfully uploaded to storage.
 * This ensures we don't have orphaned database records.
 *
 * @throws Error if tenant validation fails
 */
export async function recordUpload(params: UploadParams): Promise<UploadResult> {
  const {
    tenantId,
    entityType,
    entityId,
    fileName,
    mimeType,
    fileSize,
    category = 'other',
    description,
    uploadedBy,
  } = params;

  // Build tenant-isolated storage path
  const storagePath = buildStoragePath({
    tenantId,
    entityType,
    entityId,
    fileName,
  });

  // Defense-in-depth: verify path includes correct tenant
  if (!validateTenantOwnership(storagePath, tenantId)) {
    throw new Error(`Tenant mismatch in storage path: expected ${tenantId}`);
  }

  const documentId = nanoid();

  // Insert document record
  await db.insert(schema.documents).values({
    id: documentId,
    tenantId,
    entityType,
    entityId,
    fileName,
    mimeType,
    fileSize,
    storagePath,
    category,
    description: description ?? null,
    uploadedBy,
    uploadedAt: new Date(),
  });

  // Log audit event for the upload
  await logAuditEvent({
    tenantId,
    documentId,
    accessType: 'upload',
    accessedBy: uploadedBy,
  });

  // Also capture to Sentry for observability
  captureAudit('upload', {
    tenantId,
    documentId,
    entityType,
    entityId,
    fileName,
    fileSize,
    uploadedBy,
  });

  return {
    documentId,
    storagePath,
  };
}

/**
 * Get documents for an entity, scoped by tenant.
 *
 * All queries MUST include tenantId for isolation.
 */
export async function getDocumentsForEntity(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
}): Promise<schema.Document[]> {
  const { tenantId, entityType, entityId } = params;

  // Query MUST include tenantId in WHERE clause
  const docs = await db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.tenantId, tenantId),
        eq(schema.documents.entityType, entityType as 'claim' | 'member' | 'thread' | 'share_pack'),
        eq(schema.documents.entityId, entityId),
        isNull(schema.documents.deletedAt)
      )
    );

  return docs;
}

/**
 * Soft delete a document.
 * The file remains in storage but is marked as deleted.
 */
export async function softDeleteDocument(params: {
  tenantId: string;
  documentId: string;
  deletedBy: string;
}): Promise<void> {
  const { tenantId, documentId, deletedBy } = params;

  // Update MUST include tenantId for isolation
  await db
    .update(schema.documents)
    .set({
      deletedAt: new Date(),
      deletedBy,
    })
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, tenantId)));

  // Log deletion
  await logAuditEvent({
    tenantId,
    documentId,
    accessType: 'delete',
    accessedBy: deletedBy,
  });
}
