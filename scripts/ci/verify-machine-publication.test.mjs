// What the verifier honours first, and when a run's result is decided.
import assert from 'node:assert/strict';
import test from 'node:test';

import { harness, trusted } from './verify-machine-harness.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

test('an untrusted marker stops the run even when GITHUB_ACTIONS is set', () => {
  const h = harness({
    marker: { status: 'invalid', errors: ['marker file must be owned by root'] },
    env: { GITHUB_ACTIONS: 'true' },
  });
  for (const command of ['begin', 'stamp']) {
    assert.equal(runVerifyMachine([command, 'pr-verify'], h.deps), 1);
  }
  assert.match(h.output.error.join('\n'), /not trusted[\s\S]*owned by root/u);
  assert.deepEqual(h.files(), []);
  h.cleanup();
});

test('the final record decides the run; a failed pending-file cleanup cannot undo it', () => {
  const h = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  h.deps.records = {
    ...h.deps.records,
    removeRecord: () => {
      throw Object.assign(new Error('locked'), { code: 'EACCES' });
    },
  };
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.equal(h.readFinal().mode, 'GATE-EVIDENCE');
  assert.match(h.output.log.at(-1), /^GATE-EVIDENCE lane=pr-verify /u);
  assert.match(h.output.error.join('\n'), /pending record not removed \(EACCES\); continuing/u);
  h.cleanup();
});
