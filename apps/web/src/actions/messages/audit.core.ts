import { auditLog, withTenantContext } from '@interdomestik/database';
import type { AuditEvent } from '@interdomestik/domain-communications';
import { nanoid } from 'nanoid';

/** Best-effort message audit after the message transaction has committed. */
export async function logMessageAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const tenantId = event.tenantId?.trim();
    if (!tenantId) {
      console.error(`Audit log failed: Missing tenantId for action: ${event.action}`, {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
      });
      return;
    }

    const forwardedFor = event.headers?.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() || event.headers?.get('x-real-ip') || undefined;
    const userAgent = event.headers?.get('user-agent') || undefined;

    await withTenantContext({ tenantId, role: event.actorRole }, async tx => {
      await tx.insert(auditLog).values({
        id: nanoid(),
        tenantId,
        actorId: event.actorId || null,
        actorRole: event.actorRole || null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId || null,
        metadata: { ...event.metadata, ...(event.headers ? { ip, userAgent } : {}) },
        createdAt: new Date(),
      });
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
