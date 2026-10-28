import assert from 'node:assert/strict';
import { promiseHooks } from 'node:v8';

// Only for the source-pinned scheduleStatusChangeNotification in this proof.
// Its first promise is the discarded async IIFE: the preceding code only reads
// our plain fixture fields and applies the three synchronous early-return gates.
// This observes the actual promise; it replaces no function, DB client or SQL.
export async function settleStatusNotification(schedule, input) {
  const active = Boolean(
    input.deps.notifyStatusChanged && input.oldStatus && input.oldStatus !== input.newStatus
  );
  let first;
  let count = 0;
  const stop = promiseHooks.createHook({
    init(promise) {
      if (count++ === 0) first = promise;
    },
  });
  let result;
  try {
    result = schedule(input);
  } finally {
    stop();
  }
  assert.equal(result, undefined, 'source-pinned scheduler returns void');
  if (!active) {
    assert.equal(count, 0, 'early return starts no asynchronous work');
    return;
  }
  assert.ok(first instanceof Promise, 'active scheduler must create its outer promise');
  await first;
}
