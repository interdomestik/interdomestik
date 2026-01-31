// Thin wrapper to keep import path stable while implementation lives in `./audit.core`.
import { logAuditEvent as logCore, type AuditEvent } from './audit.core';

export type { AuditEvent };

/**
 * Best-effort audit logging.
 * Catches and specifically ignores MISSING_TENANT errors to prevent crashing
 * critical paths (webhooks/background jobs) where context might be thin.
 */
export const logAuditEvent = async (event: AuditEvent): Promise<void> => {
  try {
    await logCore(event);
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
