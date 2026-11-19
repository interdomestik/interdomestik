import assert from 'node:assert/strict';
import test from 'node:test';

import { chainErrors } from './verify-machine-chain.mjs';
import { harness, packageJson, trusted } from './verify-machine-harness.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const NOT_IN_CHAIN = 'this step is not running inside the unchanged pr:verify chain';
const throwing = () => {
  throw new Error('unreadable');
};

test('gate mode begins and stamps only inside the unchanged pnpm chain of its lane', () => {
  const withoutCoverage = packageJson.scripts['pr:verify'].replace(' && pnpm coverage:gate', '');
  const cases = [
    [h => (h.state.parent = '-zsh'), NOT_IN_CHAIN],
    [h => (h.state.parent = `sh -c ${withoutCoverage}`), NOT_IN_CHAIN],
    [
      h => (h.deps.env.npm_lifecycle_event = 'security:guard'),
      'gate evidence comes only from `pnpm pr:verify`',
    ],
    [h => (h.deps.chain.scripts = throwing), 'the pr:verify chain could not be read'],
  ];
  for (const [change, message] of cases) {
    const atBegin = harness({ marker: trusted() });
    change(atBegin);
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], atBegin.deps), 1, message);
    assert.ok(atBegin.output.error.join('\n').includes(message), message);
    assert.deepEqual(atBegin.files(), []);
    atBegin.cleanup();
    const atStamp = harness({ marker: trusted() });
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], atStamp.deps), 0);
    change(atStamp);
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], atStamp.deps), 1, message);
    assert.ok(atStamp.output.error.join('\n').includes(message), message);
    assert.ok(
      atStamp.files().every(name => name.startsWith('pending')),
      'no final record'
    );
    atStamp.cleanup();
  }
});

test('a manual begin, a failed step and a manual stamp never yield gate evidence', () => {
  const h = harness({ marker: trusted(), env: { npm_lifecycle_event: '' } });
  h.state.parent = '-zsh';
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 1);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  assert.deepEqual(h.files(), []);
  h.cleanup();
});

test('pre-checks do not depend on the chain', () => {
  const h = harness({ env: { npm_lifecycle_event: '' } });
  h.state.parent = '-zsh';
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.equal(h.readFinal().mode, 'PRE-CHECK');
  h.cleanup();
});

test('the chain check compares the parent shell with the committed script exactly', () => {
  const env = { npm_lifecycle_event: 'security:guard' };
  const script = packageJson.scripts['security:guard'];
  const check = parent =>
    chainErrors('security-guard', {
      env,
      repoRoot: '/r',
      chain: { scripts: () => packageJson.scripts, parentCommand: () => parent },
    });
  assert.deepEqual(check(`sh -c ${script}\n`), []);
  assert.deepEqual(check(`bash -c ${script}`), [
    'this step is not running inside the unchanged security:guard chain',
  ]);
  assert.deepEqual(check(`sh -c ${script} && true`), [
    'this step is not running inside the unchanged security:guard chain',
  ]);
});
