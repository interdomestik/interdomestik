import { E2E_USERS } from './e2e-users';

/**
 * Cash verification states seeded as read-only rows in a dedicated KS branch.
 *
 * The golden branches carry count and health contracts (KS-A three open attempts, KS-B one; the
 * health labels are asserted by the golden tests), so these states live in KS-D with their own
 * agent. Every row is the state the verify, resubmit and convert transitions leave behind; which
 * actions each state admits is asserted by the tests, not declared here. Instants are fixed
 * calendar values.
 */
export const E2E_CASH_STATES_BRANCH = {
  id: 'ks_branch_d',
  name: 'KS Branch D (Cash states)',
  slug: 'ks-branch-d',
  code: 'KS-D',
} as const;

/** Login identities of the cash states; the E2E_USERS catalogue owns their addresses. */
export const E2E_CASH_STATE_USERS = {
  KS_AGENT_CASH_STATES: E2E_USERS.KS_AGENT_CASH_STATES,
  KS_MEMBER_CONVERTED_LEAD: E2E_USERS.KS_MEMBER_CONVERTED_LEAD,
} as const;

export const E2E_CASH_INSTANTS = {
  SUBMITTED: '2025-12-01T09:00:00.000Z',
  DECIDED: '2025-12-02T09:00:00.000Z',
  RESUBMITTED: '2025-12-03T09:00:00.000Z',
  /** Conversion grants one annual term from the approval (createActiveAnnualMembershipState). */
  ANNUAL_PERIOD_END: '2026-12-02T09:00:00.000Z',
} as const;

export type E2ECashInstant = keyof typeof E2E_CASH_INSTANTS;

export type E2ECashStateFixture = {
  readonly leadId: string;
  readonly attemptId: string;
  readonly email: string;
  readonly leadStatus: 'payment_pending' | 'paid' | 'converted';
  readonly attemptStatus: 'pending' | 'needs_info' | 'rejected' | 'succeeded';
  readonly isResubmission: boolean;
  /** The verifier's note on the last decision; every state here was decided once. */
  readonly note: string | null;
  readonly convertedMember: keyof typeof E2E_CASH_STATE_USERS | null;
};

export const E2E_CASH_STATE_FIXTURES = {
  NEEDS_INFO: {
    leadId: 'golden_ks_cash_needs_info',
    attemptId: 'golden_attempt_ks_cash_needs_info',
    email: 'ks_cash_needs_info@example.com',
    leadStatus: 'payment_pending',
    attemptStatus: 'needs_info',
    isResubmission: false,
    note: 'Receipt is missing the payment date.',
    convertedMember: null,
  },
  RESUBMITTED: {
    leadId: 'golden_ks_cash_resubmitted',
    attemptId: 'golden_attempt_ks_cash_resubmitted',
    email: 'ks_cash_resubmitted@example.com',
    leadStatus: 'payment_pending',
    attemptStatus: 'pending',
    isResubmission: true,
    note: 'Receipt photo is unreadable.',
    convertedMember: null,
  },
  REJECTED: {
    leadId: 'golden_ks_cash_rejected',
    attemptId: 'golden_attempt_ks_cash_rejected',
    email: 'ks_cash_rejected@example.com',
    leadStatus: 'payment_pending',
    attemptStatus: 'rejected',
    isResubmission: false,
    note: 'Receipt amount does not match the plan price.',
    convertedMember: null,
  },
  APPROVED_CONVERSION_PENDING: {
    leadId: 'golden_ks_cash_conversion_pending',
    attemptId: 'golden_attempt_ks_cash_conversion_pending',
    email: 'ks_cash_conversion_pending@example.com',
    leadStatus: 'paid',
    attemptStatus: 'succeeded',
    isResubmission: false,
    note: null,
    convertedMember: null,
  },
  CONVERTED: {
    leadId: 'golden_ks_cash_converted',
    attemptId: 'golden_attempt_ks_cash_converted',
    email: E2E_CASH_STATE_USERS.KS_MEMBER_CONVERTED_LEAD.email,
    leadStatus: 'converted',
    attemptStatus: 'succeeded',
    isResubmission: false,
    note: null,
    convertedMember: 'KS_MEMBER_CONVERTED_LEAD',
  },
} as const satisfies Record<string, E2ECashStateFixture>;

export type E2ECashStateKey = keyof typeof E2E_CASH_STATE_FIXTURES;

export function e2eCashInstant(instant: E2ECashInstant): Date {
  return new Date(E2E_CASH_INSTANTS[instant]);
}
