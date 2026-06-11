import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildContractPreamble, classifyReview } from './review-contract.mjs';
import { runWaterfall } from './reviewer-waterfall.mjs';

const adapter = JSON.parse(
  fs.readFileSync(
    new URL('../../docs/golden-loop/adapters/interdomestik.adapter.json', import.meta.url),
    'utf8'
  )
);

const SLICE = 'T-002d';
function contractReview({ slice = SLICE, verdict = 'READY', findings = '1. Nit: naming.' } = {}) {
  return [
    'REVIEWER: claude-fable-5',
    `SLICE: ${slice}`,
    'SCOPE: packages/domain-claims transition module; evidence packet review-input',
    'FINDINGS:',
    findings,
    `VERDICT: ${verdict}`,
    `NOTES: ${'reviewed transition guard, tests, and compile-fail fixture in detail. '.repeat(3)}`,
  ].join('\n');
}

test('only a full-contract READY review classifies as completed', () => {
  const context = { sliceId: SLICE };
  assert.equal(classifyReview({ exitCode: 0, output: contractReview() }, context).status, 'completed');
  const generic = classifyReview({ exitCode: 0, output: 'Looks good to me. '.repeat(30) }, context);
  assert.equal(generic.status, 'invalid');
  assert.match(generic.reason, /missing review contract field/);
  assert.equal(classifyReview({ exitCode: 0, output: 'ok' }, context).status, 'invalid');
  const wrongSlice = classifyReview(
    { exitCode: 0, output: contractReview({ slice: 'T-999' }) },
    context
  );
  assert.equal(wrongSlice.status, 'invalid');
  assert.match(wrongSlice.reason, /slice mismatch/);
  assert.equal(
    classifyReview({ exitCode: 0, output: contractReview({ verdict: 'READY AFTER FIXES' }) }, context)
      .status,
    'unresolved-blockers'
  );
  assert.equal(
    classifyReview({ exitCode: 0, output: contractReview({ verdict: 'BLOCKED' }) }, context).status,
    'unresolved-blockers'
  );
  assert.equal(
    classifyReview(
      { exitCode: 0, output: contractReview({ findings: '1. BLOCKER: tenant leak.' }) },
      context
    ).status,
    'unresolved-blockers'
  );
  assert.equal(
    classifyReview({ exitCode: 0, output: `I must decline. ${contractReview()}` }, context).status,
    'refused'
  );
  assert.equal(classifyReview({ exitCode: 3, output: 'boom' }, context).status, 'error');
  assert.equal(classifyReview({ unavailable: true, reason: 'gone' }, context).status, 'unavailable');
  assert.match(buildContractPreamble(SLICE), /VERDICT: READY \| READY AFTER FIXES \| BLOCKED/);
});

test('waterfall short-circuits at first contract-valid READY review', () => {
  const calls = [];
  const reviewerOf = route =>
    Object.keys(adapter.reviewerWaterfall.routes).find(
      key => adapter.reviewerWaterfall.routes[key] === route
    );
  const outputs = {
    fable: { unavailable: true, reason: 'not on PATH', exitCode: -1, output: '' },
    codex: { exitCode: 0, output: contractReview({ verdict: 'BLOCKED' }) },
    sonnet: { exitCode: 0, output: contractReview() },
    copilot: { exitCode: 0, output: contractReview() },
  };
  const executor = route => (calls.push(reviewerOf(route)), outputs[reviewerOf(route)]);
  const { results, winner } = runWaterfall(
    adapter.reviewerWaterfall.order,
    adapter.reviewerWaterfall.routes,
    'prompt',
    executor,
    { sliceId: SLICE }
  );
  assert.deepEqual(calls, ['fable', 'codex', 'sonnet']);
  assert.equal(winner.reviewer, 'sonnet');
  assert.deepEqual(
    results.map(result => result.status),
    ['unavailable', 'unresolved-blockers', 'completed']
  );
});

test('dry-run probes every route and can never produce a winner', () => {
  const executor = () => ({ probeOnly: true, unavailable: false });
  const { results, winner } = runWaterfall(
    adapter.reviewerWaterfall.order,
    adapter.reviewerWaterfall.routes,
    'prompt',
    executor,
    { dryRun: true, sliceId: SLICE }
  );
  assert.equal(winner, null);
  assert.equal(results.length, adapter.reviewerWaterfall.order.length);
  assert.ok(results.every(result => result.status === 'route-available'));
  assert.ok(results.every(result => result.reason.includes('not review evidence')));
});
