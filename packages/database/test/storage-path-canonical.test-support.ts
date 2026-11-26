import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

import { documentInput, type Case } from './claim-correspondence.fixture';
import { withScratchDatabase, type ScratchClient } from './pg16/scratch-database';

export const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));
export const constraints = {
  claim_documents: 'claim_documents_file_path_canonical_ck',
  documents: 'documents_storage_path_canonical_ck',
} as const;
export const tables = ['claim_documents', 'documents'] as const;
export type Table = (typeof tables)[number];
export type Sql = postgres.Sql | postgres.TransactionSql;

export function pathColumn(table: Table) {
  return table === 'claim_documents' ? 'file_path' : 'storage_path';
}

export async function insertPath(
  sql: Sql,
  table: Table,
  claim: Case,
  path: string,
  conflict?: { id: string; updatePath: string }
) {
  const id = conflict?.id ?? randomUUID();
  const row =
    table === 'claim_documents'
      ? documentInput(claim, id, path)
      : {
          id,
          tenant_id: claim.tenant,
          entity_type: 'claim',
          entity_id: claim.id,
          file_name: 'Display name.pdf',
          mime_type: 'application/pdf',
          file_size: 120,
          storage_path: path,
          uploaded_by: claim.user,
        };
  const onConflict = conflict
    ? sql`on conflict (id) do update set ${sql(pathColumn(table))} = ${conflict.updatePath}`
    : sql``;
  await sql`insert into public.${sql(table)} ${sql(row)} ${onConflict}`;
  return id;
}

export function pathViolation(table: Table) {
  return (error: unknown) => {
    assert.ok(error instanceof Error);
    const cause = error.cause ?? error;
    assert.ok(cause instanceof postgres.PostgresError);
    assert.equal(cause.code, '23514');
    assert.equal(cause.constraint_name, constraints[table]);
    return true;
  };
}

export async function withStorageScratch(
  name: string,
  proof: (admin: ScratchClient) => Promise<void>
) {
  await withScratchDatabase(name, async admin => {
    const [version] = await admin`show server_version_num`;
    assert.equal(Math.floor(Number(version.server_version_num) / 10_000), 16, 'requires PG16');
    await proof(admin);
  });
}
