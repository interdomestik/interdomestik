import { db, withTenantContext } from '@interdomestik/database';
// Thin wrapper to keep import path stable while implementation lives in `./audit.core`.
import { logAuditEvent as logCore, type AuditEvent } from './audit.core';

export type { AuditEvent };

/**
 * Best-effort audit logging.
 * Catches and specifically ignores MISSING_TENANT errors to prevent crashing
 * critical paths (webhooks/background jobs) where context might be thin.
 */
export const logAuditEvent = async (
  event: AuditEvent,
  database: Pick<typeof db, 'insert'> = db
): Promise<void> => {
  try {
    await logCore(event, database);
  } catch (error: unknown) {
    // If tenant is missing, just warn and swallow. Do not crash the caller.
    const err = error as { message?: string; code?: string };
    if (err?.message?.includes('tenant') || err?.code === 'MISSING_TENANT') {
      console.warn('[Audit] Skipped log due to missing tenant context:', event.action);
      return;
    }
    // For other errors, log but swallow
    console.error('[Audit] Failed to log event:', error);
  }
};

export async function logTenantAuditEvent(event: AuditEvent): Promise<void> {
  if (!event.tenantId) return logAuditEvent(event);
  try {
    await withTenantContext({ tenantId: event.tenantId }, tx => logAuditEvent(event, tx));
  } catch (error) {
    console.error('[Audit] Failed to log tenant event:', error);
  }
}
