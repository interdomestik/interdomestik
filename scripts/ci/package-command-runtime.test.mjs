import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './fixtures/package-command-fixture.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const databaseCommand = join(root, 'scripts/database-command.mjs');

test('package wrappers reject relative and empty executable search directories', t => {
  const current = fixture(t);
  for (const prefix of ['.', 'relative-bin', '']) {
    const result = run(databaseCommand, ['generate'], {
      PATH: `${prefix}:${current.directory}:${process.env.PATH}`,
      FAKE_COMMAND_CAPTURE: current.capturePath,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refused relative or empty/);
    assert.equal(existsSync(current.capturePath), false);
  }
});

test('package wrappers exclude shared-writable search directories and their interpreters', t => {
  const unsafe = fixture(t, 'node');
  chmodSync(unsafe.directory, 0o777);
  const safe = fixture(t);
  const result = run(databaseCommand, ['generate'], {
    PATH: `${unsafe.directory}:${safe.directory}:${process.env.PATH}`,
    FAKE_COMMAND_CAPTURE: safe.capturePath,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(safe.capturePath, 'utf8')), [
    '--filter',
    '@interdomestik/database',
    'run',
    'generate',
  ]);
});

test('package wrappers refuse writable executables and symlinks to unsafe installations', t => {
  const writable = fixture(t);
  chmodSync(writable.executable, 0o777);
  const link = fixture(t, 'placeholder');
  symlinkSync(writable.executable, join(link.directory, 'pnpm'));
  for (const directory of [writable.directory, link.directory]) {
    const result = run(databaseCommand, ['generate'], {
      PATH: `${directory}:${process.env.PATH}`,
      FAKE_COMMAND_CAPTURE: writable.capturePath,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refused an untrusted/);
    assert.equal(existsSync(writable.capturePath), false);
  }
});

test('package wrappers support safe symlinked installations and real pnpm shebang lookup', t => {
  const safe = fixture(t);
  const link = fixture(t, 'placeholder');
  symlinkSync(safe.executable, join(link.directory, 'pnpm'));
  const result = run(databaseCommand, ['generate'], {
    PATH: `${link.directory}:${process.env.PATH}`,
    FAKE_COMMAND_CAPTURE: safe.capturePath,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(safe.capturePath));
  // Read-only invocation of the installed pnpm, through exactly the production boundary.
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import { spawnSync } from 'node:child_process';
    import { realpathSync } from 'node:fs';
    import { packageCommandRuntime } from './scripts/package-command-runtime.mjs';
    const runtime = packageCommandRuntime('pnpm');
    const node = spawnSync('node', ['-p', 'process.execPath'], {env: runtime.env, encoding: 'utf8'});
    if (node.status !== 0 || realpathSync(node.stdout.trim()) !== realpathSync(process.execPath)) process.exit(2);
    const child = spawnSync(runtime.executable, ['--version'], {env: runtime.env, stdio: 'inherit'});
    process.exit(child.status ?? 1);
  `,
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /10\.28\.2/);
});

test('package wrappers explain how to recover when no safe executable exists', t => {
  const empty = fixture(t, 'placeholder');
  const result = run(databaseCommand, ['generate'], { PATH: empty.directory });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /No safe pnpm executable found\. Install it in an absolute PATH directory/
  );
});
