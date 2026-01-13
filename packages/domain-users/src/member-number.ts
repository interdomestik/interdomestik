/**
 * Member Number Re-export
 *
 * This module re-exports the canonical member number generator from
 * @interdomestik/database/member-number to maintain backward compatibility.
 *
 * CANONICAL SOURCE: packages/database/src/member-number.ts
 * DO NOT DUPLICATE LOGIC HERE - always import from the canonical source.
 */

export {
  formatMemberNumber,
  generateMemberNumber,
  generateMemberNumberWithRetry,
  isMemberNumberSearch,
  isValidMemberNumber,
  parseMemberNumber,
} from '@interdomestik/database/member-number';

export type {
  GenerateMemberNumberParams,
  GenerateMemberNumberResult,
} from '@interdomestik/database/member-number';
