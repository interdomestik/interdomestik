/**
 * Document Storage Abstraction - M3.1
 *
 * Tenant-partitioned storage paths for document isolation.
 * All storage paths MUST include tenantId for security.
 */

type StoragePathParams = {
  tenantId: string;
  entityType: string;
  entityId: string;
  fileName: string;
};

/**
 * Build a tenant-isolated storage path for a document.
 * Format: {tenantId}/{entityType}/{entityId}/{timestamp}_{filename}
 *
 * @example
 * buildStoragePath({ tenantId: 'tenant_ks', entityType: 'claim', entityId: 'claim123', fileName: 'invoice.pdf' })
 * // => 'tenant_ks/claim/claim123/1705186800000_invoice.pdf'
 */
export function buildStoragePath(
  params: StoragePathParams,
  { preserveLegacyKey = false }: { preserveLegacyKey?: boolean } = {}
): string {
  return formatStoragePath(params, Date.now(), preserveLegacyKey);
}

export function assertAllocatedStoragePath(storagePath: string, params: StoragePathParams): void {
  const fileSegment = storagePath.slice(storagePath.lastIndexOf('/') + 1);
  const [timestampPart] = fileSegment.split('_', 1);
  const timestamp = Number(timestampPart);
  if (!Number.isSafeInteger(timestamp) || storagePath !== formatStoragePath(params, timestamp)) {
    throw new Error('The storage path must match the allocated canonical upload key.');
  }
}

function formatStoragePath(
  params: StoragePathParams,
  timestamp: number,
  preserveLegacyKey = false
): string {
  const { tenantId, entityType, entityId, fileName } = params;

  for (const component of [tenantId, entityType, entityId]) {
    if (
      !component ||
      /[^A-Za-z0-9._-]/.test(component) ||
      component === '.' ||
      component.includes('..')
    ) {
      throw new Error('Document storage identifiers must each be a canonical path component.');
    }
  }

  const legacyFileName = fileName.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
  const sanitizedFileName = legacyFileName.replace(/[^A-Za-z0-9._-]/g, '_');
  if (preserveLegacyKey && sanitizedFileName !== legacyFileName) {
    throw new Error('The existing upload key contains noncanonical characters.');
  }

  // Path MUST include tenantId for isolation
  return `${tenantId}/${entityType}/${entityId}/${timestamp}_${sanitizedFileName}`;
}

/**
 * Validate that a storage path belongs to the expected tenant.
 * Used for defense-in-depth verification before any storage operations.
 */
export function validateTenantOwnership(storagePath: string, expectedTenantId: string): boolean {
  // Path format: {tenantId}/{entityType}/{entityId}/{filename}
  const tenantIdFromPath = storagePath.split('/')[0];
  return tenantIdFromPath === expectedTenantId;
}

/**
 * Extract tenant ID from a storage path.
 * Returns null if path format is invalid.
 */
export function extractTenantFromPath(storagePath: string): string | null {
  const parts = storagePath.split('/');
  if (parts.length < 4) return null;
  return parts[0];
}

/**
 * Get the storage bucket name for documents.
 * Configured via environment variable.
 */
export function getDocumentBucket(): string {
  return process.env.DOCUMENT_STORAGE_BUCKET ?? 'documents';
}

/**
 * Build a full storage URL for a document.
 * This is the URL used to access the document via Supabase Storage.
 */
export function buildStorageUrl(storagePath: string): string {
  const bucket = getDocumentBucket();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${baseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
}

/**
 * Storage operation types for audit logging.
 */
export type StorageOperation = 'upload' | 'download' | 'delete' | 'share';

/**
 * Storage operation context for audit trail.
 */
export interface StorageAuditContext {
  tenantId: string;
  operation: StorageOperation;
  storagePath: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}
