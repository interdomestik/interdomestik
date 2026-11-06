import {
  E2E_CASE_FIXTURES,
  E2E_CLAIM_STATE_FIXTURES,
  E2E_RELATIONSHIP_FIXTURES,
  type E2EUserKey,
} from '@interdomestik/database';

export type ClaimSurface = 'member' | 'staff' | 'admin' | 'agent';
export type AccessRow = readonly [surface: ClaimSurface, caseId: string, allowed: boolean];
export type ActorCases = { actor: E2EUserKey; rows: readonly AccessRow[] };

const ANCHOR = E2E_CASE_FIXTURES.KS_ANCHOR.id;
const OTHER_MEMBER = E2E_CASE_FIXTURES.KS_OTHER_MEMBER.id;
const OTHER_BRANCH = E2E_CASE_FIXTURES.KS_OTHER_BRANCH.id;
const FOREIGN = E2E_CASE_FIXTURES.MK_FOREIGN_TENANT.id;
const rel = E2E_RELATIONSHIP_FIXTURES;
const DRAFT = E2E_CLAIM_STATE_FIXTURES.DRAFT.id;
const REJECTED = E2E_CLAIM_STATE_FIXTURES.REJECTED.id;
const AIRLINE = E2E_CLAIM_STATE_FIXTURES.SUBMITTED_TO_AIRLINE.id;

/**
 * Seeded titles (seed-golden/claims.ts); KS-A titles carry the current status. Body text runs
 * headings into the next word ("Claim 1Automjet"), so a digit lookahead replaces `\b`.
 */
export const CASE_TITLES: Record<string, RegExp> = {
  [ANCHOR]: /KS-A \S+ Claim 1(?!\d)/,
  [OTHER_MEMBER]: /KS-A \S+ Claim 2(?!\d)/,
  [OTHER_BRANCH]: /KS-B Claim 1(?!\d)/,
  [FOREIGN]: /Rear ended in Skopje/,
  [DRAFT]: /KS-D Draft Claim/,
  [REJECTED]: /KS-D Rejected Claim/,
  [AIRLINE]: /KS-D Submitted to Airline Claim/,
};

/**
 * Current runtime claim-detail access per catalogue actor on its home tenant host. Relationship
 * rows come from E2E_RELATIONSHIP_FIXTURES; the remaining rows are portal and read-only limits.
 */
export const KS_ACTOR_CASES: readonly ActorCases[] = [
  {
    actor: rel.CROSS_TENANT.allowedActor,
    rows: [
      ['admin', rel.CROSS_TENANT.caseId, true],
      ['admin', rel.CROSS_TENANT.deniedCaseId, false],
      ['admin', DRAFT, true],
      ['admin', REJECTED, true],
      ['admin', AIRLINE, true],
    ],
  },
  {
    actor: rel.CROSS_BRANCH.allowedActor,
    rows: [
      ['admin', rel.CROSS_BRANCH.caseId, true],
      ['admin', rel.CROSS_BRANCH.deniedCaseId, false],
      ['staff', rel.CROSS_BRANCH.caseId, true],
      ['staff', rel.CROSS_BRANCH.deniedCaseId, false],
      ['admin', AIRLINE, false],
    ],
  },
  {
    actor: rel.STAFF_ASSIGNMENT.allowedActor,
    rows: [
      ['staff', rel.STAFF_ASSIGNMENT.caseId, true],
      ['staff', FOREIGN, false],
      ['admin', ANCHOR, false],
    ],
  },
  {
    actor: rel.STAFF_ASSIGNMENT.deniedActor,
    rows: [
      ['staff', rel.STAFF_ASSIGNMENT.caseId, false],
      // A member draft reaches staff only after submission.
      ['staff', DRAFT, false],
      ['staff', REJECTED, true],
      ['staff', AIRLINE, true],
    ],
  },
  {
    actor: rel.AGENT_ACTIVE_VS_INACTIVE_LINK.allowedActor,
    rows: [
      ['agent', rel.AGENT_ACTIVE_VS_INACTIVE_LINK.caseId, true],
      ['staff', ANCHOR, false],
      ['admin', ANCHOR, false],
    ],
  },
  {
    actor: rel.AGENT_ACTIVE_VS_INACTIVE_LINK.deniedActor,
    rows: [['agent', rel.AGENT_ACTIVE_VS_INACTIVE_LINK.deniedCaseId, false]],
  },
  {
    actor: rel.MEMBER_OWNERSHIP.allowedActor,
    rows: [
      ['member', rel.MEMBER_OWNERSHIP.caseId, true],
      ['member', rel.MEMBER_OWNERSHIP.deniedCaseId, false],
      ['member', FOREIGN, false],
      ['staff', ANCHOR, false],
      ['admin', ANCHOR, false],
    ],
  },
  {
    actor: 'KS_MEMBER_CONVERTED_LEAD',
    rows: [
      ['member', DRAFT, true],
      ['member', REJECTED, true],
      ['member', AIRLINE, true],
      ['member', ANCHOR, false],
    ],
  },
  {
    actor: 'KS_AGENT_CASH_STATES',
    rows: [
      ['agent', DRAFT, false],
      ['agent', REJECTED, false],
      ['agent', AIRLINE, false],
    ],
  },
  {
    actor: 'GLOBAL_SUPPORT',
    rows: [
      ['member', ANCHOR, false],
      ['staff', ANCHOR, false],
      ['admin', ANCHOR, false],
    ],
  },
];

export const MK_ACTOR_CASES: readonly ActorCases[] = [
  {
    actor: 'MK_ADMIN',
    rows: [
      ['admin', FOREIGN, true],
      ['admin', ANCHOR, false],
      ['admin', AIRLINE, false],
    ],
  },
  {
    actor: 'SUPER_ADMIN',
    rows: [
      ['admin', FOREIGN, true],
      ['admin', ANCHOR, false],
    ],
  },
  {
    actor: 'AUDITOR',
    rows: [
      ['member', FOREIGN, false],
      ['staff', FOREIGN, false],
      ['admin', FOREIGN, false],
    ],
  },
];
