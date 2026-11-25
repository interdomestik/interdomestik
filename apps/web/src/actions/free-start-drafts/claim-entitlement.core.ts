import type { FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';

import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';

/** Entitlement reads with this request's admitted authority, never a second session lookup. */
export async function hasAdmittedClaimEntitlement(context: FreeStartDraftContext) {
  const admission = await requireAdmittedMember();
  if (!admission.ok) return false;
  const { principal, tenantId, accessTenantId } = readTenantAuthority(
    admission.authorized.authority
  );
  if (
    principal?.userId !== context.ownerUserId ||
    tenantId !== context.tenantId ||
    accessTenantId !== context.accessTenantId
  ) {
    return false;
  }
  return hasActiveMembership(context.ownerUserId, admission.authorized.authority);
}
