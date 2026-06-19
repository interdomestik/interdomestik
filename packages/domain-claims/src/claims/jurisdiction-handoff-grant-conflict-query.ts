import { caseScopedAccessGrants, sql } from '@interdomestik/database';

import type { ExistingGrantRow, GrantConflictInput } from './jurisdiction-handoff-store-conflicts';
import type { HandoffTx } from './jurisdiction-handoff-types';

export async function loadExistingHandoffGrantForConflict(
  tx: HandoffTx,
  args: Omit<GrantConflictInput, 'now'>
): Promise<ExistingGrantRow | undefined> {
  const [existing] = await tx
    .select({
      actorId: caseScopedAccessGrants.actorId,
      accessTenantId: caseScopedAccessGrants.accessTenantId,
      caseId: caseScopedAccessGrants.caseId,
      correlationId: caseScopedAccessGrants.correlationId,
      expiresAt: caseScopedAccessGrants.expiresAt,
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
    .orderBy(
      sql`case
        when ${caseScopedAccessGrants.id} = ${args.grantId} then 1
        when (
          ${caseScopedAccessGrants.tenantId} = ${args.homeTenantId}
          and ${caseScopedAccessGrants.accessTenantId} = ${args.recoveryLegalTenantId}
          and ${caseScopedAccessGrants.caseId} = ${args.caseId}
          and ${caseScopedAccessGrants.actorId} = ${args.actorId}
          and ${caseScopedAccessGrants.revokedAt} is null
        ) then 2
        else 3
      end`
    )
    .limit(1);
  return existing;
}
