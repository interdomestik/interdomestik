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
    [h => (h.deps.chain.bail = throwing), 'the pr:verify chain could not be read'],
    [
      h => (h.state.bail = 'false\n'),
      'pnpm bail must stay on, so a failing nested run fails the chain',
    ],
    [
      h => (h.state.hooksDirectory = true),
      'node_modules/.hooks holds lifecycle hooks that could run after the stamp',
    ],
    [
      h => (h.deps.chain.scripts = () => ({ ...packageJson.scripts, 'postpr:verify': 'true' })),
      'a postpr:verify script would run after the stamp',
    ],
  ];
  for (const [change, message] of cases) {
    // At begin the run is downgraded and says why; it is never gate evidence.
    const atBegin = harness({ marker: trusted() });
    change(atBegin);
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], atBegin.deps), 0, message);
    assert.ok(atBegin.output.log.join('\n').includes(message), message);
    assert.match(atBegin.output.log[0], /PRE-CHECK: this run does not match/u);
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], atBegin.deps), 0, message);
    assert.equal(atBegin.readFinal().mode, 'PRE-CHECK', message);
    atBegin.cleanup();
    // A gate run that stops matching before its stamp is recorded as a pre-check.
    const atStamp = harness({ marker: trusted() });
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], atStamp.deps), 0);
    change(atStamp);
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], atStamp.deps), 0, message);
    const record = atStamp.readFinal();
    assert.equal(record.mode, 'PRE-CHECK', message);
    assert.ok(record.reasons.includes(message), message);
    assert.ok(!Object.hasOwn(record, 'markerSha256'), message);
    atStamp.cleanup();
  }
});

test('a manual begin, a failed step and a manual stamp never yield gate evidence', () => {
  const h = harness({ marker: trusted(), env: { npm_lifecycle_event: '' } });
  h.state.parent = '-zsh';
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.equal(h.readFinal().mode, 'PRE-CHECK');
  assert.ok(!h.output.log.join('\n').includes('GATE-EVIDENCE'));
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
      chain: {
        scripts: () => packageJson.scripts,
        parentCommand: () => parent,
        bail: () => 'true',
        hooksDirectory: () => false,
      },
    });
  assert.deepEqual(check(`sh -c ${script}\n`), []);
  assert.deepEqual(check(`bash -c ${script}`), [
    'this step is not running inside the unchanged security:guard chain',
  ]);
  assert.deepEqual(check(`sh -c ${script} && true`), [
    'this step is not running inside the unchanged security:guard chain',
  ]);
});
