import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { compareMachine } from './verify-machine-compare.mjs';
import {
  FIXTURE_DIGEST,
  FIXTURE_HARDWARE_SHA256,
  fixtureLive,
  fixtureMarker,
} from './verify-machine-fixtures.mjs';
import {
  parseContainer,
  parsePlatformUuid,
  probeMachine,
  readCiPostgresDigest,
} from './verify-machine-probe.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('a machine that matches its marker has no differences', () => {
  assert.deepEqual(compareMachine(fixtureMarker(), fixtureLive()), []);
  assert.deepEqual(compareMachine(fixtureMarker(), fixtureLive(), { phase: 'stamp' }), []);
});

test('each recorded field is compared on its own, and the hardware id is never printed', () => {
  const cases = [
    [
      { hardwareUuidSha256: 'd'.repeat(64) },
      'machine.hardware_uuid_sha256 does not match this machine',
    ],
    [{ arch: 'x64' }, 'machine.arch: marker arm64, this run x64'],
    [{ os: { version: '98.0', build: '99Z901' } }, 'os.version: marker 99.1, this run 98.0'],
    [{ os: { version: '99.1', build: '98A1' } }, 'os.build: marker 99Z901, this run 98A1'],
    [{ node: 'v24.98.0' }, 'node: marker v24.99.0, this run v24.98.0'],
    [{ pnpm: null }, 'pnpm: marker 10.99.0, this run none'],
    [
      { container: { context: 'desktop-linux', engine: '99.0.0' } },
      'container_runtime.context: marker orbstack, this run desktop-linux',
    ],
    [
      { container: { context: 'orbstack', engine: '98.0.0' } },
      'container_runtime.engine: marker 99.0.0, this run 98.0.0',
    ],
  ];
  for (const [override, message] of cases) {
    const errors = compareMachine(fixtureMarker(), fixtureLive(override));
    assert.deepEqual(errors, [message]);
    assert.ok(!errors.join('\n').includes(FIXTURE_HARDWARE_SHA256));
  }
});

test('low disk and a dirty tree fail at begin; stamp re-checks tracked files only', () => {
  const live = fixtureLive({ freeGib: { repository: 120, system: 19.9 } });
  live.git = { ...live.git, clean: false };
  assert.deepEqual(compareMachine(fixtureMarker(), live), [
    'free disk on system is 19.9 GiB, below 20 GiB',
    'the working tree is not clean',
  ]);
  assert.deepEqual(compareMachine(fixtureMarker(), live, { phase: 'stamp' }), []);
  live.git = { ...live.git, trackedClean: false };
  assert.deepEqual(compareMachine(fixtureMarker(), live, { phase: 'stamp' }), [
    'tracked files changed during the run',
  ]);
  // An edit git status cannot see (assume-unchanged or skip-worktree) is never clean.
  const hidden = fixtureLive({ git: { ...fixtureLive().git, hiddenFromStatus: 1 } });
  const hiddenError =
    'tracked files are hidden from git status (assume-unchanged or skip-worktree)';
  assert.deepEqual(compareMachine(fixtureMarker(), hidden), [hiddenError]);
  assert.deepEqual(compareMachine(fixtureMarker(), hidden, { phase: 'stamp' }), [hiddenError]);
  assert.ok(
    compareMachine(fixtureMarker(), fixtureLive({ freeGib: { repository: Number.NaN } })).includes(
      'free disk on repository is NaN GiB, below 20 GiB'
    )
  );
});

test('the database container must run the pinned CI image on the recorded binding only', () => {
  assert.deepEqual(compareMachine(fixtureMarker(), fixtureLive({ database: null })), [
    'database container ida-mac-verify-pg was not found',
  ]);
  const live = fixtureLive({
    database: { image: 'postgres:16', running: false, bindings: [] },
    ciPostgresDigest: `sha256:${'e'.repeat(64)}`,
  });
  assert.deepEqual(compareMachine(fixtureMarker(), live), [
    `database.image: marker postgres:16@${FIXTURE_DIGEST}, this run postgres:16`,
    'database container ida-mac-verify-pg is not running',
    'database container is not published on 127.0.0.1:55438',
    'database.image digest differs from the CI postgres service image',
  ]);
  const extra = fixtureLive();
  extra.database = {
    ...extra.database,
    bindings: [
      ...extra.database.bindings,
      { containerPort: '5432/tcp', hostIp: '0.0.0.0', hostPort: '55439' },
      { containerPort: '8080/tcp', hostIp: '127.0.0.1', hostPort: '55438' },
    ],
  };
  assert.deepEqual(compareMachine(fixtureMarker(), extra), [
    'database container publishes 5432/tcp on 0.0.0.0:55439; only 5432/tcp on 127.0.0.1:55438 is allowed',
    'database container publishes 8080/tcp on 127.0.0.1:55438; only 5432/tcp on 127.0.0.1:55438 is allowed',
  ]);
  assert.ok(
    compareMachine(fixtureMarker(), fixtureLive({ ciPostgresDigest: null })).includes(
      'the CI postgres image digest could not be read'
    )
  );
});

