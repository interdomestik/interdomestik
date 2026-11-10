import { ROLE_BRANCH_MANAGER, type RoleLike } from '@/lib/roles.core';

/** D1: allocation authority never grants document content, upload or delegation rights. */
export function deniesClaimDocumentContent(role: RoleLike): boolean {
  // isBranchManager also includes tenant administrators; D1 denies only this exact role.
  return role === ROLE_BRANCH_MANAGER;
}
