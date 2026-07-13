import assert from 'node:assert/strict';
import test from 'node:test';

import { createSecurityEvents } from '../server/security/events.mjs';

test('security events are bounded, counted, and identity-free', () => {
  const rows = [];
  const events = createSecurityEvents(value => rows.push(value));
  events.emit('login_failed');
  events.emit('rate_limited');
  assert.deepEqual(rows, [
    { event: 'login_failed', count: 1 },
    { event: 'rate_limited', count: 1 },
  ]);
  assert.throws(() => events.emit('gazmend'));
  assert.doesNotMatch(JSON.stringify(rows), /username|account|password|receipt/iu);
});
