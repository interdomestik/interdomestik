import type { ClaimStatus } from './constants';
import { E2E_CASH_STATES_BRANCH } from './e2e-cash-fixtures';

/**
 * Claim states the golden seed did not name before: a member draft, a case rejected and closed,
 * and a recovery submitted to the airline. They live in KS-D, the read-only states branch, so the
 * KS-A/KS-B/KS-C counts, SLA breaches and health labels the golden tests assert stay unchanged.
 *
 * The claimant is the converted cash-state member, who holds no active agent client grant, so
 * the attributed agent is denied every one of these claims. The two decided cases are assigned to
 * the branchless KS staff; the draft has no staff. Instants are fixed calendar values.
 */
export const E2E_CLAIM_STATE_INSTANTS = {
  CREATED: '2025-11-03T09:00:00.000Z',
  STATUS_CHANGED: '2025-11-10T09:00:00.000Z',
} as const;

export type E2EClaimStateFixture = {
  readonly id: string;
  readonly title: string;
  readonly status: ClaimStatus;
  readonly owner: 'KS_MEMBER_CONVERTED_LEAD';
  readonly agent: 'KS_AGENT_CASH_STATES';
  readonly staff: 'KS_STAFF_UNASSIGNED' | null;
};

export const E2E_CLAIM_STATE_FIXTURES = {
  DRAFT: {
    id: 'golden_ks_d_claim_draft',
    title: 'KS-D Draft Claim',
    status: 'draft',
    owner: 'KS_MEMBER_CONVERTED_LEAD',
    agent: 'KS_AGENT_CASH_STATES',
    staff: null,
  },
  REJECTED: {
    id: 'golden_ks_d_claim_rejected',
    title: 'KS-D Rejected Claim',
    status: 'rejected',
    owner: 'KS_MEMBER_CONVERTED_LEAD',
    agent: 'KS_AGENT_CASH_STATES',
    staff: 'KS_STAFF_UNASSIGNED',
  },
  SUBMITTED_TO_AIRLINE: {
    id: 'golden_ks_d_claim_airline',
    title: 'KS-D Submitted to Airline Claim',
    status: 'submitted_to_airline',
    owner: 'KS_MEMBER_CONVERTED_LEAD',
    agent: 'KS_AGENT_CASH_STATES',
    staff: 'KS_STAFF_UNASSIGNED',
  },
} as const satisfies Record<string, E2EClaimStateFixture>;

export type E2EClaimStateKey = keyof typeof E2E_CLAIM_STATE_FIXTURES;

/** The branch every named claim state belongs to. */
export const E2E_CLAIM_STATES_BRANCH_ID = E2E_CASH_STATES_BRANCH.id;

export function e2eClaimStateInstant(instant: keyof typeof E2E_CLAIM_STATE_INSTANTS): Date {
  return new Date(E2E_CLAIM_STATE_INSTANTS[instant]);
}
