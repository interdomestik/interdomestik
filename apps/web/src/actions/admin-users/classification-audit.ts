import { auditLog, db, withTenantContext } from '@interdomestik/database';
import { nanoid } from 'nanoid';

type AuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
  action: 'user.tenant_reassigned' | 'user.tenant_classification_confirmed';
  entityType: 'user';
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

function extractRequestMetadata(requestHeaders?: Headers) {
  if (!requestHeaders) return {};

  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || undefined;
  const userAgent = requestHeaders.get('user-agent') || undefined;

  return {
    ip,
    userAgent,
  };
}

async function logCore(
  { actorId, actorRole, tenantId, action, entityType, entityId, metadata, headers }: AuditEvent,
  database: Pick<typeof db, 'insert'> = db
) {
  try {
    const requestMetadata = extractRequestMetadata(headers);
    const combinedMetadata: Record<string, unknown> = {
      ...metadata,
      ...requestMetadata,
    };

    const resolvedTenantId = tenantId || (combinedMetadata.tenantId as string | undefined) || null;

    if (!resolvedTenantId) {
      const errorMsg = `Audit log failed: Missing tenantId for action: ${action}`;
      console.error(errorMsg, { action, entityType, entityId });

      if (process.env.INTERDOMESTIK_AUTOMATED === '1') {
        throw new Error(errorMsg);
      }
      return;
    }

    // db-access-guard: tenant-scoped -- reason: tenantId from validated session or authScope in current call path
    await database.insert(auditLog).values({
      id: nanoid(),
      tenantId: resolvedTenantId,
      actorId: actorId || null,
      actorRole: actorRole || null,
      action,
      entityType,
      entityId: entityId || null,
      metadata: combinedMetadata,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Best-effort audit logging.
 * Catches and specifically ignores MISSING_TENANT errors to prevent crashing
 * critical paths (webhooks/background jobs) where context might be thin.
 */
const logAuditEvent = async (
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

export async function logClassificationAuditEvent(event: AuditEvent): Promise<void> {
  if (!event.tenantId) return logAuditEvent(event);
  try {
    await withTenantContext({ tenantId: event.tenantId }, tx => logAuditEvent(event, tx));
  } catch (error) {
    console.error('[Audit] Failed to log tenant event:', error);
  }
}
