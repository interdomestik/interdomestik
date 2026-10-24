import assert from 'node:assert/strict';
import test from 'node:test';
import { settleStatusNotification } from './db-access-crm-runtime-notification-settlement.mjs';

const input = () => ({
  deps: { notifyStatusChanged() {} },
  oldStatus: 'submitted',
  newStatus: 'verification',
});
const deferred = () => Promise.withResolvers();

test('waits for the discarded outer promise beyond nested awaits and callback settlement', async () => {
  const sql = deferred(),
    send = deferred();
  const events = [];
  let completed = false;
  const observed = settleStatusNotification(() => {
    void (async () => {
      await sql.promise;
      events.push('sql');
      await send.promise;
      events.push('send');
    })();
  }, input()).then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  sql.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ['sql']);
  assert.equal(completed, false);
  send.resolve();
  await observed;
  assert.deepEqual(events, ['sql', 'send']);
  assert.equal(completed, true);
});

test('caught lookup rejection is observed before a negative no-send assertion', async () => {
  const sql = deferred();
  let sends = 0,
    caught = 0;
  const observed = settleStatusNotification(() => {
    void (async () => {
      try {
        await sql.promise;
        sends++;
      } catch {
        caught++;
      }
    })();
  }, input());
  sql.reject(new Error('owned SQL rejection'));
  await observed;
  assert.equal(caught, 1);
  assert.equal(sends, 0);
});

test('an inner immediately resolved promise is not mistaken for outer completion', async () => {
  const tail = deferred();
  let done = false;
  const observed = settleStatusNotification(() => {
    void (async () => {
      await Promise.resolve();
      await tail.promise;
      done = true;
    })();
  }, input());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(done, false);
  tail.resolve();
  await observed;
  assert.equal(done, true);
});

for (const [label, change] of [
  [
    'missing callback',
    p => {
      p.deps = {};
    },
  ],
  [
    'missing previous status',
    p => {
      p.oldStatus = null;
    },
  ],
  [
    'unchanged status',
    p => {
      p.oldStatus = p.newStatus;
    },
  ],
])
  test(label + ' creates no promise', async () => {
    const p = input();
    change(p);
    await settleStatusNotification(() => undefined, p);
  });

test('an active scheduler without its IIFE is rejected', async () => {
  await assert.rejects(
    settleStatusNotification(() => undefined, input()),
    /outer promise/
  );
});

test('unrelated promises before and after the synchronous observation window do not interfere', async () => {
  const unrelated = deferred();
  await settleStatusNotification(() => {
    void (async () => {
      await Promise.resolve();
    })();
  }, input());
  const later = deferred();
  assert.ok(unrelated.promise instanceof Promise && later.promise instanceof Promise);
});

test('synchronous exceptions propagate and the hook is removed', async () => {
  await assert.rejects(
    settleStatusNotification(() => {
      throw new Error('sync failure');
    }, input()),
    /sync failure/
  );
  await settleStatusNotification(() => {
    void (async () => {})();
  }, input());
});
