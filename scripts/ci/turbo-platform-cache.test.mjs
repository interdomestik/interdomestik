import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = process.cwd();
const generator = path.join(repoRoot, 'scripts/ci/create-turbo-cache-key.mjs');
const wrapperFixture = path.join(repoRoot, 'scripts/ci/fixtures/run-turbo-child.mjs');

function withTemporaryDirectory(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'interdomestik-turbo-cache-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test('platform key generator writes only deterministic host fields', () => {
  withTemporaryDirectory(directory => {
    const result = spawnSync(process.execPath, [generator], {
      cwd: directory,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const key = JSON.parse(readFileSync(path.join(directory, 'turbo-cache-key.json'), 'utf8'));
    assert.deepEqual(key, {
      platform: process.platform,
      arch: process.arch,
      nodeMajor: Number.parseInt(process.versions.node.split('.')[0], 10),
    });
  });
});

test('turbo wrapper preserves a nonzero child exit code', () => {
  withTemporaryDirectory(directory => {
    const result = spawnSync(process.execPath, [wrapperFixture, 'exit', '7'], {
      cwd: directory,
      encoding: 'utf8',
    });

    assert.equal(result.status, 7, result.stderr);
  });
});

test('turbo wrapper re-raises a child termination signal', () => {
  withTemporaryDirectory(directory => {
    const result = spawnSync(process.execPath, [wrapperFixture, 'signal', 'SIGTERM'], {
      cwd: directory,
      encoding: 'utf8',
    });

    assert.equal(result.status, null, result.stderr);
    assert.equal(result.signal, 'SIGTERM');
  });
});

test('turbo wrapper invokes the repository-pinned binary outside pnpm', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/ci/run-turbo.mjs'), '--version'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^2\.10\.7\s*$/u);
});

test('turbo wrapper bypasses platform-specific command shims', () => {
  const wrapper = readFileSync(path.join(repoRoot, 'scripts/ci/run-turbo.mjs'), 'utf8');

  assert.match(wrapper, /node_modules', 'turbo', 'bin', 'turbo/u);
  assert.doesNotMatch(wrapper, /turbo\.cmd/u);
});

test('turbo wrapper anchors the key and binary to the repository root', () => {
  withTemporaryDirectory(directory => {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts/ci/run-turbo.mjs'), '--version'],
      {
        cwd: directory,
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(directory, 'turbo-cache-key.json')), false);
  });
});

test('turbo config isolates platform hashes and worktree-local artifacts', () => {
  const turboConfig = JSON.parse(readFileSync(path.join(repoRoot, 'turbo.json'), 'utf8'));
  const protectedSecrets = ['TURBO_TOKEN', 'TURBO_TEAM', 'TURBO_REMOTE_CACHE_SIGNATURE_KEY'];

  assert.ok(turboConfig.globalEnv.includes('INTERDOMESTIK_TURBO_PLATFORM_KEY'));
  assert.ok(!turboConfig.globalDependencies.includes('turbo-cache-key.json'));
  assert.equal(turboConfig.cacheDir, '.turbo/cache');
  assert.equal(turboConfig.remoteCache?.signature, true);
  assert.equal(turboConfig.futureFlags?.longerSignatureKey, true);
  for (const secret of protectedSecrets) {
    assert.ok(!turboConfig.globalEnv.includes(secret), `${secret} must not affect task hashes`);
  }
});

test('all supported root turbo entrypoints generate the platform key first', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const bypasses = Object.entries(packageJson.scripts)
    .filter(([, command]) => /(^|[;&|\s])turbo(?:\s|$)/u.test(command))
    .map(([name]) => name);

  assert.deepEqual(bypasses, []);
  assert.equal(packageJson.devDependencies.turbo, '2.10.7');
});
test('generated platform key is ignored by Git', () => {
  const result = spawnSync('git', ['check-ignore', '--quiet', 'turbo-cache-key.json'], {
    cwd: repoRoot,
  });

  assert.equal(result.status, 0);
});
