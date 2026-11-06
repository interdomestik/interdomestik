import { E2E_CASH_STATE_FIXTURES } from '@interdomestik/database';

const FIXTURES = Object.values(E2E_CASH_STATE_FIXTURES);
const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/**
 * Text of a queue row that belongs to a catalogued read-only cash state. A test that acts on a
 * row by position filters these out, so it never changes a state another test reads.
 */
export const CASH_STATE_ROW_TEXT = new RegExp(
  FIXTURES.map(fixture => escapeRegExp(fixture.email)).join('|')
);

/** Attempt ids of the catalogued cash states, excluded from queries that pick any attempt. */
export const CASH_STATE_ATTEMPT_IDS: readonly string[] = FIXTURES.map(fixture => fixture.attemptId);

/**
 * One seeded open cash request per tenant (golden seed `seedLeads`). Its attempt stays in the
 * operations queue in every state a golden test leaves it (pending, needs_info, resubmitted), so
 * tenant isolation checks can search for it by email in any test order.
 */
export const TENANT_OPEN_CASH_LEAD_EMAIL = {
  ks: 'ks_a_cash_lead_1@example.com',
  mk: 'lead.balkan@example.com',
} as const;
