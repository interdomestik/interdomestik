import { auditLog, db } from '@interdomestik/database';
import { nanoid } from 'nanoid';

export type AuditEvent = {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
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

export async function logAuditEvent({
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
    const combinedMetadata = {
      ...metadata,
      ...requestMetadata,
    };

    await db.insert(auditLog).values({
      id: nanoid(),
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
