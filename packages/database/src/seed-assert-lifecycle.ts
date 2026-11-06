import { inArray } from 'drizzle-orm';
import { E2E_MEMBERSHIP_LIFECYCLE_FIXTURES } from './e2e-lifecycle-fixtures';
import { E2E_USER_IDS } from './e2e-role-fixtures';
import { buildLifecycleSubscriptionsToSeed } from './seed-golden/lifecycle-memberships';

type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');
type Row = Record<string, unknown>;

const comparable = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

export function compareRow(
  failures: string[],
  label: string,
  actual: Row | undefined,
  expected: Row
) {
  if (!actual) {
    failures.push(`${label}: missing`);
    return;
  }
  for (const [field, value] of Object.entries(expected)) {
    const found = comparable(actual[field] ?? null);
    if (found !== comparable(value)) {
      failures.push(
        `${label}.${field}: expected ${JSON.stringify(comparable(value))}, found ${JSON.stringify(found)}`
      );
    }
  }
}

/**
 * Each lifecycle member owns exactly its seeded subscription and card, field for field, and the
 * member without a subscription owns none. A drifted or extra row fails instead of being tolerated.
 */
export async function collectLifecycleViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const failures: string[] = [];
  const memberIds = Object.values(E2E_MEMBERSHIP_LIFECYCLE_FIXTURES).map(
    fixture => E2E_USER_IDS[fixture.member]
  );
  const subscriptions = await db
    .select()
    .from(schema.subscriptions)
    .where(inArray(schema.subscriptions.userId, memberIds));
  const cards = await db
    .select()
    .from(schema.membershipCards)
    .where(inArray(schema.membershipCards.userId, memberIds));
  const expected = buildLifecycleSubscriptionsToSeed();

  if (subscriptions.length !== expected.length) {
    failures.push(
      `lifecycle subscriptions: expected ${expected.length}, found ${subscriptions.length}`
    );
  }
  if (cards.length !== expected.length) {
    failures.push(`lifecycle cards: expected ${expected.length}, found ${cards.length}`);
  }
  for (const { subscription, card } of expected) {
    compareRow(
      failures,
      subscription.id,
      subscriptions.find(row => row.id === subscription.id),
      subscription
    );
    compareRow(
      failures,
      card.id,
      cards.find(row => row.id === card.id),
      card
    );
  }
  return failures;
}
