import * as schema from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { captureAudit, logAuditEvent } from './audit';
import { buildStoragePath, validateTenantOwnership } from './storage';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export { softDeleteDocument } from './document-lifecycle';

export interface UploadParams {
  authority: TenantAuthority;
  entityType: 'claim' | 'member' | 'policy' | 'thread' | 'share_pack';
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
    authority,
    entityType,
    entityId,
    fileName,
    mimeType,
    fileSize,
    category = 'other',
    description,
    uploadedBy,
  } = params;
  const { tenantId } = readTenantAuthority(authority);

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
  // db-access-guard: tenant-scoped -- reason: tenantId validated before storage path and document insert
  await withTenantAuthority(authority, tx =>
    tx.insert(schema.documents).values({
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
    })
  );

  // Log audit event for the upload
  await logAuditEvent({
    authority,
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
  authority: TenantAuthority;
  entityType: string;
  entityId: string;
}): Promise<schema.Document[]> {
  const { authority, entityType, entityId } = params;
  const { tenantId } = readTenantAuthority(authority);

  // Query MUST include tenantId in WHERE clause
  const docs = await withTenantAuthority(authority, tx =>
    tx
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.tenantId, tenantId),
          eq(
            schema.documents.entityType,
            entityType as 'claim' | 'member' | 'policy' | 'thread' | 'share_pack'
          ),
          eq(schema.documents.entityId, entityId),
          isNull(schema.documents.deletedAt)
        )
      )
  );

  return docs;
}
