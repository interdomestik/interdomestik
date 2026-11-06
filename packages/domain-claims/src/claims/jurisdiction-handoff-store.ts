import { claims, sql } from '@interdomestik/database';

import type { HandoffClaimRow, HandoffTx } from './jurisdiction-handoff-types';

export { insertHandoffGrant } from './jurisdiction-handoff-store-insert';

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
