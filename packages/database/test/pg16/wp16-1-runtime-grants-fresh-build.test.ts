import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { optOutTokenHash } from '../../../domain-membership-billing/src/sponsors/roster-crypto';
import { withDisposableClient, withDisposableCleanup } from '../../src/disposable-client';
import {
  applyReleaseJournal,
  readReleaseJournal,
  releaseConnection,
  verifiedReleaseLedger,
} from '../../src/release-journal-ledger';
import { inspectReleaseSponsorAcl } from '../../src/release-sponsor-acl';
import {
  inspectSponsorCheckpoint,
  sponsorCheckpointGrants,
  sponsorCheckpointTag,
  sponsorRuntimeRole,
  verifySponsorCheckpoint,
} from '../../src/release-sponsor-checkpoint';
import {
  abandonSponsorCheckpoint,
  runSponsorReleaseMigrations,
} from '../../src/release-sponsor-migrations';
import { seedSponsorScope, uid } from '../sponsor-seed.test-support';
import { scratchServerMissing, withScratchDatabase, type ScratchClient } from './scratch-database';
import { proveForwardAclRollback } from './wp16-1-runtime-grants-rollback';
import { proveSponsorOptOut } from './wp16-1-runtime-grants-opt-out';
import { proveSponsorRuntimeAcl, proveSponsorRuntimeDenials } from './wp16-1-runtime-grants-access';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const journal = readReleaseJournal(migrationsFolder);
const prefix = journal.findIndex(entry => entry.tag === sponsorCheckpointTag) + 1;
type ReleaseOptions = Parameters<typeof runSponsorReleaseMigrations>[1];

function scratchOptions(database: string) {
  const checkpoint: Parameters<ReleaseOptions['recordCheckpoint']>[0][] = [];
  const acl: Parameters<ReleaseOptions['recordAcl']>[0][] = [];
  const options: ReleaseOptions = {
    migrationsFolder,
    database,
    path: 'fresh',
    createMigrationSession: sql => drizzle(sql)._.session,
    async assertClosedTargetAndBaseline(_sql, { posture, database: actual }) {
      // Vanilla PG16 scratch posture. The release pipeline must supply the approved WP-15 ACL.
      assert.match(actual, /^wp16_grants_[0-9a-f]{12}$/u);
      assert.deepEqual(posture.creatorDefaults, []);
      assert.deepEqual(posture.publicDatabaseAcl, ['CONNECT', 'TEMPORARY']);
      assert.deepEqual(posture.publicSchemaAcl, ['USAGE']);
    },
    async recordCheckpoint(evidence) {
      checkpoint.push(evidence);
    },
    async recordAcl(evidence) {
      acl.push(evidence);
    },
    async attestFinal(sql, { owner }) {
      proveSponsorRuntimeAcl(await inspectReleaseSponsorAcl(sql), owner);
    },
  };
  return { options, checkpoint, acl };
}

async function withGrantsScratch<T>(
  work: (client: ScratchClient, database: string) => Promise<T>
): Promise<T> {
  return withScratchDatabase('wp16_grants', async client => {
    const [row] = await client<{ database: string }[]>`select current_database() as database`;
    return work(client, row.database);
  });
}

function migrationCause(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause && typeof cause === 'object'
    ? (cause as { code?: string; message?: string })
    : undefined;
}

async function stageJournal(client: ScratchClient, path: 'missing' | 'legacy'): Promise<void> {
  const handle = await client.reserve();
  const sql = releaseConnection(handle, client.options);
  try {
    await applyReleaseJournal(drizzle(sql)._.session, migrationsFolder, journal.slice(0, prefix));
    const grants = path === 'missing' ? sponsorCheckpointGrants.slice(1) : sponsorCheckpointGrants;
    for (const [table, column] of grants) {
      await sql`grant update (${sql(path === 'legacy' ? 'id' : column)})
        on public.${sql(table)} to ${sql(sponsorRuntimeRole)}`;
    }
    if (path === 'missing') {
      const [role] = await sql<{ owner: string }[]>`select current_user as owner`;
      const checks = await inspectSponsorCheckpoint(sql);
      assert.throws(
        () => verifySponsorCheckpoint(checks, role.owner),
        /public\.claim\.updatedAt: missing effective UPDATE for 0105/u
      );
      await assert.rejects(
        applyReleaseJournal(drizzle(sql)._.session, migrationsFolder, journal),
        (error: unknown) =>
          migrationCause(error)?.message ===
          'WP-11 requires UPDATE privilege for row locking on public.claim'
      );
      assert.equal((await verifiedReleaseLedger(sql, journal)).length, prefix);
    } else {
      // One replacement was independently present before 0110. Rollback must retain it.
      await sql`grant update ("updatedAt") on public.claim to ${sql(sponsorRuntimeRole)}`;
      await applyReleaseJournal(drizzle(sql)._.session, migrationsFolder, journal.slice(0, -1));
      assert.equal((await verifiedReleaseLedger(sql, journal)).length, journal.length - 1);
    }
  } finally {
    sql.release();
  }
}

