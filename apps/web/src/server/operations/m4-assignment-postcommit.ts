import type { TenantTransaction } from '@interdomestik/database';
import * as schema from '@interdomestik/database/schema';
import { sendClaimAssignedEmail } from '@interdomestik/domain-communications/email';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { createHash } from 'node:crypto';

// Private controller receipt only: never a wire DTO or a notification SDK export.
export type InitialCommittedAssignmentNotification = Readonly<{
  operationId: string;
  actorId: string;
  tenantId: string;
  staffId: string;
  entry: 'legacy-admin' | 'legacy-agent';
  claimId: string;
}>;

type OwnedPurposeDatabase = Readonly<{
  database: PostgresJsDatabase<typeof schema>;
  close: () => Promise<void>;
  readonly deliveryAllowed: boolean;
}>;

// The sole private bootstrap supplies a fresh, posture-checked restricted pool with its
// own acquisition/statement/lock/transaction deadline. Never accept this opener over wire.
export function createM4AssignmentPostcommitNotifier(
  openOwnedPurposeDatabase: () => Promise<OwnedPurposeDatabase>
) {
  return async function dispatchInitialCommittedAssignmentNotification(
    reference: InitialCommittedAssignmentNotification
  ): Promise<'skipped' | 'stored' | 'email-sent' | 'failed'> {
    let owned: OwnedPurposeDatabase | undefined;
    try {
      // Capture primitives before the first await; title/name are deliberately not authority.
      const identity = Object.freeze({
        operationId: reference.operationId,
        actorId: reference.actorId,
        tenantId: reference.tenantId,
        staffId: reference.staffId,
        entry: reference.entry,
        claimId: reference.claimId,
      });
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          identity.operationId
        ) ||
        ![identity.actorId, identity.tenantId, identity.staffId, identity.claimId].every(
          value => typeof value === 'string' && value.length > 0
        ) ||
        (identity.entry !== 'legacy-admin' && identity.entry !== 'legacy-agent')
      )
        return 'skipped';
      owned = await openOwnedPurposeDatabase();
      const effect = await owned.database.transaction(tx => storeInitialAssignment(tx, identity));
      // Await commit and owned DB cleanup before any external delivery. A close failure
      // suppresses email; it cannot undo an already committed assignment or notification.
      await owned.close();
      const deliveryAllowed = owned.deliveryAllowed;
      owned = undefined;
      if (!deliveryAllowed) return 'failed';
      if (!effect) return 'skipped';
      if (!effect.deliver) return 'stored';
      const sent = await effect.deliver();
      return sent.success ? 'email-sent' : 'failed';
    } catch {
      return 'failed';
    } finally {
      if (owned) await owned.close().catch(() => undefined);
    }
  };
}

type Identity = Readonly<{
  operationId: string;
  actorId: string;
  tenantId: string;
  staffId: string;
  entry: 'legacy-admin' | 'legacy-agent';
  claimId: string;
}>;

async function storeInitialAssignment(tx: TenantTransaction, identity: Identity) {
  await tx.execute(sql`select set_config('row_security', 'on', true),
    set_config('app.current_tenant_id', ${identity.tenantId}, true),
    set_config('app.current_access_tenant_id', ${identity.tenantId}, true)`);
  const [ledger] = await tx
    .select()
    .from(schema.operationResults)
    .where(
      and(
        eq(schema.operationResults.operationId, identity.operationId),
        eq(schema.operationResults.tenantId, identity.tenantId)
      )
    )
    .limit(1)
    .for('share');
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        1,
        'm4.legacy.assign-claim',
        identity.actorId,
        identity.tenantId,
        identity.claimId,
        identity.staffId,
        identity.entry,
      ])
    )
    .digest('hex');
  if (
    !ledger ||
    ledger.actorId !== identity.actorId ||
    ledger.claimId !== identity.claimId ||
    ledger.command !== 'm4.legacy.assign-claim' ||
    ledger.version !== 1 ||
    ledger.requestFingerprint !== fingerprint
  )
    return null;
  const response = ledger.response;
  if (
    !response ||
    Object.keys(response).length !== 2 ||
    typeof response.changed !== 'boolean' ||
    !response.result ||
    typeof response.result !== 'object' ||
    Array.isArray(response.result)
  )
    return null;
  const result = response.result as Record<string, unknown>;
  if (
    Object.keys(result).length !== 1 ||
    result.success !== true ||
    (identity.entry === 'legacy-admin' && !response.changed)
  )
    return null;
  const [claim] = await tx
    .select({ id: schema.claims.id, title: schema.claims.title })
    .from(schema.claims)
    .where(
      and(
        eq(schema.claims.id, identity.claimId),
        eq(schema.claims.tenantId, identity.tenantId),
        eq(schema.claims.staffId, identity.staffId)
      )
    )
    .limit(1)
    .for('share');
  if (!claim) return null;
  const [staff] = await tx
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
    })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.id, identity.staffId),
        eq(schema.user.tenantId, identity.tenantId),
        eq(schema.user.role, 'staff')
      )
    )
    .limit(1)
    .for('share');
  if (!staff) return null;
  const [inserted] = await tx
    .insert(schema.notifications)
    .values({
      id: `ntf_m4_assignment_${identity.operationId}`,
      tenantId: identity.tenantId,
      userId: staff.id,
      type: 'claim_assigned',
      title: 'New Claim Assigned',
      content: `Update on: ${claim.title}`,
      actionUrl: `/staff/claims/${claim.id}`,
      isRead: false,
    })
    .onConflictDoNothing({ target: schema.notifications.id })
    .returning({ id: schema.notifications.id });
  if (!inserted) return null;
  const email = staff.emailVerified && staff.email ? staff.email : null;
  const frozenClaim = Object.freeze({ id: claim.id, title: claim.title });
  const staffName = staff.name || 'Staff';
  // The email address remains inside this private closure, never in the public result.
  return {
    deliver: email ? () => sendClaimAssignedEmail(email, frozenClaim, staffName) : null,
  };
}

export type M4AssignmentPostcommitNotifier = ReturnType<
  typeof createM4AssignmentPostcommitNotifier
>;
