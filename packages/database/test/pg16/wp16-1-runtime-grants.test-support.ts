import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  withDisposableClient,
  withDisposableCleanup,
  type DisposableClient,
} from '../../src/disposable-client';
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
import { runSequentially } from '../in-order';
import { scratchServerMissing, withScratchDatabase, type ScratchClient } from './scratch-database';
import { proveSponsorRuntimeAcl } from './wp16-1-runtime-grants-access';

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
export const journal = readReleaseJournal(migrationsFolder);
export const prefix = journal.findIndex(entry => entry.tag === sponsorCheckpointTag) + 1;
type ReleaseOptions = Parameters<typeof runSponsorReleaseMigrations>[1];
type AbandonOptions = Parameters<typeof abandonSponsorCheckpoint>[1];

export function scratchOptions(database: string) {
  const checkpoint: Parameters<ReleaseOptions['recordCheckpoint']>[0][] = [];
  const acl: Parameters<ReleaseOptions['recordAcl']>[0][] = [];
  const options: ReleaseOptions & AbandonOptions = {
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
    async readReversalIntents(target, attemptId) {
      return checkpoint.flatMap(evidence =>
        evidence.phase === 'checkpoint-reversal-pending' &&
        evidence.target.databaseOid === target.databaseOid &&
        evidence.attemptId === attemptId
          ? [evidence.reversalId]
          : []
      );
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

export async function withGrantsScratch<T>(
  work: (client: ScratchClient, database: string) => Promise<T>
): Promise<T> {
  return withScratchDatabase('wp16_grants', async client => {
    const [row] = await client<{ database: string }[]>`select current_database() as database`;
    return work(client, row.database);
  });
}

export function migrationCause(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause && typeof cause === 'object'
    ? (cause as { code?: string; message?: string })
    : undefined;
}

export async function stageJournal(
  client: ScratchClient,
  path: 'missing' | 'legacy'
): Promise<void> {
  const handle = await client.reserve();
  const sql = releaseConnection(handle, client.options);
  try {
    await applyReleaseJournal(drizzle(sql)._.session, migrationsFolder, journal.slice(0, prefix));
    const grants = path === 'missing' ? sponsorCheckpointGrants.slice(1) : sponsorCheckpointGrants;
    await runSequentially(grants, async ([table, column]) => {
      await sql`grant update (${sql(path === 'legacy' ? 'id' : column)})
        on public.${sql(table)} to ${sql(sponsorRuntimeRole)}`;
    });
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

export async function withGrantsRole(
  t: TestContext,
  work: (maintenance: DisposableClient) => Promise<void>
): Promise<void> {
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
        () => work(maintenance),
        () => maintenance`drop role ${maintenance(sponsorRuntimeRole)}`.then(() => undefined),
        'WP-16.1 proof and scratch role cleanup both failed'
      );
    }
  );
}
