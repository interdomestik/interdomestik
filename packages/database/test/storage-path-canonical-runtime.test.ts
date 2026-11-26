import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';

import { withDisposableClient } from '../src/disposable-client';
import {
  foreignTenant,
  homeTenant,
  insertClaim,
  restricted,
  seedActors,
} from './claim-correspondence.fixture';
import { provisionE2eRuntimeRole } from './e2e-runtime-role.fixture';
import { migrateJournal, scratchServerMissing } from './pg16/scratch-database';
import { quoteIdentifier } from './rls-test-connection';
import {
  insertPath,
  migrations,
  pathColumn,
  pathViolation,
  tables,
  withStorageScratch,
  type Sql,
  type Table,
} from './storage-path-canonical.test-support';

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

async function readPath(sql: Sql, table: Table, id: string): Promise<string | undefined> {
  const [row] = await sql<{ path: string }[]>`
    select ${sql(pathColumn(table))} as path from public.${sql(table)} where id = ${id}`;
  return row?.path;
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
                await assert.rejects(
                  restricted(runtime, async tx => {
                    await tx`update public.${tx(table)} set ${tx(pathColumn(table))} = 'local/new name.pdf'
                    where id = ${id}`;
                  }),
                  pathViolation(table)
                );
                await restricted(runtime, async tx => {
                  assert.equal(await readPath(tx, table, id), path);
                });
              }
            );
            for (const [phase, proposedPath, updatePath] of [
              ['insert proposal', 'local/invalid proposal.pdf', undefined],
              ['conflict update', 'local/proposal.pdf', 'local/invalid update.pdf'],
            ] as const) {
              await t.test(`${table} rejects a noncanonical upsert ${phase}`, async () => {
                const originalPath = `local/${randomUUID()}.pdf`;
                const id = await restricted(runtime, tx =>
                  insertPath(tx, table, claim, originalPath)
                );
                await assert.rejects(
                  restricted(runtime, tx =>
                    insertPath(tx, table, claim, proposedPath, {
                      id,
                      updatePath: updatePath ?? originalPath,
                    })
                  ),
                  pathViolation(table)
                );
                assert.equal(
                  await restricted(runtime, tx => readPath(tx, table, id)),
                  originalPath
                );
              });
            }
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
