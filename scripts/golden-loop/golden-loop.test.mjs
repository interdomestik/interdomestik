import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateAdapter } from './load-adapter.mjs';
import { emptyState, readState, writeState, appendJournal, statePaths } from './resume-state.mjs';
import { boundOutput, buildPacket, writePacket } from './evidence-packet.mjs';
import { buildGitStatusOutput } from './git-status-packet.mjs';
import { reviewerEnv } from './reviewer-env.mjs';
import { normalizeReviewerOutput } from './reviewer-output.mjs';

const schema = JSON.parse(
  fs.readFileSync(new URL('./adapter.schema.json', import.meta.url), 'utf8')
);
const adapter = JSON.parse(
  fs.readFileSync(
    new URL('../../docs/golden-loop/adapters/interdomestik.adapter.json', import.meta.url),
    'utf8'
  )
);

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'golden-loop-test-'));
}

test('interdomestik adapter validates against schema requirements', () => {
  assert.deepEqual(validateAdapter(adapter, schema), []);
});

test('adapter declares explicit closeout exception and optional skill paths', () => {
  assert.ok(adapter.closeout.protectedPathException.includes('approved closeout'));
  assert.ok(adapter.closeout.protectedPathException.includes('apps/web/src/proxy.ts'));
  const skillPaths = adapter.skillAuthorityPaths.map(entry => entry.path);
  for (const env of ['.claude', '.codex', '.gemini']) {
    assert.ok(
      skillPaths.some(skillPath => skillPath.startsWith(`${env}/`)),
      `missing ${env}`
    );
  }
  assert.ok(adapter.skillAuthorityPaths.every(entry => entry.optional === true));
});

test('adapter encodes unified PR monitoring and auto-merge rules', () => {
  const prVerify = adapter.gates.find(gate => gate.name === 'pr-verify');
  const e2eGate = adapter.gates.find(gate => gate.name === 'e2e-gate');
  assert.ok(prVerify.covers.includes('e2e-gate-pr'));
  assert.ok(e2eGate.skipWhenCoveredBy.includes('pr-verify'));
  assert.equal(adapter.autoMerge.method, 'squash');
  assert.ok(adapter.autoMerge.criteria.some(criterion => criterion.includes('zero open issues')));
  assert.ok(
    adapter.autoMerge.criteria.some(criterion => criterion.includes('zero open security hotspots'))
  );
  assert.ok(adapter.autoMerge.criteria.some(criterion => criterion.includes('Copilot')));
  assert.ok(adapter.closeout.rules.some(rule => rule.includes('implementation PR merged')));
  assert.ok(adapter.closeout.rules.some(rule => rule.includes('branch and worktree clean')));
});

test('validateAdapter reports missing fields and unrouted reviewers', () => {
  const broken = structuredClone(adapter);
  delete broken.budgets;
  broken.reviewerWaterfall.order.push('ghost-reviewer');
  const errors = validateAdapter(broken, schema);
  assert.ok(errors.some(error => error.includes('budgets')));
  assert.ok(errors.some(error => error.includes('ghost-reviewer')));
});

test('reviewerEnv adds common reviewer CLI install locations', () => {
  const env = reviewerEnv({ HOME: '/Users/example', PATH: '/usr/bin:/bin' });
  assert.ok(env.PATH.includes('/Users/example/.npm-global/bin'));
  assert.ok(env.PATH.includes('/opt/homebrew/bin'));
  assert.ok(env.PATH.startsWith('/usr/bin:/bin'));
});

test('normalizeReviewerOutput extracts Copilot JSONL assistant content', () => {
  const output = [
    JSON.stringify({ type: 'session.skills_loaded', data: { noisy: true } }),
    JSON.stringify({
      type: 'assistant.message',
      data: { content: 'REVIEWER: copilot\nSLICE: T-1' },
    }),
    JSON.stringify({ type: 'result', exitCode: 0 }),
  ].join('\n');
  assert.equal(
    normalizeReviewerOutput(output, { outputExtractor: 'copilot-jsonl' }),
    'REVIEWER: copilot\nSLICE: T-1'
  );
});

test('resume state round-trips atomically and journals', () => {
  const root = tempRoot();
  const state = emptyState('T-TEST');
  state.phase = 'P3';
  writeState(root, 'T-TEST', state);
  const loaded = readState(root, 'T-TEST');
  assert.equal(loaded.phase, 'P3');
  assert.equal(loaded.stateVersion, 1);
  assert.ok(loaded.updatedAt);
  appendJournal(root, 'T-TEST', 'gate static passed');
  assert.match(fs.readFileSync(statePaths(root, 'T-TEST').journal, 'utf8'), /gate static passed/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('boundOutput truncates head+tail within budget and flags it', () => {
  const big = 'A'.repeat(10000) + 'MIDDLE' + 'Z'.repeat(10000);
  const { bounded, truncated, totalBytes } = boundOutput(big, 1024);
  assert.equal(truncated, true);
  assert.equal(totalBytes, 20006);
  assert.ok(Buffer.byteLength(bounded, 'utf8') < 1200);
  assert.match(bounded, /bytes omitted/);
  assert.ok(bounded.startsWith('AAAA'));
  assert.ok(bounded.endsWith('ZZZZ'));
  assert.equal(boundOutput('short', 1024).truncated, false);
});

test('packets persist with hash and bounded body, and index appends', () => {
  const root = tempRoot();
  const packet = buildPacket({
    name: 'unit',
    source: 'pnpm slice:unit',
    output: 'X'.repeat(50000),
    exitCode: 0,
    byteBudget: 2048,
  });
  const file = writePacket(root, 'T-TEST', packet);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.truncated, true);
  assert.equal(saved.sha256.length, 64);
  const index = fs.readFileSync(path.join(root, 'T-TEST', 'evidence', 'index.jsonl'), 'utf8');
  assert.equal(index.trim().split('\n').length, 1);
  assert.ok(!index.includes('XXXX'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('git status packet source includes staged, unstaged, and untracked sections', () => {
  const { output, exitCode } = buildGitStatusOutput();
  assert.equal(exitCode, 0);
  assert.match(output, /## status/);
  assert.match(output, /## staged/);
  assert.match(output, /## unstaged/);
  assert.match(output, /## untracked/);
});
