/**
 * Document Audit - M3.1
 *
 * Minimal audit mechanism for document operations.
 * All uploads, downloads, shares, and deletes are logged.
 */

import * as schema from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { nanoid } from 'nanoid';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type AuditEventType = 'upload' | 'view' | 'download' | 'share' | 'delete';

export interface AuditEventParams {
  authority: TenantAuthority;
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
  const { authority, documentId, accessType, accessedBy, ipAddress, userAgent, shareToken } =
    params;
  const { tenantId } = readTenantAuthority(authority);

  // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
  await withTenantAuthority(authority, tx =>
    tx.insert(schema.documentAccessLog).values({
      id: nanoid(),
      tenantId,
      documentId,
      accessType,
      accessedBy: accessedBy ?? null,
      accessedAt: new Date(),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      shareToken: shareToken ?? null,
    })
  );
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
