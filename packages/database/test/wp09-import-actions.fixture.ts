import type postgres from 'postgres';

import { runSequentially } from './in-order';
import { END, START, insert, uid, type Tx } from './sponsor-test-fixture';
import { digest, insertRecord, type Records, type Table } from './wp09-import.fixture';

export function visibleIds(tx: Tx, table: Table) {
  return tx<{ id: string }[]>`select id from ${tx(table)} order by id`;
}

export function decide(
  tx: Tx,
  listId: string,
  actor: string,
  listDigest: string,
  decision = 'approved'
) {
  return tx`
    update membership_import_lists
    set decision = ${decision}, decided_by = ${actor}, decided_at = ${END},
        decided_digest = ${listDigest}
    where id = ${listId} returning decision
  `;
}

/** A row of the fixture's list shape, at the given position, with its own identity. */
export function listRow(
  home: Records,
  sourceRow: number,
  listId = home.membership_import_lists.id
) {
  const id = uid();
  return {
    ...home.membership_import_rows,
    id,
    list_id: listId,
    source_row: sourceRow,
    email_alias_key: digest(id),
    member_user_id: null,
    member_verified_at: null,
  };
}

/** A new pending list of the fixture's shape, with its own upload identity and digest. */
export function freshList(home: Records, rowCount: number) {
  const id = uid();
  return {
    ...home.membership_import_lists,
    id,
    upload_key: id,
    row_count: rowCount,
    digest: digest(id),
    employer_approved_digest: digest(id),
  };
}

/** Inserts a complete new list with its rows on the caller's transaction (assigned staff). */
export async function insertCompleteList(tx: Tx, home: Records, rowCount: number) {
  const list = freshList(home, rowCount);
  await insertRecord(tx, 'membership_import_lists', list);
  const rows = Array.from({ length: rowCount }, (_, index) => listRow(home, index + 1, list.id));
  await runSequentially(rows, row => insertRecord(tx, 'membership_import_rows', row));
  return { list, rows };
}

export async function insertUser(db: postgres.Sql, tenantId: string): Promise<string> {
  const id = uid();
  await insert(db, 'user', {
    id,
    tenant_id: tenantId,
    name: 'Test',
    email: `${id}@example.test`,
    emailVerified: false,
    createdAt: START,
    updatedAt: START,
  });
  return id;
}
