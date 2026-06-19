import { caseScopedAccessGrants, claims, sql, user } from '@interdomestik/database';

import { HANDOFF_DOCUMENT_CLASSES } from './jurisdiction-handoff-document-classes';
import type { HandoffClaimRow, HandoffTx } from './jurisdiction-handoff-types';

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
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.id} = ${actorId} and ${user.tenantId} = ${recoveryTenantId}`)
    .limit(1);
  return Boolean(row);
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

  const [existing] = await args.tx
    .select({
      actorId: caseScopedAccessGrants.actorId,
      accessTenantId: caseScopedAccessGrants.accessTenantId,
      caseId: caseScopedAccessGrants.caseId,
      correlationId: caseScopedAccessGrants.correlationId,
      id: caseScopedAccessGrants.id,
      revokedAt: caseScopedAccessGrants.revokedAt,
      tenantId: caseScopedAccessGrants.tenantId,
    })
    .from(caseScopedAccessGrants)
    .where(
      sql`
      ${caseScopedAccessGrants.id} = ${args.grantId}
      or (
        ${caseScopedAccessGrants.tenantId} = ${args.homeTenantId}
        and ${caseScopedAccessGrants.correlationId} = ${args.correlationId}
      )
      or (
        ${caseScopedAccessGrants.tenantId} = ${args.homeTenantId}
        and ${caseScopedAccessGrants.accessTenantId} = ${args.recoveryLegalTenantId}
        and ${caseScopedAccessGrants.caseId} = ${args.caseId}
        and ${caseScopedAccessGrants.actorId} = ${args.actorId}
        and ${caseScopedAccessGrants.revokedAt} is null
      )
    `
    )
    .limit(1);

  const isSameGrant =
    existing?.id === args.grantId &&
    existing.tenantId === args.homeTenantId &&
    existing.accessTenantId === args.recoveryLegalTenantId &&
    existing.caseId === args.caseId &&
    existing.actorId === args.actorId &&
    existing.correlationId === args.correlationId;
  if (isSameGrant) return existing.revokedAt ? 'revoked_exists' : 'already_exists';
  if (
    existing?.tenantId === args.homeTenantId &&
    existing.accessTenantId === args.recoveryLegalTenantId &&
    existing.caseId === args.caseId &&
    existing.actorId === args.actorId &&
    !existing.revokedAt
  ) {
    return 'active_grant_conflict';
  }
  return 'correlation_conflict';
}
