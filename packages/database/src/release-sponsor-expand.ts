import type { MigrationExecutionSql } from './migration-execution-contracts';
import { sha256, type readReleaseJournal } from './release-migration-journal';
import { inspectReleaseSponsorAcl } from './release-sponsor-acl';
import {
  sponsorPrerequisiteTag,
  sponsorRuntimeRole,
  sponsorTrailingTag,
} from './release-sponsor-checkpoint';
import { runSponsorReleaseMigrations } from './release-sponsor-migrations';
import type { ApplySponsorRange, SponsorReleaseOptions, Target } from './release-sponsor-sequence';

type AclEvidence = Parameters<SponsorReleaseOptions['recordAcl']>[0];
type SponsorEvidence =
  | { type: 'checkpoint'; evidence: Parameters<SponsorReleaseOptions['recordCheckpoint']>[0] }
  | { type: 'acl'; evidence: AclEvidence }
  | { type: 'baseline' | 'final'; evidence: Pick<AclEvidence, 'acl' | 'target'> };

export type SponsorExpandOptions = {
  baselineAclSha256?: string;
  finalAclSha256?: string;
  record: (transactionId: string, event: SponsorEvidence) => void | Promise<void>;
};

export async function expandWithSponsor(
  sql: MigrationExecutionSql,
  journal: ReturnType<typeof readReleaseJournal>,
  { beforeCount, expandCount }: { beforeCount: number; expandCount: number },
  scratch: boolean,
  options: SponsorExpandOptions | undefined,
  apply: ApplySponsorRange
): Promise<boolean> {
  const trailing = journal.entries.findIndex(entry => entry.tag === sponsorTrailingTag);
  const firstDependent = journal.entries.findIndex(entry => entry.tag === sponsorPrerequisiteTag);
  if (
    trailing < beforeCount ||
    (trailing >= expandCount && (firstDependent < beforeCount || firstDependent >= expandCount))
  )
    return false;

  if (scratch) {
    const [role] =
      await sql`SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sponsorRuntimeRole}`;
    if (!role) return false; // The role-less scratch journal exercises schema parity.
  }
  if (!options) throw new Error('SPONSOR_EVIDENCE_STORE_REJECTED');
  if (!scratch && (!options.baselineAclSha256 || !options.finalAclSha256))
    throw new Error('SPONSOR_ACL_PIN_MISMATCH');

  // Admin connection preflight has already bound the URL's database to this reserved session.
  const [{ database, transactionId }] = await sql<{ database: string; transactionId: string }[]>`
    SELECT pg_catalog.current_database() AS database,
      pg_catalog.pg_current_xact_id()::text AS "transactionId"
  `;
  const checkAcl = async (type: 'baseline' | 'final', target: Target, expected?: string) => {
    const acl = await inspectReleaseSponsorAcl(sql);
    if (
      (!scratch || expected !== undefined) &&
      sha256(JSON.stringify({ posture: target.posture, acl })) !== expected
    )
      throw new Error('SPONSOR_ACL_PIN_MISMATCH');
    await options.record(transactionId, { type, evidence: { target, acl } });
  };

  await runSponsorReleaseMigrations({
    sql,
    journal: journal.migrations.map((migration, idx) => ({
      ...migration,
      tag: journal.entries[idx].tag,
    })),
    through: expandCount,
    apply,
    database,
    path: beforeCount <= firstDependent ? 'fresh' : 'forward',
    assertClosedTargetAndBaseline: (_sql, target) =>
      checkAcl('baseline', target, options.baselineAclSha256),
    attestFinal: (_sql, target) => checkAcl('final', target, options.finalAclSha256),
    async recordCheckpoint(evidence) {
      await options.record(transactionId, { type: 'checkpoint', evidence });
    },
    async recordAcl(evidence) {
      await options.record(transactionId, { type: 'acl', evidence });
    },
  });
  return true;
}
