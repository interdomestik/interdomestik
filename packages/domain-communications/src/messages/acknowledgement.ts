import { claimMessages, claims } from '@interdomestik/database';
import { and, eq, inArray, ne, type SQL } from 'drizzle-orm';
import {
  buildAccessibleClaimIdsSubquery,
  isFullTenantClaimsRole,
  isMessageParticipant,
  readAgentScope,
} from './access';

type AcknowledgementScope = Parameters<typeof buildAccessibleClaimIdsSubquery>[0];

/** Shared claim admission for the history capability and the receipt UPDATE. */
export function buildAcknowledgementClaimFilter(
  args: AcknowledgementScope,
  target: 'claim' | 'message'
): SQL | undefined {
  // Keep schema references at the query builder; callers pass only scope and a scalar target.
  if (!isMessageParticipant(args.role)) {
    return target === 'claim'
      ? ne(claims.id, claims.id)
      : ne(claimMessages.claimId, claimMessages.claimId);
  }
  if (isFullTenantClaimsRole(args.role)) return undefined;
  const accessibleClaimIds = buildAccessibleClaimIdsSubquery(args);
  return target === 'claim'
    ? inArray(claims.id, accessibleClaimIds)
    : inArray(claimMessages.claimId, accessibleClaimIds);
}

export async function canAcknowledgeClaim(
  args: AcknowledgementScope & { claimId: string }
): Promise<boolean> {
  if (!isMessageParticipant(args.role)) return false;
  let branchId = args.branchId;
  if (args.role === 'agent') {
    const scope = await readAgentScope(args.tx, args);
    if (!scope) return false;
    branchId = scope.branchId;
  }
  const admitted = await args.tx.query.claims.findFirst({
    columns: { id: true },
    where: and(
      eq(claims.tenantId, args.tenantId),
      eq(claims.id, args.claimId),
      buildAcknowledgementClaimFilter(
        {
          tx: args.tx,
          tenantId: args.tenantId,
          userId: args.userId,
          role: args.role,
          branchId,
        },
        'claim'
      )
    ),
  });
  return admitted != null;
}
