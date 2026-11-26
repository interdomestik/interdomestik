import type { PgSession } from 'drizzle-orm/pg-core';
import {
  applyReleaseJournal,
  inReleaseTransaction,
  readReleaseJournal,
  releaseConnection,
  withReleaseCleanup,
} from './release-journal-ledger';
import {
  inspectSponsorCheckpoint,
  restoreSponsorCheckpointGrant,
  SponsorCheckpointRefusal,
  sponsorCheckpointGrants,
  verifySponsorCheckpoint,
  type ReleaseSql,
} from './release-sponsor-checkpoint';
import {
  checkpointPosition,
  inspectTarget,
  runSequentially,
  runSponsorSequence,
  sponsorPositions,
  type ApplySponsorRange,
  type CheckpointEvidence,
  type SponsorJournal,
  type SponsorReleaseOptions,
  type Target,
} from './release-sponsor-sequence';

type OwnerClient = Pick<ReleaseSql, 'reserve' | 'options'>;

type Options = SponsorReleaseOptions & {
  migrationsFolder: string;
  // Construct Drizzle over the reserved connection supplied by the runner.
  createMigrationSession: (sql: ReleaseSql) => PgSession;
};

type LockedExpand = SponsorReleaseOptions & {
  sql: ReleaseSql;
  journal: SponsorJournal;
  through: number;
  apply: ApplySponsorRange;
};

type AbandonOptions = Pick<
  Options,
  'migrationsFolder' | 'database' | 'assertClosedTargetAndBaseline' | 'recordCheckpoint'
> & {
  // Read every retained pending reversal ID for this target and grant attempt.
  // Return an empty list only when no intents exist. Propagate read errors.
  readReversalIntents: (target: Target, attemptId: string) => Promise<readonly string[]>;
};

async function withReleaseLock<T>(
  client: OwnerClient,
  work: (sql: ReleaseSql) => Promise<T>
): Promise<T> {
  const reserved = await client.reserve();
  const sql = releaseConnection(reserved, client.options);
  return withReleaseCleanup(
    async () => {
      const [lock] = await sql<{ acquired: boolean }[]>`
        select pg_catalog.pg_try_advisory_lock(673167055, -773281837) as acquired
      `;
      if (!lock?.acquired)
        throw new Error('Another release or ledger inspection is using the target');
      return withReleaseCleanup(
        () => work(sql),
        async () => {
          const [row] = await sql<{ released: boolean }[]>`
            select pg_catalog.pg_advisory_unlock(673167055, -773281837) as released
          `;
          if (!row?.released) throw new Error('Release migration lock was lost');
        },
        'Release migration and lock cleanup both failed'
      );
    },
    () => Promise.resolve(reserved.release()),
    'Release migration and connection release both failed'
  );
}

export function runSponsorReleaseMigrations(
  expand: LockedExpand
): ReturnType<typeof runSponsorSequence>;
export function runSponsorReleaseMigrations(
  client: OwnerClient,
  options: Options
): ReturnType<typeof runSponsorSequence>;
export async function runSponsorReleaseMigrations(
  client: OwnerClient | LockedExpand,
  options?: Options
) {
  if ('journal' in client) {
    // The owner CLI already holds the release lock and rolls back the whole expand on refusal.
    return runSponsorSequence(
      client.sql,
      client,
      client.journal,
      sponsorPositions(client.journal, { allowMissingTrailing: true }),
      client.through,
      () => client.apply,
      async work => {
        try {
          await work(client.sql);
        } catch (error) {
          if (!(error instanceof SponsorCheckpointRefusal)) throw error;
          throw new Error('SPONSOR_CHECKPOINT_REJECTED', { cause: error });
        }
      }
    );
  }
  if (!options) throw new Error('Sponsor release options are required');
  const journal = readReleaseJournal(options.migrationsFolder);
  const positions = sponsorPositions(journal);
  return withReleaseLock(client, sql =>
    runSponsorSequence(
      sql,
      options,
      journal,
      positions,
      journal.length,
      () => {
        const session = options.createMigrationSession(sql);
        return (_from, through) =>
          applyReleaseJournal(session, options.migrationsFolder, journal.slice(0, through));
      },
      work => inReleaseTransaction(sql, work)
    )
  );
}

