import { sql } from 'drizzle-orm';

import { runSequentially } from './in-order';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import type { S8RestrictedSession } from './s8-claim-restricted-rls.fixture';

type AdminDb = S8RestrictedSession['adminDb'];
export type ColumnGrant = readonly [
  privilege: 'select' | 'insert' | 'update',
  table: string,
  columns: readonly string[],
];

/**
 * Grants the restricted test role each column privilege it does not already hold, and returns a
 * cleanup that revokes exactly those. The `test:rls` suites share one role and database, and a
 * column grant left behind makes a later suite's table grant unsafe to revoke, so
 * `grantTablePrivileges` refuses it.
 */
export async function grantColumnPrivileges(
  adminDb: AdminDb,
  grants: readonly ColumnGrant[]
): Promise<() => Promise<void>> {
  const role = quoteIdentifier(TEST_DB_ROLE);
  const wanted = grants.flatMap(([privilege, table, columns]) =>
    columns.map(column => ({ privilege, table, column }))
  );
  const statement = (verb: 'grant' | 'revoke', item: (typeof wanted)[number]) =>
    `${verb} ${item.privilege} (${quoteIdentifier(item.column)}) on table public.${quoteIdentifier(
      item.table
    )} ${verb === 'grant' ? 'to' : 'from'} ${role}`;
  const added: typeof wanted = [];
  const revoke = () =>
    runSequentially(added, async item => {
      await adminDb.execute(sql.raw(statement('revoke', item)));
    });
  try {
    await runSequentially(wanted, async item => {
      const [state] = await adminDb.execute<{ held: boolean }>(sql`
        select has_column_privilege(
          ${TEST_DB_ROLE}, format('public.%I', ${item.table}::text), ${item.column}::text,
          ${item.privilege}::text
        ) as held`);
      if (state?.held) return;
      await adminDb.execute(sql.raw(statement('grant', item)));
      added.push(item);
    });
  } catch (error) {
    await revoke();
    throw error;
  }
  return revoke;
}
