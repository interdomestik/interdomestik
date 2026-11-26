import type { PgSession } from 'drizzle-orm/pg-core';
import {
  applyReleaseJournal,
  inReleaseTransaction,
  readReleaseJournal,
  releaseConnection,
  verifiedReleaseLedger,
  withReleaseCleanup,
} from './release-journal-ledger';
import { inspectReleaseRuntime } from './release-runtime-posture';
import { inspectReleaseSponsorAcl } from './release-sponsor-acl';
import {
  inspectSponsorCheckpoint,
  sponsorCheckpointGrants,
  sponsorCheckpointTag,
  sponsorRuntimeRole,
  verifySponsorCheckpoint,
  type CheckpointCheck,
  type ReleaseSql,
} from './release-sponsor-checkpoint';

type Target = {
  owner: string;
  database: string;
  databaseOid: string;
  ledger: Awaited<ReturnType<typeof verifiedReleaseLedger>>;
  posture: Awaited<ReturnType<typeof inspectReleaseRuntime>>;
};
type CheckpointEvidence = {
  attemptId: string;
  target: Target;
  checks: CheckpointCheck[];
} & (
  | { phase: 'before-checkpoint' | 'checkpoint-checked' }
  | { phase: 'checkpoint-reversal-pending' | 'checkpoint-reversed'; reversalId: string }
);

type OwnerClient = Pick<ReleaseSql, 'reserve' | 'options'>;

type Options = {
  migrationsFolder: string;
  database: string;
  path: 'fresh' | 'forward';
  // Construct Drizzle over the reserved connection supplied by the runner.
  createMigrationSession: (sql: ReleaseSql) => PgSession;
  // The WP-15 release step owns the approved baseline and the closed-target receipt.
  assertClosedTargetAndBaseline: (sql: ReleaseSql, target: Target) => Promise<void>;
  recordCheckpoint: (evidence: CheckpointEvidence) => Promise<void>;
  recordAcl: (evidence: {
    phase: 'before-checkpoint' | 'before-trailing' | 'after-trailing';
    target: Target;
    acl: Awaited<ReturnType<typeof inspectReleaseSponsorAcl>>;
  }) => Promise<void>;
  attestFinal: (sql: ReleaseSql, target: Target) => Promise<void>;
};
type AbandonOptions = Pick<
  Options,
  'migrationsFolder' | 'database' | 'assertClosedTargetAndBaseline' | 'recordCheckpoint'
> & {
  // Read every retained pending reversal ID for this target and grant attempt.
  // Return an empty list only when no intents exist. Propagate read errors.
  readReversalIntents: (target: Target, attemptId: string) => Promise<readonly string[]>;
};

async function inspectTarget(
  sql: ReleaseSql,
  database: string,
  journal: ReturnType<typeof readReleaseJournal>
): Promise<Target> {
  const [actual] = await sql<{ database: string; oid: string }[]>`
    select datname as database, oid::text from pg_database where datname = current_database()
  `;
  if (actual?.database !== database) throw new Error('Unexpected release database');
  const posture = await inspectReleaseRuntime(sql);
  return {
    owner: posture.owner,
    database,
    databaseOid: actual.oid,
    posture,
    ledger: await verifiedReleaseLedger(sql, journal),
  };
}

function checkpointPosition(journal: ReturnType<typeof readReleaseJournal>) {
  const checkpoint = journal.findIndex(entry => entry.tag === sponsorCheckpointTag) + 1;
  if (!checkpoint || journal[checkpoint]?.tag !== '0105_wp11_notification_deliveries') {
    throw new Error('Release journal checkpoint is missing or out of order');
  }

  return checkpoint;
}

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
    async () => reserved.release(),
    'Release migration and connection release both failed'
  );
}

