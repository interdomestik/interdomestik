import type { MigrationMeta } from 'drizzle-orm/migrator';
import { verifiedReleaseLedger } from './release-journal-ledger';
import { inspectReleaseRuntime } from './release-runtime-posture';
import { inspectReleaseSponsorAcl } from './release-sponsor-acl';
import {
  inspectSponsorCheckpoint,
  sponsorCheckpointGrants,
  sponsorCheckpointTag,
  sponsorPrerequisiteTag,
  sponsorRuntimeRole,
  sponsorTrailingTag,
  verifySponsorCheckpoint,
  type CheckpointCheck,
  type ReleaseSql,
} from './release-sponsor-checkpoint';

export type SponsorJournal = readonly (Pick<MigrationMeta, 'hash' | 'folderMillis'> & {
  tag: string;
})[];
export type ApplySponsorRange = (from: number, through: number) => Promise<void>;

export type Target = {
  owner: string;
  database: string;
  databaseOid: string;
  ledger: Awaited<ReturnType<typeof verifiedReleaseLedger>>;
  posture: Awaited<ReturnType<typeof inspectReleaseRuntime>>;
};
export type CheckpointEvidence = {
  attemptId: string;
  target: Target;
  checks: CheckpointCheck[];
} & (
  | { phase: 'before-checkpoint' | 'checkpoint-checked' }
  | { phase: 'checkpoint-reversal-pending' | 'checkpoint-reversed'; reversalId: string }
);

export type SponsorReleaseOptions = {
  database: string;
  path: 'fresh' | 'forward';
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

export async function inspectTarget(
  sql: ReleaseSql,
  database: string,
  journal: SponsorJournal
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

export function checkpointPosition(journal: SponsorJournal) {
  const checkpoint = journal.findIndex(entry => entry.tag === sponsorCheckpointTag) + 1;
  if (!checkpoint || journal[checkpoint]?.tag !== sponsorPrerequisiteTag) {
    throw new Error('Release journal checkpoint is missing or out of order');
  }

  return checkpoint;
}

export function sponsorPositions(journal: SponsorJournal) {
  const checkpoint = checkpointPosition(journal);
  const trailing = journal.findIndex(entry => entry.tag === sponsorTrailingTag);
  if (trailing <= checkpoint)
    throw new Error('Sponsor grants migration is missing or out of order');
  return { checkpoint, trailing };
}

export function runSequentially<T>(items: Iterable<T>, run: (item: T) => Promise<void>) {
  const iterator = items[Symbol.iterator]();
  function next(): Promise<void> {
    const item = iterator.next();
    return item.done ? Promise.resolve() : run(item.value).then(next);
  }
  return next();
}

export async function runSponsorSequence(
  sql: ReleaseSql,
  options: SponsorReleaseOptions,
  journal: SponsorJournal,
  { checkpoint, trailing }: ReturnType<typeof sponsorPositions>,
  through: number,
  prepare: () => ApplySponsorRange,
  checkpointTransaction: (work: (tx: ReleaseSql) => Promise<void>) => Promise<void>
) {
  if (through <= checkpoint) throw new Error('Expand stops before the sponsor checkpoint can run');

  let target = await inspectTarget(sql, options.database, journal);
  await options.assertClosedTargetAndBaseline(sql, target);
  const applied = target.ledger.length;
  const apply = prepare();
  const recordAcl = async (phase: Parameters<SponsorReleaseOptions['recordAcl']>[0]['phase']) => {
    await options.recordAcl({ phase, target, acl: await inspectReleaseSponsorAcl(sql) });
  };
  if (options.path === 'fresh' && applied === 0) {
    const existing = await sql`select oid from pg_class
      where relnamespace = 'public'::regnamespace and relkind in ('r', 'p', 'v', 'm', 'f', 'S')`;
    if (existing.length) throw new Error('Fresh target has public relations but no applied ledger');
    await apply(0, checkpoint);
    target = await inspectTarget(sql, options.database, journal);
    if (target.ledger.length !== checkpoint) throw new Error('Release prefix did not reach 0104');
  } else if (applied < checkpoint || (applied === checkpoint && options.path !== 'fresh')) {
    throw new Error('Ledger is outside the approved checkpoint or forward migration states');
  }

  if (target.ledger.length === checkpoint) {
    await recordAcl('before-checkpoint');
    await checkpointTransaction(async tx => {
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
      await runSequentially(sponsorCheckpointGrants, async ([table, column]) => {
        await tx`grant update (${tx(column)}) on public.${tx(table)} to ${tx(sponsorRuntimeRole)}`;
      });
      const checks = await inspectSponsorCheckpoint(tx);
      await options.recordCheckpoint({ phase: 'checkpoint-checked', attemptId, target, checks });
      verifySponsorCheckpoint(checks, target.owner);
    });
  }

  if (through > trailing && target.ledger.length <= trailing) {
    if (target.ledger.length < trailing) {
      await apply(target.ledger.length, trailing);
      target = await inspectTarget(sql, options.database, journal);
    }
    if (target.ledger.length !== trailing)
      throw new Error('Release ledger is incomplete before sponsor grants');
    await recordAcl('before-trailing');
    await apply(trailing, trailing + 1);
    target = await inspectTarget(sql, options.database, journal);
    if (target.ledger.length !== trailing + 1)
      throw new Error('Sponsor grants migration did not apply');
  }
  if (through > trailing && target.ledger.length === trailing + 1) {
    await recordAcl('after-trailing');
  }
  if (target.ledger.length < through) {
    await apply(target.ledger.length, through);
    target = await inspectTarget(sql, options.database, journal);
  }
  if (target.ledger.length !== through) throw new Error('Release journal is incomplete');
  await options.attestFinal(sql, target);
  return target;
}
