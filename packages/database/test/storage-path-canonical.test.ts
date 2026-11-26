import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { withDisposableClient } from '../src/disposable-client';
import {
  documentInput,
  foreignTenant,
  homeTenant,
  insertClaim,
  insertDocument,
  restricted,
  seedActors,
  type Case,
} from './claim-correspondence.fixture';
import { provisionE2eRuntimeRole } from './e2e-runtime-role.fixture';
import { migrateJournalThrough } from './journal-prefix.support';
import {
  migrateJournal,
  scratchServerMissing,
  withScratchDatabase,
  type ScratchClient,
} from './pg16/scratch-database';
import { quoteIdentifier } from './rls-test-connection';

// PostgreSQL rejects NUL in text before evaluating a CHECK.
const canonicalKeys = ['AbZ09_-', '.hidden', 'a.b', 'a.', 'nested/A9_b-c/file.PDF'];
const invalidKeys = [
  ['empty key', ''],
  ['leading slash', '/root'],
  ['trailing slash', 'root/'],
  ['empty interior segment', 'root//leaf'],
  ['single dot key', '.'],
  ['single dot segment', 'root/./leaf'],
  ['double dot segment', 'root/../leaf'],
  ['embedded double dot', 'root/a..b'],
  ['backslash', 'root/a\\b'],
  ['percent escape', 'root/file%20name'],
  ['mixed-case escape', 'root/%2f%2F'],
  ['malformed escape', 'root/%2G'],
  ['bare percent', 'root/file%'],
  ['question mark', 'root/file?name'],
  ['hash', 'root/file#name'],
  ['space', 'root/file name'],
  ['tab', 'root/file\tname'],
  ['carriage return', 'root/file\rname'],
  ['line feed', 'root/file\nname'],
  ['terminal line feed', 'root/file\n'],
  ['DEL', 'root/file\u007f'],
  ['non-ASCII', 'root/文.pdf'],
  ['composed Unicode', 'root/caf\u00e9'],
  ['decomposed Unicode', 'root/cafe\u0301'],
  ['exclamation mark', 'root/file!'],
  ['tilde', 'root/file~'],
  ['apostrophe', "root/file'"],
  ['opening parenthesis', 'root/file('],
  ['closing parenthesis', 'root/file)'],
] as const;

const migrations = fileURLToPath(new URL('../drizzle/', import.meta.url));
const constraints = {
  claim_documents: 'claim_documents_file_path_canonical_ck',
  documents: 'documents_storage_path_canonical_ck',
} as const;
const tables = ['claim_documents', 'documents'] as const;
type Table = (typeof tables)[number];
type Sql = Parameters<typeof insertDocument>[0];

async function insertPath(sql: Sql, table: Table, claim: Case, path: string) {
  const id = randomUUID();
  if (table === 'claim_documents') {
    await insertDocument(sql, documentInput(claim, id, path));
  } else {
    await sql`insert into public.documents
      (id, tenant_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, uploaded_by)
      values (${id}, ${claim.tenant}, 'claim', ${claim.id}, 'Display name.pdf',
              'application/pdf', 120, ${path}, ${claim.user})`;
  }
  return id;
}

async function readPath(sql: Sql, table: Table, id: string): Promise<string | undefined> {
  const column = table === 'claim_documents' ? 'file_path' : 'storage_path';
  const [row] = await sql<{ path: string }[]>`
    select ${sql(column)} as path from public.${sql(table)} where id = ${id}`;
  return row?.path;
}

function pathViolation(table: Table) {
  return { code: '23514', constraint_name: constraints[table] };
}

async function assertRestrictedRole(tx: Sql, role: string, table: Table) {
  const relation = `public.${table}`;
  const [posture] = await tx`
    select current_user::text as effective_role,
           session_user::text as login_role,
           r.rolsuper as superuser,
           r.rolbypassrls as bypass_rls,
           pg_has_role(current_user, c.relowner, 'MEMBER') as owner_member,
           row_security_active(c.oid) as rls_active,
           has_table_privilege(current_user, c.oid, 'SELECT') as can_select,
           has_table_privilege(current_user, c.oid, 'INSERT') as can_insert,
           has_table_privilege(current_user, c.oid, 'UPDATE') as can_update,
           current_setting('app.current_tenant_id') as tenant
    from pg_roles r cross join pg_class c
    where r.rolname = current_user and c.oid = ${relation}::regclass`;
  assert.deepEqual(
    { ...posture },
    {
      effective_role: role,
      login_role: role,
      superuser: false,
      bypass_rls: false,
      owner_member: false,
      rls_active: true,
      can_select: true,
      can_insert: true,
      can_update: true,
      tenant: homeTenant,
    }
  );
}

async function withStorageScratch(name: string, proof: (admin: ScratchClient) => Promise<void>) {
  await withScratchDatabase(name, async admin => {
    const [version] = await admin`show server_version_num`;
    assert.equal(Math.floor(Number(version.server_version_num) / 10_000), 16, 'requires PG16');
    await proof(admin);
  });
}

