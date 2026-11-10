import { ROLE_BRANCH_MANAGER, type RoleLike } from './roles.core';

/** Claim communication content is restricted only for the exact branch-manager role. */
export function deniesClaimMessageContent(role: RoleLike): boolean {
  return role === ROLE_BRANCH_MANAGER;
}
