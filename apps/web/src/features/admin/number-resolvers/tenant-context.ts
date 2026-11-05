import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { findClaimIdByNumber, type ClaimNumberLookup } from './claim-number-lookup';
import { findMemberIdByNumber, type MemberNumberLookup } from './member-number-lookup';

/**
 * Resolves a claim number inside the request session's tenant transaction. The transaction is
 * lent only to the named lookup and never leaves this call.
 */
export function findClaimIdInTenantContext(
  authority: TenantAuthority,
  lookup: ClaimNumberLookup
): Promise<string | null> {
  return withTenantAuthority(authority, tx => findClaimIdByNumber(tx, lookup));
}

/** Resolves a member number inside the request session's tenant transaction. */
export function findMemberIdInTenantContext(
  authority: TenantAuthority,
  lookup: MemberNumberLookup
): Promise<string | null> {
  return withTenantAuthority(authority, tx => findMemberIdByNumber(tx, lookup));
}
