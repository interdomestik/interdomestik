import { eq } from 'drizzle-orm';
import { E2E_CLAIM_STATES_BRANCH_ID } from './e2e-claim-state-fixtures';
import { compareExactSet } from './seed-assert-cash';
import { compareRow } from './seed-assert-lifecycle';
import { buildClaimStatesToSeed } from './seed-golden/claim-states';

type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');

/**
 * The states branch holds exactly the catalogued claims, field for field, so a reseed cannot leave
 * a drifted lifecycle pair, assignment or owner behind, and no other claim can join KS-D.
 */
export async function collectClaimStateViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const failures: string[] = [];
  const expected = buildClaimStatesToSeed();
  const found = await db
    .select()
    .from(schema.claims)
    .where(eq(schema.claims.branchId, E2E_CLAIM_STATES_BRANCH_ID));
  compareExactSet(failures, 'claim states', found, expected);
  for (const claim of expected) {
    compareRow(
      failures,
      claim.id,
      found.find(row => row.id === claim.id),
      claim
    );
  }
  return failures;
}