function withoutGrantor(acl: Awaited<ReturnType<typeof inspectReleaseSponsorAcl>>) {
  return acl.map(({ relation, effectiveTable, columns }) => ({
    relation,
    effectiveTable,
    columns: columns.map(({ name, effective }) => ({ name, effective })),
  }));
}

test('WP-16.1 release builds and reconciles the PG16 runtime grant journal', async t => {
  const missing = scratchServerMissing('REQUIRE_JOURNAL_SCHEMA_PARITY');
  if (missing) return t.skip(missing);

  await withDisposableClient(
    process.env.DATABASE_URL!,
    { applicationName: 'wp16_grants_role' },
    async maintenance => {
      // Other journal-parity files run serially and must have a role-less cluster. Never drop a
      // pre-existing role. The scratch databases are torn down before removing our cluster role.
      assert.equal(
        (await maintenance`select from pg_roles where rolname = ${sponsorRuntimeRole}`).length,
        0
      );
      await maintenance`create role ${maintenance(sponsorRuntimeRole)} nologin nosuperuser nobypassrls`;
      await withDisposableCleanup(
        async () => {
          await t.test(
            'withholding one column fails preflight and the original 0105 predicate',
            async () => {
              await withGrantsScratch(client => stageJournal(client, 'missing'));
            }
          );

          let freshAcl: ReturnType<typeof withoutGrantor>;
          await t.test(
            'fresh build retries the checkpoint and suffix, then admits restricted operations',
            async () => {
              await withGrantsScratch(async (client, database) => {
                const { options, checkpoint, acl } = scratchOptions(database);
                await assert.rejects(
                  runSponsorReleaseMigrations(client, {
                    ...options,
                    async recordCheckpoint(evidence) {
                      if (evidence.phase === 'checkpoint-checked')
                        throw new Error('injected checkpoint recording failure');
                    },
                  }),
                  /injected checkpoint recording failure/u
                );
                await client`create table public.notification_deliveries (test_blocker int)`;
                await assert.rejects(
                  runSponsorReleaseMigrations(client, options),
                  (error: unknown) => migrationCause(error)?.code === '42P07'
                );
                await client`drop table public.notification_deliveries`;
                const [before, verified] = checkpoint;
                assert.equal(before.checks.filter(row => row.direct.length > 0).length, 0);
                await assert.rejects(
                  runSponsorReleaseMigrations(client, {
                    ...options,
                    async recordAcl({ phase, target }) {
                      if (phase === 'before-trailing') {
                        assert.equal(target.ledger.length, journal.length - 1);
                        throw new Error('pre-0110 recording failed');
                      }
                    },
                  }),
                  /pre-0110 recording failed/u
                );
                const [, , retryBefore, retryVerified] = checkpoint;
                assert.notEqual(retryBefore.attemptId, before.attemptId);
                assert.deepEqual(retryBefore.checks, verified.checks);
                assert.deepEqual(retryVerified.checks, verified.checks);
                const finished = await runSponsorReleaseMigrations(client, options);
                assert.equal(checkpoint.length, 4);
                assert.deepEqual(finished.ledger.slice(0, prefix), before.target.ledger);
                assert.equal(finished.ledger.length, journal.length);
                const final = acl.find(entry => entry.phase === 'after-trailing');
                assert.ok(final);
                freshAcl = withoutGrantor(final.acl);
                const token = uid();
                const a = await seedSponsorScope(client, undefined, optOutTokenHash(token));
                const b = await seedSponsorScope(client);
                await proveSponsorRuntimeDenials(client, a, b);
                await proveSponsorOptOut(client, database, a, b, token);
              });
            }
          );

          await t.test(
            'abandoning a closed 0104 target restores only the attempt ACL delta',
            async () => {
              await withGrantsScratch(async (client, database) => {
                const { options, checkpoint } = scratchOptions(database);
                await assert.rejects(
                  runSponsorReleaseMigrations(client, {
                    ...options,
                    async recordCheckpoint(evidence) {
                      await options.recordCheckpoint(evidence);
                      if (evidence.phase === 'checkpoint-checked')
                        throw new Error('abort checkpoint after recording');
                    },
                  }),
                  /abort checkpoint after recording/u
                );
                await client`grant update ("updatedAt") on public.claim to ${client(sponsorRuntimeRole)}`;
                await client`create table public.notification_deliveries (test_blocker int)`;
                for (let attempt = 0; attempt < 2; attempt += 1) {
                  await assert.rejects(
                    runSponsorReleaseMigrations(client, options),
                    (error: unknown) => migrationCause(error)?.code === '42P07'
                  );
                }
                const [abortedBefore, abortedChecked, before, verified, retryBefore, retryChecked] =
                  checkpoint;
                assert.equal(before.attemptId, verified.attemptId);
                assert.notEqual(verified.attemptId, retryChecked.attemptId);
                assert.deepEqual(retryBefore.checks, verified.checks);
                assert.deepEqual(retryChecked.checks, verified.checks);
                assert.deepEqual(abortedChecked.checks, verified.checks);
                assert.deepEqual(
                  before.checks.filter(row => row.direct.length),
                  [before.checks[0]]
                );
                assert.equal(before.checks[0].relation, 'claim');
                await assert.rejects(
                  abandonSponsorCheckpoint(client, options, {
                    before: abortedBefore,
                    verified: abortedChecked,
                  }),
                  /requires a committed checkpoint attempt/u
                );
                await assert.rejects(
                  abandonSponsorCheckpoint(client, options, { before, verified: retryChecked }),
                  /requires the recorded attempt and its verified 0104 ledger/u
                );
                await abandonSponsorCheckpoint(client, options, { before, verified });
                const reversed = checkpoint.at(-1);
                assert.ok(reversed);
                assert.equal(reversed.phase, 'checkpoint-reversed');
                assert.equal(reversed.attemptId, before.attemptId);
                assert.deepEqual(reversed.checks, before.checks);
                assert.deepEqual(reversed.target.ledger, before.target.ledger);
              });
            }
          );

          await t.test('fresh rollback preserves the 0106 guard and ACL', async () => {
            await withGrantsScratch(async (client, database) => {
              const { options, acl } = scratchOptions(database);
              const finished = await runSponsorReleaseMigrations(client, options);
              const [, before, after] = acl;
              assert.equal(before.phase, 'before-trailing');
              assert.equal(after.phase, 'after-trailing');
              assert.deepEqual(before.target.ledger, finished.ledger.slice(0, -1));
              assert.deepEqual(after.target.ledger, finished.ledger);
              await proveForwardAclRollback(client, migrationsFolder, before.acl, after.acl);
            });
          });

          await t.test(
            'verified legacy prefix converges on all checkpoint and sponsor relations',
            async () => {
              await withGrantsScratch(async (client, database) => {
                await stageJournal(client, 'legacy');
                const { options, acl, checkpoint } = scratchOptions(database);
                const finished = await runSponsorReleaseMigrations(client, {
                  ...options,
                  path: 'forward',
                });
                assert.deepEqual(finished.ledger.slice(0, -1), acl[0].target.ledger);
                assert.deepEqual(checkpoint, []);
                assert.deepEqual(withoutGrantor(acl[1].acl), freshAcl);
                await proveForwardAclRollback(client, migrationsFolder, acl[0].acl, acl[1].acl);
              });
            }
          );
        },
        () => maintenance`drop role ${maintenance(sponsorRuntimeRole)}`.then(() => undefined),
        'WP-16.1 proof and scratch role cleanup both failed'
      );
    }
  );
});
