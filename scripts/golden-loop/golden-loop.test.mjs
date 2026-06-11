import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateAdapter } from './load-adapter.mjs';
import { emptyState, readState, writeState, appendJournal, statePaths } from './resume-state.mjs';
import { boundOutput, buildPacket, writePacket } from './evidence-packet.mjs';

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

test('adapter records PR E2E lane coverage to avoid duplicate full gates', () => {
  const prVerify = adapter.gates.find(gate => gate.name === 'pr-verify');
  const e2eGate = adapter.gates.find(gate => gate.name === 'e2e-gate');
  assert.ok(prVerify.covers.includes('e2e-gate-pr'));
  assert.ok(e2eGate.skipWhenCoveredBy.includes('pr-verify'));
});

test('validateAdapter reports missing fields and unrouted reviewers', () => {
  const broken = JSON.parse(JSON.stringify(adapter));
  delete broken.budgets;
  broken.reviewerWaterfall.order.push('ghost-reviewer');
  const errors = validateAdapter(broken, schema);
  assert.ok(errors.some(error => error.includes('budgets')));
  assert.ok(errors.some(error => error.includes('ghost-reviewer')));
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
