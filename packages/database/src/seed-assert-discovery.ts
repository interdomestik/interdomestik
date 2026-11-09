import { isDeepStrictEqual } from 'node:util';
import { and, eq, inArray } from 'drizzle-orm';
import { E2E_CASE_FIXTURES } from './e2e-role-fixtures';
import { compareExactSet } from './seed-assert-cash';
import { compareRow } from './seed-assert-lifecycle';
import { buildDiscoverySnapshot } from './seed-golden/discovery';

type Row = Readonly<Record<string, unknown> & { id: string }>;
export type DiscoverySnapshot = Record<
  keyof ReturnType<typeof buildDiscoverySnapshot>,
  readonly Row[]
>;
type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');

/** Compare only builder-owned columns; keep compareRow diagnostics private to avoid content logs. */
function compareExpectedRow(
  failures: string[],
  label: string,
  found: Row | undefined,
  expected: Row
): void {
  if (!found) {
    failures.push(`${label}: missing`);
    return;
  }
  const fields = Object.entries(expected);
  const scalarFields = fields.filter(
    ([, value]) => value === null || typeof value !== 'object' || value instanceof Date
  );
  const scalarFailures: string[] = [];
  compareRow(scalarFailures, label, found, Object.fromEntries(scalarFields));
  const missingColumn = fields.some(([field]) => !Object.hasOwn(found, field));
  const structuredDrift = fields.some(
    ([field, value]) =>
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !isDeepStrictEqual(found[field], value)
  );
  if (missingColumn || scalarFailures.length > 0 || structuredDrift)
    failures.push(`${label}: drifted`);
}

function compareGroup(
  failures: string[],
  label: string,
  found: readonly Row[],
  expected: readonly Row[]
): void {
  // Complete parent-scoped reads include runtime rows; only unexpected seed rows fail membership.
  const golden = found.filter(row => typeof row.id === 'string' && row.id.startsWith('golden_'));
  compareExactSet(
    failures,
    label,
    golden.map(row => ({ id: row.id })),
    expected.map(row => ({ id: row.id }))
  );
  const seen = new Set<string>();
  for (const row of found) {
    if (seen.has(row.id)) failures.push(`${label}: duplicate ${row.id}`);
    seen.add(row.id);
  }
  for (const row of expected)
    compareExpectedRow(
      failures,
      `${label}: ${row.id}`,
      found.find(actual => actual.id === row.id),
      row
    );
}

/** Missing/duplicate/drifted expected rows and unexpected golden_ rows fail, without logging content. */
export function collectDiscoverySnapshotViolations(snapshot: DiscoverySnapshot): string[] {
  const failures: string[] = [];
  const expected = buildDiscoverySnapshot();
  for (const key of Object.keys(expected) as (keyof DiscoverySnapshot)[]) {
    compareGroup(failures, key, snapshot[key], expected[key]);
  }
  return failures;
}

/** Operator/test CLI only: read complete parent sets, never filter by expected child IDs. */
export async function collectDiscoveryViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const expected = buildDiscoverySnapshot();
  const [claimDocuments, documents, sharePacks, claimMessages, notifications] = await Promise.all([
    db
      .select()
      .from(schema.claimDocuments)
      .where(
        inArray(
          schema.claimDocuments.claimId,
          expected.claimDocuments.map(row => row.claimId)
        )
      ),
    db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.entityType, 'claim'),
          inArray(
            schema.documents.entityId,
            expected.documents.map(row => row.entityId)
          )
        )
      ),
    db
      .select()
      .from(schema.sharePacks)
      .where(
        and(
          eq(schema.sharePacks.entityType, 'claim'),
          eq(schema.sharePacks.entityId, E2E_CASE_FIXTURES.KS_ANCHOR.id)
        )
      ),
    db
      .select()
      .from(schema.claimMessages)
      .where(
        inArray(
          schema.claimMessages.claimId,
          expected.claimMessages.map(row => row.claimId)
        )
      ),
    db
      .select()
      .from(schema.notifications)
      .where(
        inArray(
          schema.notifications.userId,
          expected.notifications.map(row => row.userId)
        )
      ),
  ]);
  return collectDiscoverySnapshotViolations({
    claimDocuments,
    documents,
    sharePacks,
    claimMessages,
    notifications,
  });
}