async function releaseTransactionStatus(sql: ReleaseSql, transactionId: string) {
  const [transaction] = await sql<{ status: string | null }[]>`
    select pg_catalog.pg_xact_status(${transactionId}::text::pg_catalog.xid8) as status
  `;
  return transaction?.status;
}

/** R-12 permits only the additions recorded for the abandoned attempt, while still at 0104. */
export async function abandonSponsorCheckpoint(
  client: OwnerClient,
  options: AbandonOptions,
  attempt: { before: CheckpointEvidence; verified: CheckpointEvidence }
) {
  const journal = readReleaseJournal(options.migrationsFolder);
  const checkpoint = checkpointPosition(journal);
  await withReleaseLock(client, async sql => {
    const target = await inspectTarget(sql, options.database, journal);
    await options.assertClosedTargetAndBaseline(sql, target);
    const { before, verified } = attempt;
    if (
      target.ledger.length !== checkpoint ||
      before.phase !== 'before-checkpoint' ||
      verified.phase !== 'checkpoint-checked' ||
      typeof before.attemptId !== 'string' ||
      !/^[1-9]\d{0,19}$/u.test(before.attemptId) ||
      before.attemptId !== verified.attemptId ||
      [before, verified].some(
        e =>
          e.target.databaseOid !== target.databaseOid ||
          e.target.database !== target.database ||
          e.target.owner !== target.owner ||
          JSON.stringify(e.target.ledger) !== JSON.stringify(target.ledger)
      )
    )
      throw new Error('Abandonment requires the recorded attempt and its verified 0104 ledger');
    // The evidence sink can retain records even if the grant transaction rolled back.
    if ((await releaseTransactionStatus(sql, before.attemptId)) !== 'committed') {
      throw new Error('Abandonment requires a committed checkpoint attempt');
    }
    const priorReversalIds = await options.readReversalIntents(target, before.attemptId);
    let allPriorReversalsAborted = true;
    await runSequentially(priorReversalIds, async reversalId => {
      const status = await releaseTransactionStatus(sql, reversalId);
      if (status === 'committed') throw new Error('Checkpoint attempt was already reversed');
      if (status !== 'aborted') allPriorReversalsAborted = false;
    });
    if (!allPriorReversalsAborted) {
      throw new Error('Cannot verify prior checkpoint reversal rollback');
    }
    verifySponsorCheckpoint(verified.checks, target.owner);
    const receipt = await inReleaseTransaction(sql, async tx => {
      const live = await inspectSponsorCheckpoint(tx);
      if (JSON.stringify(live) !== JSON.stringify(verified.checks)) {
        throw new Error('Current checkpoint ACL differs from the recorded successful attempt');
      }
      await runSequentially(sponsorCheckpointGrants.entries(), ([index, grant]) =>
        restoreSponsorCheckpointGrant(tx, grant, before.checks[index])
      );
      const checks = await inspectSponsorCheckpoint(tx);
      if (JSON.stringify(checks) !== JSON.stringify(before.checks)) {
        throw new Error('Abandonment did not restore the recorded checkpoint ACL');
      }
      const [{ reversalId }] = await tx<{ reversalId: string }[]>`
        select pg_catalog.pg_current_xact_id()::text as "reversalId"
      `;
      const receipt = { attemptId: before.attemptId, reversalId, target, checks };
      // A committed intent consumes the attempt even if publishing its receipt fails.
      await options.recordCheckpoint({ phase: 'checkpoint-reversal-pending', ...receipt });
      const reversalIds = await options.readReversalIntents(target, before.attemptId);
      if (!reversalIds.includes(reversalId)) {
        throw new Error('Checkpoint reversal intent was not durably recorded');
      }
      return receipt;
    });
    if ((await releaseTransactionStatus(sql, receipt.reversalId)) !== 'committed') {
      throw new Error('Cannot verify checkpoint reversal commit');
    }
    await options.recordCheckpoint({ phase: 'checkpoint-reversed', ...receipt });
  });
}
