import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { auditLog } from './schema/notes';
import { tenants } from './schema/tenants';

// Security events of anonymous requests (a refused sign-in, a password-reset request) are recorded
// in the audit log of the tenant whose public site served the request, before any session exists.
// They need no tenant authority: this fixed append writes one row with no actor, for an allowlisted
// action, into an active tenant, and returns nothing. It grants no read and no other write, so an
// anonymous request never holds a capability for the tenant it names.

const ANONYMOUS_AUDIT_ACTIONS = new Set([
  'auth.signin_denied_wrong_tenant',
  'auth.password_reset_requested',
]);

const MAX_METADATA_BYTES = 2_048;

export type AnonymousTenantAuditEvent = Readonly<{
  tenantId: string;
  action: string;
  entityType: 'auth';
  metadata?: Record<string, unknown>;
}>;

/** Appends one anonymous security event. Returns false (writing nothing) when it is refused. */
export async function appendAnonymousTenantAuditEvent(
  event: AnonymousTenantAuditEvent
): Promise<boolean> {
  const tenantId = typeof event.tenantId === 'string' ? event.tenantId.trim() : '';
  if (!tenantId || !ANONYMOUS_AUDIT_ACTIONS.has(event.action) || event.entityType !== 'auth') {
    return false;
  }
  const metadata = event.metadata ?? {};
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > MAX_METADATA_BYTES) return false;

  // db-access-guard: system-exempt -- reason: fixed anonymous security-event append into an active tenant; no actor, no read
  const [active] = await dbAdmin
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.isActive, true)))
    .limit(1);
  if (!active) return false;

  // db-access-guard: system-exempt -- reason: fixed anonymous security-event append into an active tenant; no actor, no read
  await dbAdmin.insert(auditLog).values({
    id: randomUUID(),
    tenantId: active.id,
    actorId: null,
    actorRole: null,
    action: event.action,
    entityType: event.entityType,
    entityId: null,
    metadata,
  });
  return true;
}
