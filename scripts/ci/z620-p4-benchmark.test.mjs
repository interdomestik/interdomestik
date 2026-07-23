import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./z620-p4-benchmark.mjs', import.meta.url), 'utf8');

test('pins verify and E2E preparation to different NUMA CPU lists', () => {
  assert.match(source, /'0-5,12-17'/);
  assert.match(source, /'6-11,18-23'/);
});

test('uses a shared local-only Turbo cache with bounded concurrency and summaries', () => {
  assert.match(source, /--cache-dir=/);
  assert.match(source, /--concurrency=6/);
  assert.match(source, /--summarize/);
  assert.match(source, /--no-daemon/);
});

test('requires memory headroom and stable PostgreSQL restart count', () => {
  assert.match(source, /availableGiB < 12/);
  assert.match(source, /postgresBefore\.output === postgresAfter\.output/);
  assert.match(source, /warm\.durationMs < cold\.durationMs/);
});
