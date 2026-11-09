import { claims } from '@interdomestik/database';
import { and, eq, inArray, ne, type AnyColumn } from 'drizzle-orm';
import {
  buildAccessibleClaimIdsSubquery,
  isFullTenantClaimsRole,
  isMessageParticipant,
  readAgentScope,
} from './access';

type AcknowledgementScope = Parameters<typeof buildAccessibleClaimIdsSubquery>[0];

/** Shared claim admission for the history capability and the receipt UPDATE. */
export function buildAcknowledgementClaimFilter(
  args: AcknowledgementScope & { claimIdColumn: AnyColumn }
) {
  if (!isMessageParticipant(args.role)) return ne(args.claimIdColumn, args.claimIdColumn);
  if (isFullTenantClaimsRole(args.role)) return undefined;
  return inArray(args.claimIdColumn, buildAccessibleClaimIdsSubquery(args));
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
      buildAcknowledgementClaimFilter({ ...args, branchId, claimIdColumn: claims.id })
    ),
  });
  return admitted != null;
}
