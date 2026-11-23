import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import {
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

export const KS = 'tenant_ks';
export const MK = 'tenant_mk';
export const BUCKET = 'claim-evidence';
export const TITLE = 'R37 original draft title';
export const EDITED_TITLE = 'R37 edited draft title';
export const INVALID_PATH_REFUSAL = {
  success: false,
  error: 'Invalid file path detected. Evidence must be uploaded by the claimant.',
  code: 'INVALID_PATH',
};

export type Session = { user: { id: string; role: string; tenantId: string } };
/** The domain's `validateSubmittedClaimFile` dependency, as the proof stubs it. */
export type Validator = (args: { file: { path: string } }) => Promise<void>;
type DraftModule = typeof import('../../domain-claims/src/claims/draft');

export function rowId(): string {
  return 'r37_' + randomUUID();
}

/** The key the claims domain locks on (`lockClaimEvidenceObjects`); a drift fails the waits. */
export function objectLockKey(tenantId: string, path: string): string {
  return JSON.stringify(['claim-evidence-object', tenantId, BUCKET, path]);
}

export function initialPath(tenantId: string, actorId: string, fileId: string): string {
  return `pii/tenants/${tenantId}/claims/${actorId}/unassigned/${fileId}-proof.pdf`;
}

export function evidence(path: string, fileId: string) {
  return {
    id: fileId,
    name: 'proof.pdf',
    path,
    type: 'application/pdf',
    size: 100,
    bucket: BUCKET,
    classification: 'pii',
    category: 'evidence' as const,
    uploadIntentToken: 'verified-by-stub',
  };
}

const dialect = new PgDialect();

/**
 * A stand-in for a tenant transaction for code that only executes statements: runs them on one
 * postgres.js transaction and keeps the ids passed to `pg_advisory_xact_lock`, in order.
 */
export function recordingTransaction(conn: postgres.TransactionSql) {
  const lockedIds: bigint[] = [];
  const tx = {
    execute: (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      if (query.sql.includes('pg_advisory_xact_lock')) {
        lockedIds.push(BigInt(String(query.params[0])));
      }
      return conn.unsafe(query.sql, query.params as never[]);
    },
  };
  return { lockedIds, tx: tx as never };
}

export function sortedPaths(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function session(id: string, tenantId = KS, role = 'member'): Session {
  return { user: { id, role, tenantId } };
}

/** Restricted role with only the grants the draft update needs; users and drafts as given. */
export async function seedDraftFixtures(
  admin: postgres.Sql,
  users: ReadonlyArray<readonly [id: string, tenantId: string, role: string]>,
  drafts: ReadonlyArray<readonly [id: string, tenantId: string, ownerId: string]>
): Promise<void> {
  const role = quoteIdentifier(TEST_DB_ROLE);
  await admin.unsafe(
    `do $$ begin create role ${role} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; exception when duplicate_object or unique_violation then alter role ${role} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)}; end $$;`
  );
  await admin.unsafe(`grant usage on schema public to ${role}`);
  await admin.unsafe(`grant select, insert, update on "claim", "claim_documents" to ${role}`);
  const userRows = users.map(([id, tenantId, userRole]) => ({
    id,
    tenant_id: tenantId,
    name: 'R37',
    email: id + '@example.test',
    emailVerified: true,
    role: userRole,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await admin`insert into "user" ${admin(userRows)}`;
  const draftRows = drafts.map(([id, tenantId, owner]) => ({
    id,
    tenant_id: tenantId,
    access_tenant_id: tenantId,
    userId: owner,
    title: TITLE,
    category: 'vehicle',
    companyName: 'Fixture insurer',
    case_lifecycle_state: 'draft',
    recovery_lifecycle_state: 'not_started',
  }));
  await admin`insert into "claim" ${admin(draftRows)}`;
}

/** The calls and reads the proof makes; drafts are updated under the restricted role. */
export function draftAttachmentHarness(
  admin: postgres.Sql,
  holder: postgres.Sql,
  draft: DraftModule
) {
  const passingValidator: Validator = () => Promise.resolve();
  const authorityOf = (s: Session) =>
    mintTestTenantAuthority(s.user.tenantId, { userId: s.user.id, role: s.user.role });
  const update = (
    s: Session,
    claimId: string,
    files: unknown[],
    validate: Validator = passingValidator
  ) =>
    draft.updateDraftClaimCore(
      {
        authority: authorityOf(s),
        session: s as never,
        requestHeaders: new Headers(),
        claimId,
        data: {
          category: 'vehicle',
          title: EDITED_TITLE,
          companyName: 'Fixture insurer',
          description: 'A description long enough for the claim schema.',
          currency: 'EUR',
          files,
        } as never,
      },
      { validateSubmittedClaimFile: validate }
    );
  const rowsOf = (claimId: string) =>
    admin`select tenant_id, claim_id, uploaded_by, file_path, bucket from claim_documents where claim_id = ${claimId}`;
  const titleOf = async (claimId: string) =>
    (await admin`select title from "claim" where id = ${claimId}`)[0]?.title;
  /** A committed document row written outside the domain (another writer). */
  const insertDocument = (claimId: string, path: string, uploadedBy: string) =>
    admin`insert into claim_documents (id, tenant_id, access_tenant_id, claim_id, name, file_path, file_type, file_size, bucket, uploaded_by)
      values (${rowId()}, ${KS}, ${KS}, ${claimId}, 'proof.pdf', ${path}, 'application/pdf', 100, ${BUCKET}, ${uploadedBy})`;
  /** Polls every 50 ms, at most 100 times, until a restricted-role session waits on the holder. */
  const waitForBlockedBy = async (holderPid: number, attemptsLeft = 100): Promise<void> => {
    const waiting = await admin`select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and not l.granted and a.usename = ${TEST_DB_ROLE}
        and ${holderPid}::int = any(pg_blocking_pids(l.pid))`;
    if (waiting.length > 0) return;
    if (attemptsLeft <= 1) assert.fail('the contender never waited on the evidence-object lock');
    await new Promise(resolve => setTimeout(resolve, 50));
    await waitForBlockedBy(holderPid, attemptsLeft - 1);
  };
  /**
   * Holds the object lock in a restricted-role transaction, starts `contender`, waits until it
   * blocks on that holder, runs `meanwhile`, then releases the lock (also on failure) and returns
   * the contender's outcome.
   */
  const contend = async <T>(
    key: string,
    contender: () => Promise<T>,
    meanwhile: () => Promise<unknown>
  ): Promise<T> => {
    let release!: () => void;
    const released = new Promise<void>(resolve => (release = resolve));
    let locked!: (pid: number) => void;
    const lockTaken = new Promise<number>(resolve => (locked = resolve));
    const done = holder.begin(async htx => {
      const [{ pid }] = await htx`select pg_backend_pid() as pid,
        pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      locked(Number(pid));
      await released;
    });
    // A holder that fails before it locks rejects here instead of leaving the waiter hanging.
    const holderStarted = Promise.race([
      lockTaken,
      done.then(() => {
        throw new Error('the lock holder ended before it took the lock');
      }),
    ]);
    // Replaced by the contender's outcome once it starts; otherwise the call rejects with this.
    let outcome: Promise<T> = Promise.reject(new Error('the contender never started'));
    outcome.catch(() => undefined);
    try {
      const holderPid = await holderStarted;
      outcome = contender();
      outcome.catch(() => undefined);
      await waitForBlockedBy(holderPid);
      await meanwhile();
    } finally {
      release();
      await done;
    }
    return outcome;
  };
  return {
    authorityOf,
    contend,
    insertDocument,
    rowsOf,
    titleOf,
    update,
  };
}
