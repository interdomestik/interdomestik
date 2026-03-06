import assert from 'node:assert/strict';
import test from 'node:test';

import packageJson from '../package.json' with { type: 'json' };

test('e2e gate scripts keep full and fast lanes distinct', () => {
  const stateSetup = packageJson.scripts['e2e:state:setup'];
  const fullGate = packageJson.scripts['e2e:gate'];
  const fastGate = packageJson.scripts['e2e:gate:fast'];

  assert.equal(typeof stateSetup, 'string');
  assert.match(stateSetup, /setup\.state\.spec\.ts/);
  assert.match(stateSetup, /--project=setup-ks/);
  assert.match(stateSetup, /--project=setup-mk/);

  assert.match(fullGate, /pnpm e2e:state:setup/);
  assert.match(fullGate, /PW_FAST_GATES=1/);
  assert.match(fullGate, /--project=gate-ks-sq/);
  assert.match(fullGate, /--project=gate-mk-mk/);

  assert.match(fastGate, /PW_FAST_GATES=1/);
  assert.match(fastGate, /--project=gate-ks-sq/);
  assert.match(fastGate, /--project=gate-mk-mk/);
  assert.notEqual(fullGate, fastGate);
});
