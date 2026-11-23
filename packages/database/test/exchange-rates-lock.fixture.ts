import assert from 'node:assert/strict';
import { setTimeout as poll } from 'node:timers/promises';

import type postgres from 'postgres';

import { restricted } from './exchange-rates-restricted.fixture';

// Keep a transaction open until the contender has actually reached a PostgreSQL lock wait.
export function waitForLockWaiters(client: postgres.Sql, blocker: number, count: number) {
  const deadline = Date.now() + 5000;
  return checkWaiters();

  async function checkWaiters(): Promise<void> {
    const [row] = await client<{ waiting: number }[]>`
      with recursive waiters(pid) as (
        select ${blocker}::int
        union
        select activity.pid from pg_stat_activity activity
        join waiters on waiters.pid = any(pg_blocking_pids(activity.pid))
        where activity.datname = current_database()
      ) select count(*)::int - 1 as waiting from waiters`;
    if (row.waiting >= count) return;
    await poll(20);
    if (Date.now() < deadline) return checkWaiters();
    assert.fail(`Expected ${count} PostgreSQL lock waiters for backend ${blocker}`);
  }
}

export function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function withLockedBook<T>(
  holder: postgres.Sql,
  observer: postgres.Sql,
  tenantId: string,
  bookId: string,
  publishers: () => Promise<T>,
  count: number
) {
  const locked = signal();
  const release = signal();
  let blocker = 0;
  const held = restricted(holder, tenantId, async tx => {
    const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
    blocker = pid;
    const rows = await tx`select id from exchange_rate_books where id = ${bookId} for update`;
    assert.equal(rows.length, 1);
    locked.resolve();
    await release.promise;
    const [{ mark }] = await tx<{ mark: string }[]>`select clock_timestamp()::text as mark`;
    return mark;
  });

  let pending: Promise<T> | undefined;
  try {
    await Promise.race([locked.promise, held]);
    pending = publishers();
    await Promise.race([
      waitForLockWaiters(observer, blocker, count),
      pending.then(() => assert.fail('Publications finished while the book was locked')),
    ]);
    release.resolve();
    return { mark: await held, result: await pending };
  } finally {
    release.resolve();
    await Promise.allSettled([held, pending]);
  }
}