test('probe parsers read ioreg, every docker binding and the CI workflow', () => {
  assert.equal(parsePlatformUuid('  "IOPlatformUUID" = "ABC-123"\n'), 'ABC-123');
  assert.equal(parsePlatformUuid(''), null);
  const ports = JSON.stringify({
    '5432/tcp': [
      { HostIp: '127.0.0.1', HostPort: '55438' },
      { HostIp: '0.0.0.0', HostPort: '55439' },
    ],
    '9000/tcp': null,
  });
  assert.deepEqual(parseContainer(`postgres:16@${FIXTURE_DIGEST}|true|${ports}`), {
    image: `postgres:16@${FIXTURE_DIGEST}`,
    running: true,
    bindings: [
      { containerPort: '5432/tcp', hostIp: '127.0.0.1', hostPort: '55438' },
      { containerPort: '5432/tcp', hostIp: '0.0.0.0', hostPort: '55439' },
    ],
  });
  assert.equal(parseContainer(null), null);
  assert.deepEqual(parseContainer('img|false|not-json').bindings, []);
  assert.match(readCiPostgresDigest(REPO_ROOT), /^sha256:[0-9a-f]{64}$/u);
  assert.equal(readCiPostgresDigest('/nonexistent-root'), null);
});

test('the probe hashes the hardware id and keeps only the guarded environment keys', () => {
  const outputs = new Map([
    ['ioreg', '"IOPlatformUUID" = "UUID-1"'],
    ['sw_vers -productVersion', '99.1'],
    ['sw_vers -buildVersion', '99Z901'],
    ['pnpm --version', '10.99.0'],
    ['docker context show', 'orbstack'],
    ['git rev-parse HEAD', 'c'.repeat(40)],
    ['git status --porcelain=v1 --untracked-files=no', ''],
    ['git status --porcelain=v1 --untracked-files=all', '?? new.txt'],
    ['git ls-files -v -z', 'H package.json\0h README.md\0S docs/a.md\0H b.md\0'],
    [
      'git ls-files -z --others -- :(glob,icase)**/.env :(glob,icase)**/.env.*',
      // A name git would quote in line output (tmp/café/.env) is listed as is.
      '.env.local\0docker/.env\0tmp/café/.env\0',
    ],
  ]);
  const exec = (command, args) => {
    const key = command === 'ioreg' ? 'ioreg' : [command, ...args].join(' ');
    if (!outputs.has(key)) throw new Error(`unavailable: ${key}`);
    return outputs.get(key);
  };
  const live = probeMachine({
    repoRoot: REPO_ROOT,
    marker: fixtureMarker(),
    env: {
      PW_PORT: '3310',
      KS_HOST: 'ks.127.0.0.1.nip.io:3310',
      HOME: '/Users/someone',
      PGPORT: '54322',
      DOTENV_CONFIG_OVERRIDE: 'true',
      GIT_LITERAL_PATHSPECS: '1',
      GIT_EDITOR: 'true',
    },
    exec,
    statfs: () => ({ bavail: 30n * 1024n, bsize: 1024n * 1024n }),
  });
  assert.equal(live.hardwareUuidSha256.length, 64);
  assert.ok(!JSON.stringify(live).includes('UUID-1'));
  assert.equal(live.container.engine, null);
  assert.equal(live.database, null);
  assert.deepEqual(live.freeGib, { repository: 30, system: 30 });
  assert.deepEqual(live.git, {
    head: 'c'.repeat(40),
    trackedClean: true,
    clean: false,
    hiddenFromStatus: 2,
  });
  assert.equal(live.env.KS_HOST, 'ks.127.0.0.1.nip.io:3310');
  assert.ok(!Object.hasOwn(live.env, 'HOME'));
  assert.deepEqual(live.sources, {
    localFiles: ['.env.local', 'docker/.env', 'tmp/café/.env'],
    redirecting: ['DOTENV_CONFIG_OVERRIDE', 'GIT_LITERAL_PATHSPECS', 'PGPORT'],
  });
  assert.ok(!JSON.stringify(live.sources).includes('54322'));
});