export async function runSponsorReleaseMigrations(client: OwnerClient, options: Options) {
  const journal = readReleaseJournal(options.migrationsFolder);
  const checkpoint = checkpointPosition(journal);
  const trailing = journal.findIndex(entry => entry.tag === '0110_wp16_1_sponsor_runtime_grants');
  if (trailing <= checkpoint)
    throw new Error('Sponsor grants migration is missing or out of order');
  return withReleaseLock(client, async sql => {
    let target = await inspectTarget(sql, options.database, journal);
    await options.assertClosedTargetAndBaseline(sql, target);
    const applied = target.ledger.length;
    const session = options.createMigrationSession(sql);
    if (options.path === 'fresh' && applied === 0) {
      const existing = await sql`select oid from pg_class
        where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm', 'f', 'S')`;
      if (existing.length)
        throw new Error('Fresh target has public relations but no applied ledger');
      await applyReleaseJournal(session, options.migrationsFolder, journal.slice(0, checkpoint));
      target = await inspectTarget(sql, options.database, journal);
      if (target.ledger.length !== checkpoint) throw new Error('Release prefix did not reach 0104');
    } else if (applied < checkpoint || (applied === checkpoint && options.path !== 'fresh')) {
      throw new Error('Ledger is outside the approved checkpoint or forward migration states');
    }

    if (target.ledger.length === checkpoint) {
      await options.recordAcl({
        phase: 'before-checkpoint',
        target,
        acl: await inspectReleaseSponsorAcl(sql),
      });
      await inReleaseTransaction(sql, async tx => {
        const [{ attemptId }] = await tx<{ attemptId: string }[]>`
          select pg_catalog.pg_current_xact_id()::text as "attemptId"
        `;
        const before = await inspectSponsorCheckpoint(tx);
        await options.recordCheckpoint({
          phase: 'before-checkpoint',
          attemptId,
          target,
          checks: before,
        });
        for (const [table, column] of sponsorCheckpointGrants) {
          await tx`grant update (${tx(column)}) on public.${tx(table)} to ${tx(sponsorRuntimeRole)}`;
        }
        const checks = await inspectSponsorCheckpoint(tx);
        await options.recordCheckpoint({ phase: 'checkpoint-checked', attemptId, target, checks });
        verifySponsorCheckpoint(checks, target.owner);
      });
    }

    if (target.ledger.length <= trailing) {
      if (target.ledger.length < trailing) {
        await applyReleaseJournal(session, options.migrationsFolder, journal.slice(0, trailing));
        target = await inspectTarget(sql, options.database, journal);
      }
      if (target.ledger.length !== trailing)
        throw new Error('Release ledger is incomplete before sponsor grants');
      await options.recordAcl({
        phase: 'before-trailing',
        target,
        acl: await inspectReleaseSponsorAcl(sql),
      });
      await applyReleaseJournal(session, options.migrationsFolder, journal.slice(0, trailing + 1));
      target = await inspectTarget(sql, options.database, journal);
      if (target.ledger.length !== trailing + 1)
        throw new Error('Sponsor grants migration did not apply');
    }
    if (target.ledger.length === trailing + 1) {
      await options.recordAcl({
        phase: 'after-trailing',
        target,
        acl: await inspectReleaseSponsorAcl(sql),
      });
    }
    if (target.ledger.length < journal.length) {
      await applyReleaseJournal(session, options.migrationsFolder, journal);
      target = await inspectTarget(sql, options.database, journal);
    }
    if (target.ledger.length !== journal.length) throw new Error('Release journal is incomplete');
    await options.attestFinal(sql, target);
    return target;
  });
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
    for (const reversalId of priorReversalIds) {
      const status = await releaseTransactionStatus(sql, reversalId);
      if (status === 'committed') throw new Error('Checkpoint attempt was already reversed');
      if (status !== 'aborted') allPriorReversalsAborted = false;
    }
    if (!allPriorReversalsAborted) {
      throw new Error('Cannot verify prior checkpoint reversal rollback');
    }
    verifySponsorCheckpoint(verified.checks, target.owner);
    const receipt = await inReleaseTransaction(sql, async tx => {
      const live = await inspectSponsorCheckpoint(tx);
      if (JSON.stringify(live) !== JSON.stringify(verified.checks)) {
        throw new Error('Current checkpoint ACL differs from the recorded successful attempt');
      }
      for (const [index, [table, column]] of sponsorCheckpointGrants.entries()) {
        const preimage = before.checks[index];
        if (
          !preimage ||
          preimage.relation !== table ||
          preimage.column !== column ||
          preimage.unexpectedEffective ||
          preimage.direct.length > 1
        ) {
          throw new Error('Invalid checkpoint preimage');
        }
        if (preimage.direct.length === 0) {
          await tx`revoke update (${tx(column)}) on public.${tx(table)}
            from ${tx(sponsorRuntimeRole)} restrict`;
        }
      }
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
