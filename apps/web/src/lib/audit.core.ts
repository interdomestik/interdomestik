import { auditLog } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

// An audit row is written inside the tenant that owns it, under the authority the caller already
// holds. The event carries no tenant id of its own, so a payload or metadata value can never choose
// the tenant of an audit row.
export type AuditEvent = {
  authority: TenantAuthority;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  headers?: Headers;
};

export function extractRequestMetadata(requestHeaders?: Headers) {
  if (!requestHeaders) return {};

  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || undefined;
  const userAgent = requestHeaders.get('user-agent') || undefined;

  return {
    ip,
    userAgent,
  };
}

export type AuditWriteOutcome = { ok: true } | { ok: false; error: unknown };

/**
 * Writes one audit row and reports the outcome instead of swallowing it, for callers that must act
 * on a failed write (the refusal record of the action wrapper). Never adds request headers.
 */
export async function writeAuditEvent({
  authority,
  actorId,
  actorRole,
  action,
  entityType,
  entityId,
  metadata,
}: Omit<AuditEvent, 'headers'>): Promise<AuditWriteOutcome> {
  try {
    const { tenantId } = readTenantAuthority(authority);

    // The runtime role only accepts audit rows inside the tenant context that owns them.
    await withTenantAuthority(authority, tx =>
      tx.insert(auditLog).values({
        id: nanoid(),
        tenantId,
        actorId: actorId || null,
        actorRole: actorRole || null,
        action,
        entityType,
        entityId: entityId || null,
        // Drizzle inspects the value's prototype before encoding JSONB. Copy the refusal's
        // own fields here and shadow inherited toJSON; its nested subject stays null-prototype.
        metadata:
          action === 'action.refused' && metadata && Object.getPrototypeOf(metadata) === null
            ? { ...metadata, toJSON: undefined }
            : (metadata ?? {}),
        createdAt: new Date(),
      })
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function logAuditEvent({ headers, ...event }: AuditEvent) {
  try {
    const requestMetadata = extractRequestMetadata(headers);
    const combinedMetadata: Record<string, unknown> = {
      ...event.metadata,
      ...requestMetadata,
    };

    if (!event.authority) {
      const errorMsg = `Audit log failed: Missing tenant authority for action: ${event.action}`;
      console.error(errorMsg, {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
      });

      if (process.env.INTERDOMESTIK_AUTOMATED === '1') {
        throw new Error(errorMsg);
      }
      return;
    }

    const outcome = await writeAuditEvent({ ...event, metadata: combinedMetadata });
    if (!outcome.ok) throw outcome.error;
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
