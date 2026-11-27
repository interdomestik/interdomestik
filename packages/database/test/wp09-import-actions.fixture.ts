import type postgres from 'postgres';

import { END, START, insert, uid, type Scope, type Tx } from './sponsor-test-fixture';
import {
  asPrincipal,
  digest,
  insertRecord,
  staffOf,
  type Records,
  type Table,
} from './wp09-import.fixture';

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

/** A further row of the fixture list, at the given position, with its own identity. */
export function listRow(home: Records, sourceRow: number) {
  const id = uid();
  return {
    ...home.membership_import_rows,
    id,
    source_row: sourceRow,
    stable_identity_key: digest(id),
    email_alias_key: null,
    member_user_id: null,
    member_verified_at: null,
  };
}

/** Fills positions 2 and 3, so the fixture list holds all of its three rows. */
export function completeList(db: postgres.Sql, a: Scope, home: Records) {
  return asPrincipal(db, staffOf(a), async tx => {
    await insertRecord(tx, 'membership_import_rows', listRow(home, 2));
    await insertRecord(tx, 'membership_import_rows', listRow(home, 3));
  });
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
