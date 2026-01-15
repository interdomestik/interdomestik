/**
 * Document Audit - M3.1
 *
 * Minimal audit mechanism for document operations.
 * All uploads, downloads, shares, and deletes are logged.
 */
import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';

export type AuditEventType = 'upload' | 'view' | 'download' | 'share' | 'delete';

export interface AuditEventParams {
  tenantId: string;
  documentId: string;
  accessType: AuditEventType;
  accessedBy?: string;
  ipAddress?: string;
  userAgent?: string;
  shareToken?: string;
}

/**
 * Log an audit event for document access.
 * This is an append-only log that cannot be modified or deleted.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  const { tenantId, documentId, accessType, accessedBy, ipAddress, userAgent, shareToken } = params;

  await db.insert(schema.documentAccessLog).values({
    id: nanoid(),
    tenantId,
    documentId,
    accessType,
    accessedBy: accessedBy ?? null,
    accessedAt: new Date(),
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    shareToken: shareToken ?? null,
  });
}

/**
 * Capture an audit event with Sentry context.
 * Used for critical operations that should also be monitored.
 */
export function captureAudit(eventType: AuditEventType, context: Record<string, unknown>): void {
  // Import Sentry dynamically to avoid bundling issues
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/nextjs');
    Sentry.addBreadcrumb({
      category: 'document.access',
      message: `Document ${eventType}`,
      level: 'info',
      data: context,
    });
  } catch {
    // Sentry not available, silent fail
  }
}
