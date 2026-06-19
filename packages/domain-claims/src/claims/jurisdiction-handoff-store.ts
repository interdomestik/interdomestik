import { caseScopedAccessGrants, claims, sql, user } from '@interdomestik/database';

import { loadExistingHandoffGrantForConflict } from './jurisdiction-handoff-grant-conflict-query';
import { HANDOFF_DOCUMENT_CLASSES } from './jurisdiction-handoff-document-classes';
import { classifyExistingHandoffGrant } from './jurisdiction-handoff-store-conflicts';
import type { HandoffClaimRow, HandoffTx } from './jurisdiction-handoff-types';

export function isRecoveryGrantActorRole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'admin' || role === 'tenant_admin' || role === 'super_admin';
}

export async function lockHandoffClaim(
  tx: HandoffTx,
  tenantId: string,
  claimId: string
): Promise<void> {
  await tx.execute(sql`
    select 1
    from "claim"
    where "tenant_id" = ${tenantId}
      and "id" = ${claimId}
    for update
  `);
}

export async function loadHandoffClaim(
  tx: HandoffTx,
  tenantId: string,
  claimId: string
): Promise<HandoffClaimRow | undefined> {
  const [row] = await tx
    .select({
      branchId: claims.branchId,
      incidentCountryCode: claims.incidentCountryCode,
      lifecycleVersion: claims.lifecycleVersion,
      recoveryLegalTenantId: claims.recoveryLegalTenantId,
      staffId: claims.staffId,
    })
    .from(claims)
    .where(sql`${claims.tenantId} = ${tenantId} and ${claims.id} = ${claimId}`)
    .limit(1);
  return row as HandoffClaimRow | undefined;
}

export async function setRecoveryLegalTenantIfUnset(args: {
  claimId: string;
  expectedCurrentTenantId: string | null;
  homeTenantId: string;
  now: Date;
  recoveryLegalTenantId: string;
  tx: HandoffTx;
}): Promise<boolean> {
  const updated = await args.tx
    .update(claims)
    .set({ recoveryLegalTenantId: args.recoveryLegalTenantId, updatedAt: args.now })
    .where(
      sql`
      ${claims.tenantId} = ${args.homeTenantId}
      and ${claims.id} = ${args.claimId}
      and ${claims.recoveryLegalTenantId} is not distinct from ${args.expectedCurrentTenantId}
    `
    )
    .returning({ id: claims.id });
  return updated.length === 1;
}

export async function isGrantActorInRecoveryTenant(
  tx: HandoffTx,
  actorId: string,
  recoveryTenantId: string
): Promise<boolean> {
  const [row] = await tx
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(
      sql`
        ${user.id} = ${actorId}
        and ${user.tenantId} = ${recoveryTenantId}
        and ${user.role} in ('staff', 'admin', 'tenant_admin', 'super_admin')
      `
    )
    .limit(1);
  return isRecoveryGrantActorRole(row?.role);
}

export async function insertHandoffGrant(args: {
  actorId: string;
  caseId: string;
  correlationId: string;
  createdAt: Date;
  createdById: string;
  expiresAt: Date | null;
  grantId: string;
  homeTenantId: string;
  recoveryLegalTenantId: string;
  tx: HandoffTx;
}): Promise<
  | 'active_grant_conflict'
  | 'already_exists'
  | 'correlation_conflict'
  | 'expiry_conflict'
  | 'expired_exists'
  | 'inserted'
  | 'revoked_exists'
> {
  const inserted = await args.tx
    .insert(caseScopedAccessGrants)
    .values({
      id: args.grantId,
      tenantId: args.homeTenantId,
      accessTenantId: args.recoveryLegalTenantId,
      caseId: args.caseId,
      actorId: args.actorId,
      documentClasses: [...HANDOFF_DOCUMENT_CLASSES],
      expiresAt: args.expiresAt,
      revokedAt: null,
      createdById: args.createdById,
      correlationId: args.correlationId,
      createdAt: args.createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: caseScopedAccessGrants.id });
  if (inserted.length === 1) return 'inserted';

  const existing = await loadExistingHandoffGrantForConflict(args.tx, args);
  return classifyExistingHandoffGrant(existing, { ...args, now: args.createdAt });
}
