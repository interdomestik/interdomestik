import assert from 'node:assert/strict';
import cp, { spawnSync } from 'node:child_process';
import fs, { chmodSync, existsSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './fixtures/package-command-fixture.mjs';
import { checkedPackageExecutable, packageCommandRuntime } from '../package-command-runtime.mjs';
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
    assert.throws(() => checkedPackageExecutable(join(directory, 'pnpm')), /refused an untrusted/);
    assert.equal(existsSync(writable.capturePath), false);
  }
});

test('package wrappers support safe symlinked installations and real pnpm shebang lookup', t => {
  const safe = fixture(t);
  const link = fixture(t, 'placeholder');
  symlinkSync(safe.executable, join(link.directory, 'pnpm'));
  assert.equal(
    checkedPackageExecutable(join(link.directory, 'pnpm')),
    realpathSync(safe.executable)
  );
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

test('package wrappers explain how to recover when no supported executable exists', t => {
  t.mock.method(fs, 'lstatSync', () => {
    throw Object.assign(new Error('missing fixture'), { code: 'ENOENT' });
  });
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => packageCommandRuntime('pnpm'),
      /No safe pnpm executable found\. This repository requires pnpm@10\.28\.2/
    );
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('package wrappers refuse mismatched pnpm before any operational command', t => {
  t.mock.method(cp, 'spawnSync', () => ({ status: 0, stdout: '0.0.0\n' }));
  syncBuiltinESMExports();
  try {
    assert.throws(() => packageCommandRuntime('pnpm'), /requires pnpm@10\.28\.2/);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('caller PATH cannot select a pnpm executable even from an owned directory', t => {
  const injected = fixture(t);
  const previous = process.env.PATH;
  process.env.PATH = `${injected.directory}:${previous}`;
  try {
    assert.notEqual(packageCommandRuntime('pnpm').executable, realpathSync(injected.executable));
    assert.equal(existsSync(injected.capturePath), false);
  } finally {
    process.env.PATH = previous;
  }
});

test('the current Node installation is the explicit CI toolcache trust anchor', t => {
  const executable = realpathSync(process.execPath);
  const anchor = dirname(dirname(executable));
  const original = fs.statSync;
  t.mock.method(fs, 'statSync', file => {
    assert.notEqual(file, dirname(anchor), 'must not inspect unrelated toolcache ancestors');
    return original(file);
  });
  syncBuiltinESMExports();
  try {
    assert.equal(checkedPackageExecutable(executable), executable);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
