import assert from 'node:assert/strict';

export type UpsertRow = Record<string, unknown>;
export type UpsertWrite = { rows: UpsertRow[]; update: UpsertRow };

/** A seed db stub that records every insert(...).values(...).onConflictDoUpdate(...) call. */
export function createUpsertCaptureDb(): { db: unknown; writes: UpsertWrite[] } {
  const writes: UpsertWrite[] = [];
  const db = {
    insert: () => ({
      values: (rows: UpsertRow | UpsertRow[]) => ({
        onConflictDoUpdate: ({ set }: { set: UpsertRow }): Promise<void> => {
          writes.push({ rows: Array.isArray(rows) ? rows : [rows], update: set });
          return Promise.resolve();
        },
      }),
    }),
  };
  return { db, writes };
}

/** Each expected row is written exactly once per run, with every non-id field in the upsert set. */
export function assertUpsertedOnEachRun(
  writes: readonly UpsertWrite[],
  expectedRows: readonly object[],
  runs: number
): void {
  for (const expected of expectedRows as readonly UpsertRow[]) {
    const matching = writes.filter(write => write.rows.some(row => row.id === expected.id));
    assert.equal(matching.length, runs, `${String(expected.id)} seeded once on each run`);
    for (const write of matching) {
      assert.deepEqual(
        write.rows.find(row => row.id === expected.id),
        expected
      );
      assert.deepEqual(
        Object.keys(write.update).sort(),
        Object.keys(expected)
          .filter(key => key !== 'id')
          .sort()
      );
    }
  }
}
