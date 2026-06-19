import type { CaseScopedAccessGrant } from '@interdomestik/shared-auth';

import { HANDOFF_DOCUMENT_CLASSES } from './jurisdiction-handoff-document-classes';
import type { HandoffClaimRow, JurisdictionHandoffParams } from './jurisdiction-handoff-types';

const HOME_AUTHORIZED_ROLES = new Set([
  'admin',
  'branch_manager',
  'global_support',
  'staff',
  'super_admin',
  'tenant_admin',
]);

export function canInitiateHandoff(
  actor: JurisdictionHandoffParams['actor'],
  claim: HandoffClaimRow
): boolean {
  if (!HOME_AUTHORIZED_ROLES.has(actor.role)) return false;
  if (['admin', 'tenant_admin', 'super_admin', 'global_support'].includes(actor.role)) return true;
  if (actor.role === 'branch_manager')
    return Boolean(actor.branchId && actor.branchId === claim.branchId);
  return claim.staffId === actor.id;
}

export function toSessionGrant(args: {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  expiresAt: Date | null;
}): CaseScopedAccessGrant {
  return {
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: args.caseId,
    documentClasses: HANDOFF_DOCUMENT_CLASSES,
    expiresAt: args.expiresAt,
    revokedAt: null,
  };
}
