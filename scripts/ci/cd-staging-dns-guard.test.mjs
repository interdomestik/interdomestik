import assert from 'node:assert/strict';
import test from 'node:test';
import { isStagingDnsPinAddition } from '../lib/workflow-staging-dns-pin.mjs';

const FILE = '.github/workflows/cd.yml';
const PIN =
  '      # Temporary: remove once interdomestik.com NS no longer CNAME (owner DNS fix)\n' +
  '      - name: Pin staging DNS (temporary NS workaround)\n' +
  '        run: node scripts/ci/pin-staging-dns.mjs\n';
const JOBS = ['deploy-staging', 'e2e-staging', 'rollback-staging-alias', 'deploy-production'];
const SETUP = "      - { uses: ./.github/actions/setup, with: { install-playwright: 'false' } }\n";
function workflow({ pins = JOBS.slice(0, 3), afterSetup = true, runner = 'ubuntu-latest' } = {}) {
  return (
    'name: CD\njobs:\n' +
    JOBS.map(name => {
      const pin = pins.includes(name) ? PIN : '';
      const steps = afterSetup ? SETUP + pin : pin + SETUP;
      return `  ${name}:\n    runs-on: ${runner}\n    steps:\n${steps}      - run: existing\n`;
    }).join('')
  );
}
const before = workflow({ pins: [] });
const after = workflow();

test('modularity permits only the three exact additive staging DNS steps', () => {
  assert.equal(isStagingDnsPinAddition(FILE, before, after), true);
  assert.equal(isStagingDnsPinAddition(FILE, after, after), false);
  assert.equal(isStagingDnsPinAddition(FILE, after, before), false);
  assert.equal(isStagingDnsPinAddition('.github/workflows/ci.yml', before, after), false);
});

test('placement, runner, production, command, permission and unrelated changes stay blocked', () => {
  const rejected = [
    workflow({ pins: JOBS }),
    workflow({ pins: ['deploy-staging'] }),
    workflow({ afterSetup: false }),
    workflow({ runner: 'self-hosted' }),
    after.replace('pin-staging-dns.mjs', 'pin-staging-dns.mjs --host other'),
    after.replace('run: existing', 'run: changed'),
    after.replace('    steps:', '    permissions: write-all\n    steps:'),
    after.replace('        run: node', '        env: { EXTRA: unsafe }\n        run: node'),
    after + '\n# unrelated edit\n',
  ];
  for (const current of rejected)
    assert.equal(isStagingDnsPinAddition(FILE, before, current), false);
  assert.equal(
    isStagingDnsPinAddition(
      FILE,
      workflow({ pins: [], runner: 'self-hosted' }),
      workflow({ runner: 'self-hosted' })
    ),
    false
  );
});
