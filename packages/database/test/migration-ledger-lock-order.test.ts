import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';

import { startLedgerHarness, type LedgerHarness } from './migration-ledger-inspection.support';

let harness: LedgerHarness;
before(async () => {
  harness = await startLedgerHarness();
});
after(async () => {
  const receipt = await harness.close();
  assert(receipt.removedAt);
});

async function waitForBlockedReader(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await harness.setup<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_catalog.pg_locks
      WHERE locktype = 'advisory'
        AND classid::int = 673167055
        AND objid::int = -773281837
        AND objsubid = 2
        AND NOT granted
    `;
    if (rows[0]?.count === 1) return;
    await delay(25);
  }
  throw new Error('WAITING_LEDGER_READER_NOT_OBSERVED');
}

test('a waiting reader observes the writer committed ledger', async () => {
  await harness.reset('table');
  await harness.setup`SELECT pg_advisory_lock(673167055, -773281837)`;
  let locked = true;
  const inspection = harness.run();
  try {
    await waitForBlockedReader();
    await harness.setup`BEGIN`;
    await harness.fill(1);
    await harness.setup`COMMIT`;
    const unlock = await harness.setup<{ unlocked: boolean }[]>`
      SELECT pg_advisory_unlock(673167055, -773281837) AS unlocked
    `;
    assert.equal(unlock[0]?.unlocked, true);
    locked = false;
    const result = await inspection;
    assert.equal(result.outer.ok, true);
    assert(result.inspection?.ok);
    assert.equal(result.inspection.summary.applied_migrations, 1);
  } finally {
    if (locked) await harness.setup`SELECT pg_advisory_unlock(673167055, -773281837)`;
  }
});
