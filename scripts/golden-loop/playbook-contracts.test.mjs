import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveActiveSlice } from './active-slice.mjs';
import { runWaterfall } from './reviewer-waterfall.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const adapter = JSON.parse(
  fs.readFileSync(
    new URL('../../docs/golden-loop/adapters/interdomestik.adapter.json', import.meta.url),
    'utf8'
  )
);

function contractReview(reviewer = 'gemini-3.1-pro-preview', sliceId = 'T-303') {
  return [
    `REVIEWER: ${reviewer}`,
    `SLICE: ${sliceId}`,
    'SCOPE: bounded review packet for active-slice and fallback contracts',
    'FINDINGS:',
    '1. No blocker findings.',
    'VERDICT: READY',
    `NOTES: ${'reviewed active authority, gate coverage, and fallback behavior. '.repeat(3)}`,
  ].join('\n');
}

test('active slice resolver prefers concrete promoted slice over ARCH-FINAL umbrella', () => {
  const resolved = resolveActiveSlice(repoRoot);
  assert.equal(resolved.ok, true);
  assert.match(resolved.active.id, /^T-\d+[a-z]?$/i);
  assert.notEqual(resolved.active.id, 'ARCH-FINAL');
});

test('adapter encodes bounded reviewer fallback triggers', () => {
  const triggers = new Set(adapter.reviewerWaterfall.fallbackTriggers);
  for (const trigger of [
    'unavailable',
    'blocked',
    'error',
    'refused',
    'invalid',
    'unresolved-blockers',
  ]) {
    assert.equal(triggers.has(trigger), true, `missing ${trigger}`);
  }
  assert.ok(Object.keys(adapter.reviewerWaterfall.routes).length >= 2);
  assert.deepEqual(adapter.reviewerWaterfall.order, ['sonnet', 'gemini']);
  assert.ok(adapter.reviewerWaterfall.routes.opus);
  assert.equal(adapter.reviewerWaterfall.routes.fable, undefined);
  assert.equal(adapter.reviewerWaterfall.order.includes('opus'), false);
});

test('configured waterfall falls through after quota-style reviewer blockage', async () => {
  const calls = [];
  const executor = route => {
    const reviewer = Object.keys(adapter.reviewerWaterfall.routes).find(
      key => adapter.reviewerWaterfall.routes[key] === route
    );
    calls.push(reviewer);
    if (reviewer === 'sonnet') return { blocked: true, reason: 'quota_or_rate_limit' };
    return { exitCode: 0, output: contractReview('gemini-3.1-pro-preview', 'T-303') };
  };
  const { results, winner } = await runWaterfall(
    adapter.reviewerWaterfall.order,
    adapter.reviewerWaterfall.routes,
    'prompt',
    executor,
    { sliceId: 'T-303' }
  );
  assert.deepEqual(calls, ['sonnet', 'gemini']);
  assert.equal(results[0].status, 'blocked');
  assert.equal(results[0].reason, 'quota_or_rate_limit');
  assert.equal(winner.reviewer, 'gemini');
});
