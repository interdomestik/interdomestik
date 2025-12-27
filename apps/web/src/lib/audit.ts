// Thin wrapper to keep import path stable while implementation lives in `./audit.core`.
import { logAuditEvent } from './audit.core';
export type { AuditEvent } from './audit.core';
export { logAuditEvent };
