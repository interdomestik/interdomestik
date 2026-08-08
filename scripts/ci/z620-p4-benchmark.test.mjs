import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { availableMemoryGiB, hasFullWarmHit, turboCacheSummary } from './z620-benchmark-lib.mjs';

const source = fs.readFileSync(new URL('./z620-p4-benchmark.mjs', import.meta.url), 'utf8');

test('pins verify and E2E preparation to different NUMA CPU lists', () => {
  assert.match(source, /'0-5,12-17'/);
  assert.match(source, /'6-11,18-23'/);
});

test('uses a shared local-only Turbo cache with bounded concurrency and summaries', () => {
  assert.match(source, /scripts\/ci\/run-turbo\.mjs/);
  assert.doesNotMatch(source, /'exec',\s*'turbo'/);
  assert.match(source, /--cache-dir=/);
  assert.match(source, /prepareCacheNamespace/);
  assert.match(source, /--concurrency=6/);
  assert.match(source, /--summarize/);
  assert.match(source, /--no-daemon/);
});

test('requires memory headroom and stable PostgreSQL restart count', () => {
  assert.match(source, /availableGiB < 12/);
  assert.match(source, /postgresBefore\.output === postgresAfter\.output/);
  assert.match(source, /warm\.durationMs < cold\.durationMs/);
});

test('writes benchmark evidence with exclusive no-follow semantics', () => {
  assert.match(
    source,
    /writeJson\(path\.join\(evidenceDir, 'benchmark\.json'\), evidence, \{ exclusive: true \}\)/u
  );
});

test('parses ANSI Turbo summaries and requires a full warm hit', () => {
  const summary = turboCacheSummary('\u001b[32m Cached:\u001b[0m    2 cached, 2 total');
  assert.equal(summary, 'Cached:    2 cached, 2 total');
  assert.equal(hasFullWarmHit(summary), true);
  assert.equal(availableMemoryGiB('MemAvailable:    12582912 kB\n'), 12);
});
