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

export async function logAuditEvent({
  authority,
  actorId,
  actorRole,
  action,
  entityType,
  entityId,
  metadata,
  headers,
}: AuditEvent) {
  try {
    const requestMetadata = extractRequestMetadata(headers);
    const combinedMetadata: Record<string, unknown> = {
      ...metadata,
      ...requestMetadata,
    };

    if (!authority) {
      const errorMsg = `Audit log failed: Missing tenant authority for action: ${action}`;
      console.error(errorMsg, { action, entityType, entityId });

      if (process.env.INTERDOMESTIK_AUTOMATED === '1') {
        throw new Error(errorMsg);
      }
      return;
    }

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
        metadata: combinedMetadata,
        createdAt: new Date(),
      })
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
