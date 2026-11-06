import { eq, inArray } from 'drizzle-orm';
import { E2E_CASH_STATES_BRANCH } from './e2e-cash-fixtures';
import { buildCashStatesToSeed, buildConvertedMembershipToSeed } from './seed-golden/cash-states';
import { compareRow } from './seed-assert-lifecycle';

type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');

function compareExactSet(
  failures: string[],
  label: string,
  found: { id: string }[],
  expected: { id: string }[]
) {
  const want = new Set(expected.map(row => row.id));
  const extra = found.filter(row => !want.has(row.id)).map(row => row.id);
  if (found.length !== expected.length || extra.length > 0) {
    failures.push(
      `${label}: expected ${expected.length}, found ${found.length}` +
        (extra.length > 0 ? ` (unexpected ${extra.join(', ')})` : '')
    );
  }
}

/**
 * The cash-state branch holds exactly the catalogued leads and attempts, field for field, and the
 * converted lead's member owns exactly its seeded membership. Drift or extra rows fail.
 */
export async function collectCashStateViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const failures: string[] = [];
  const expected = buildCashStatesToSeed();
  const leads = await db
    .select()
    .from(schema.memberLeads)
    .where(eq(schema.memberLeads.branchId, E2E_CASH_STATES_BRANCH.id));
  const attempts = await db
    .select()
    .from(schema.leadPaymentAttempts)
    .where(
      inArray(
        schema.leadPaymentAttempts.leadId,
        expected.map(row => row.lead.id)
      )
    );
  compareExactSet(
    failures,
    'cash-state leads',
    leads,
    expected.map(row => row.lead)
  );
  compareExactSet(
    failures,
    'cash-state attempts',
    attempts,
    expected.map(row => row.attempt)
  );
  for (const { lead, attempt } of expected) {
    compareRow(
      failures,
      lead.id,
      leads.find(row => row.id === lead.id),
      lead
    );
    compareRow(
      failures,
      attempt.id,
      attempts.find(row => row.id === attempt.id),
      attempt
    );
  }

  const { subscription, card } = buildConvertedMembershipToSeed();
  const subscriptions = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, subscription.userId));
  const cards = await db
    .select()
    .from(schema.membershipCards)
    .where(eq(schema.membershipCards.userId, card.userId));
  compareExactSet(failures, 'converted member subscriptions', subscriptions, [subscription]);
  compareExactSet(failures, 'converted member cards', cards, [card]);
  compareRow(failures, subscription.id, subscriptions[0], subscription);
  compareRow(failures, card.id, cards[0], card);
  return failures;
}
