import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './fixtures/package-command-fixture.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));

for (const failure of ['pr:verify', 'security:guard', 'none']) {
  test(`verify-slice required gates propagate ${failure} without duplicate E2E`, t => {
    const current = fixture(t);
    const scripts = join(current.directory, 'scripts/multi-agent');
    mkdirSync(scripts, { recursive: true });
    for (const name of ['verify-slice.sh', 'pr-hardening-common.sh'])
      copyFileSync(join(root, 'scripts/multi-agent', name), join(scripts, name));
    writeFileSync(join(current.directory, 'git'), '#!/bin/sh\necho fixture-branch\n');
    chmodSync(join(current.directory, 'git'), 0o755);
    writeFileSync(
      current.executable,
      `#!/bin/sh
printf '%s\\n' "$*" >> "$FIXTURE_CALLS"
case "$1" in
  pr:verify|security:guard) ;;
  *) exit 99 ;;
esac
if [ "$1" = "$FIXTURE_FAILURE" ]; then exit 23; fi
exit 0
`
    );
    const calls = join(current.directory, 'calls');
    const result = spawnSync(
      'bash',
      [
        join(scripts, 'verify-slice.sh'),
        '--required-gates',
        '--run-root',
        join(current.directory, 'evidence'),
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: `${current.directory}:${process.env.PATH}`,
          FIXTURE_CALLS: calls,
          FIXTURE_FAILURE: failure,
        },
      }
    );
    assert.equal(result.status, failure === 'none' ? 0 : 23, result.stdout + result.stderr);
    if (failure !== 'none') assert.doesNotMatch(result.stdout, /\[verify-slice\] PASS/);
    assert.deepEqual(
      readFileSync(calls, 'utf8').trim().split('\n'),
      failure === 'pr:verify' ? ['pr:verify'] : ['pr:verify', 'security:guard']
    );
  });
}