test('storage paths under the restricted runtime role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withStorageScratch('storage_paths', async admin => {
    await migrateJournal(admin, migrations);
    await seedActors(admin);
    const claim = await insertClaim(admin);
    const foreignClaim = await insertClaim(admin, { tenant: foreignTenant });
    const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(process.env.DATABASE_URL!);
    scratchUrl.pathname = `/${name}`;
    const role = `interdomestik_e2e_runtime_sp${randomBytes(6).toString('hex')}`;

    try {
      const runtimeUrl = await provisionE2eRuntimeRole({
        adminUrl: scratchUrl.toString(),
        env: {},
        role,
      });
      await withDisposableClient(
        runtimeUrl,
        { applicationName: 'storage_path_runtime' },
        async runtime => {
          for (const table of tables) {
            await restricted(runtime, tx => assertRestrictedRole(tx, role, table));
            await t.test(`${table} accepts and reads exact canonical keys`, async () => {
              await restricted(runtime, async tx => {
                for (const path of canonicalKeys) {
                  const id = await insertPath(tx, table, claim, path);
                  assert.equal(await readPath(tx, table, id), path);
                }
              });
            });
            for (const [label, path] of invalidKeys) {
              await t.test(`${table} rejects ${label}`, async () => {
                await assert.rejects(
                  restricted(runtime, tx => insertPath(tx, table, claim, path)),
                  pathViolation(table)
                );
              });
            }
            await t.test(
              `${table} rejects a noncanonical update and preserves the original`,
              async () => {
                const path = 'local/original.pdf';
                const id = await restricted(runtime, tx => insertPath(tx, table, claim, path));
                const column = table === 'claim_documents' ? 'file_path' : 'storage_path';
                await assert.rejects(
                  restricted(runtime, async tx => {
                    await tx`update public.${tx(table)} set ${tx(column)} = 'local/new name.pdf'
                    where id = ${id}`;
                  }),
                  pathViolation(table)
                );
                await restricted(runtime, async tx => {
                  assert.equal(await readPath(tx, table, id), path);
                });
              }
            );
            await t.test(`${table} denies valid coordinates in another tenant`, async () => {
              const path = `foreign/${randomUUID()}.pdf`;
              const id = await insertPath(admin, table, foreignClaim, path);
              await assert.rejects(
                restricted(runtime, tx =>
                  insertPath(tx, table, foreignClaim, 'foreign/denied.pdf')
                ),
                { code: '42501', message: /row-level security policy/ }
              );
              await restricted(runtime, async tx => {
                assert.equal(await readPath(tx, table, id), undefined);
              });
            });
          }

          await t.test('claim_documents keeps the coordinate freeze on updates', async () => {
            const path = 'local/frozen.pdf';
            const id = await restricted(runtime, tx =>
              insertPath(tx, 'claim_documents', claim, path)
            );
            await assert.rejects(
              restricted(runtime, async tx => {
                await tx`update public.claim_documents set file_path = 'local/new.pdf' where id = ${id}`;
              }),
              { code: 'P1203', message: 'Case document storage coordinates cannot change' }
            );
            await restricted(runtime, async tx => {
              assert.equal(await readPath(tx, 'claim_documents', id), path);
            });
          });
        }
      );
    } finally {
      const [exists] = await admin`select 1 from pg_roles where rolname = ${role}`;
      if (exists) {
        const identifier = quoteIdentifier(role);
        await admin.unsafe(`drop owned by ${identifier}`);
        await admin.unsafe(`drop role ${identifier}`);
      }
    }
  });
});

async function beforeStorageChecks(admin: ScratchClient) {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
  );
  const index = journal.entries.findIndex(entry => entry.tag.endsWith('_storage_path_canonical'));
  assert.ok(index > 0, 'storage-check migration follows its journal predecessor');
  await migrateJournalThrough(admin, migrations, journal.entries[index - 1].tag);
  await seedActors(admin);
  return insertClaim(admin);
}

async function snapshot(admin: ScratchClient) {
  return await admin`
    select 'claim_documents' as source, xmin::text as row_version, to_jsonb(c) as row
    from public.claim_documents c
    union all
    select 'documents', xmin::text, to_jsonb(d) from public.documents d
    order by source`;
}

test('storage path migration preserves populated canonical rows', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withStorageScratch('storage_paths_cutover', async admin => {
    const claim = await beforeStorageChecks(admin);
    await insertPath(admin, 'claim_documents', claim, 'legacy/.hidden/AbZ09_-');
    await insertPath(admin, 'documents', claim, 'legacy/A.b/policy.');
    const before = await snapshot(admin);
    assert.equal(before.length, 2);
    await migrateJournal(admin, migrations);
    assert.deepEqual(await snapshot(admin), before);
    const checks = await admin`
      select conname::text as name from pg_constraint
      where convalidated and contype = 'c'
        and conname in ${admin(Object.values(constraints))}
      order by conname`;
    assert.deepEqual(
      checks.map(row => row.name),
      Object.values(constraints)
    );
  });
});

for (const table of tables) {
  test(`storage path migration rolls back when ${table} holds an incompatible row`, async t => {
    const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
    if (missing) return t.skip(missing);
    await withStorageScratch('storage_paths_refusal', async admin => {
      const claim = await beforeStorageChecks(admin);
      await insertPath(
        admin,
        'claim_documents',
        claim,
        table === 'claim_documents' ? '/legacy' : 'legacy/claim'
      );
      await insertPath(
        admin,
        'documents',
        claim,
        table === 'documents' ? '/legacy' : 'legacy/document'
      );
      const before = await snapshot(admin);
      const beforeJournal =
        await admin`select count(*)::int as size from drizzle.__drizzle_migrations`;
      await assert.rejects(migrateJournal(admin, migrations), error => {
        assert.ok(error instanceof Error);
        assert.partialDeepStrictEqual(error.cause ?? error, pathViolation(table));
        return true;
      });
      assert.deepEqual(await snapshot(admin), before);
      assert.deepEqual(
        await admin`select count(*)::int as size from drizzle.__drizzle_migrations`,
        beforeJournal
      );
      assert.deepEqual(
        await admin`
        select conname from pg_constraint where conname in ${admin(Object.values(constraints))}`,
        []
      );
    });
  });
}
