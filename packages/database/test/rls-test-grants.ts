import { setTimeout as sleep } from 'node:timers/promises';

import { sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';

import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';

type TestDb = ReturnType<typeof drizzle>;

function isTransientGrantRace(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code === 'XX000' && /tuple concurrently updated/iu.test(cause.message ?? '');
}

async function executeGrantWithRetry(adminDb: TestDb, statement: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await adminDb.execute(sql.raw(statement));
      return;
    } catch (error) {
      if (attempt === 3 || !isTransientGrantRace(error)) throw error;
      await sleep(attempt * 50);
    }
  }
}

export async function grantRlsTestRole(
  adminDb: TestDb,
  tableNames: readonly string[]
): Promise<void> {
  await executeGrantWithRetry(adminDb, `grant usage on schema public to "${TEST_DB_ROLE}"`);
  for (const tableName of tableNames) {
    await executeGrantWithRetry(
      adminDb,
      `grant select on table ${quoteIdentifier(tableName)} to "${TEST_DB_ROLE}"`
    );
  }
  const [{ currentUser }] = await adminDb.execute<{ currentUser: string }>(
    sql`select current_user as "currentUser"`
  );
  await executeGrantWithRetry(
    adminDb,
    `grant "${TEST_DB_ROLE}" to ${quoteIdentifier(currentUser)}`
  );
}
