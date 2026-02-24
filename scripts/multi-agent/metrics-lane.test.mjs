import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichEvents, parseEventsNdjson } from './metrics-lane.mjs';

test('enrichEvents applies role profile defaults and success mapping', () => {
  const events = [
    { role: 'gatekeeper', status: 0, latencyMs: 420 },
    { role: 'unknown-role', status: 1, latencyMs: 1000, tokenCount: 500 },
  ];
  const profile = {
    default: { tokensPerRun: 1000, usdPer1kTokens: 0.01 },
    gatekeeper: { tokensPerRun: 2400, usdPer1kTokens: 0.02 },
  };

  const enriched = enrichEvents(events, profile);

  assert.deepEqual(enriched[0], {
    role: 'gatekeeper',
    success: true,
    latencyMs: 420,
    tokenCount: 2400,
    costUsd: 0.048,
    label: '',
    timestamp: enriched[0].timestamp,
  });
  assert.equal(typeof enriched[0].timestamp, 'string');

  assert.equal(enriched[1].role, 'unknown-role');
  assert.equal(enriched[1].success, false);
  assert.equal(enriched[1].tokenCount, 500);
  assert.equal(enriched[1].costUsd, 0.005);
});

test('parseEventsNdjson ignores trailing partial record from interrupted writes', () => {
  const raw = '{"role":"gatekeeper","status":0}\n{"role":"reviewer"';
  const parsed = parseEventsNdjson(raw, 'events.ndjson');

  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].role, 'gatekeeper');
  assert.equal(parsed.skippedTrailingPartial, true);
});

test('parseEventsNdjson fails for malformed non-trailing records', () => {
  assert.throws(
    () => parseEventsNdjson('{"role":"gatekeeper"}\n{invalid}\n{"role":"reviewer"}\n', 'events.ndjson'),
    /Invalid NDJSON in events.ndjson:2/
  );
});
