import { beforeAll, describe, vi, type Mock } from 'vitest';
import type { TenantTransaction } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  fixture,
  homeTenantId,
  ids,
  registerMessageRlsFixture,
  session,
} from './tenant-context.integration-fixture';

export const OVERLAPPED = 'Synthetic overlapped reply';
// Loaded after the fixture installs the restricted client: a top-level import would bind the
// database module to the administrative URL first, and its RLS role assertion refuses that.
export let storeMessage: typeof import('@interdomestik/domain-communications/messages/store');

export const memberSend = (
  content: string,
  clientMessageId: string,
  logAuditEvent: Mock = vi.fn()
) =>
  fixture.send({
    session: session(ids.member, 'member'),
    authority: mintTestTenantAuthority(homeTenantId, { userId: ids.member, role: 'member' }),
    requestHeaders: new Headers(),
    claimId: ids.claim,
    content,
    clientMessageId,
    deps: { logAuditEvent },
  });

/** Observe actual lock waiters; reaching the deadline is a failure, never a timing-based pass. */
export async function waitForBlockedSend(
  tx: TenantTransaction,
  kind: 'key' | 'table' = 'key',
  attemptsLeft = 200
): Promise<void> {
  // Refresh pg_stat_activity so sessions connected after the first poll remain observable.
  const { sql } = fixture.database;
  await tx.execute(sql`select pg_stat_clear_snapshot()`);
  const locks =
    kind === 'key'
      ? sql`
    select count(*)::int as waiting from pg_locks
    where locktype = 'transactionid' and not granted and transactionid = pg_current_xact_id()::xid
  `
      : sql`
    select count(*)::int as waiting from pg_stat_activity a
    where a.usename=${fixture.roleName} and cardinality(pg_blocking_pids(a.pid)) > 0
  `;
  const [row] = await tx.execute(locks);
  if (Number(row?.waiting) >= (kind === 'table' ? 2 : 1)) return;
  if (attemptsLeft === 0) throw new Error('The keyed send never waited on the open insert');
  await new Promise(resolve => setTimeout(resolve, 25));
  return waitForBlockedSend(tx, kind, attemptsLeft - 1);
}

export function describeKeyedMessageRls(name: string, registerTests: () => void) {
  const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
  suite(name, () => {
    registerMessageRlsFixture();
    beforeAll(async () => {
      storeMessage = await import('@interdomestik/domain-communications/messages/store');
    });
    registerTests();
  });
}
