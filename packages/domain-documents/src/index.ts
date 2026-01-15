/**
 * Domain Documents - M3.1
 *
 * Public API for document management.
 */

// Storage utilities
export {
  buildStoragePath,
  buildStorageUrl,
  extractTenantFromPath,
  getDocumentBucket,
  validateTenantOwnership,
  type StorageAuditContext,
  type StorageOperation,
} from './storage';

// Upload operations
export {
  getDocumentsForEntity,
  recordUpload,
  softDeleteDocument,
  type UploadParams,
  type UploadResult,
} from './upload';

// Audit utilities
export { captureAudit, logAuditEvent, type AuditEventParams, type AuditEventType } from './audit';
