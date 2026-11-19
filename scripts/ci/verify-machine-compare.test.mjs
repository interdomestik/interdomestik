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

function withEnv(env) {
  const live = fixtureLive();
  return fixtureLive({ env: { ...live.env, ...env } });
}

test('a machine that matches its marker has no differences', () => {
  assert.deepEqual(compareMachine(fixtureMarker(), fixtureLive()), []);
});

test('every recorded field is compared, and the hardware id is never printed', () => {
  const live = fixtureLive({
    hardwareUuidSha256: 'd'.repeat(64),
    os: { version: '27.3', build: '26C1' },
    node: 'v24.16.0',
    pnpm: null,
    container: { context: 'desktop-linux', engine: '29.8.2' },
  });
  const errors = compareMachine(fixtureMarker(), live);
  assert.deepEqual(errors, [
    'machine.hardware_uuid_sha256 does not match this machine',
    'os.version: marker 27.2.1, this run 27.3',
    'os.build: marker 26B131, this run 26C1',
    'node: marker v24.15.0, this run v24.16.0',
    'pnpm: marker 10.28.2, this run none',
    'container_runtime.context: marker orbstack, this run desktop-linux',
  ]);
  assert.ok(!errors.join('\n').includes(FIXTURE_HARDWARE_SHA256));
});

test('the shared database port and the default fallback are refused', () => {
  const shared = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ E2E_DATABASE_URL: shared })), [
    'E2E_DATABASE_URL uses forbidden port 54322',
    'E2E_DATABASE_URL port is not 55438',
    'E2E_DATABASE_URL database is not interdomestik_test',
  ]);
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ DATABASE_URL: '' })), [
    'DATABASE_URL must be set; the default fallback is the shared database on 54322',
  ]);
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ DATABASE_URL_RLS: 'nope' })), [
    'DATABASE_URL_RLS is not a URL',
  ]);
  const remote = 'postgresql://u:p@db.example.test:55438/interdomestik_test';
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ DATABASE_URL: remote })), [
    'DATABASE_URL host is not 127.0.0.1',
  ]);
});

test('the app port must be the recorded one, never 3000', () => {
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ PW_PORT: '3000' })), [
    'PW_PORT uses forbidden port 3000',
  ]);
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ PW_PORT: '' })), [
    'PW_PORT must be set to 3310',
  ]);
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ PW_PORT: '3311' })), [
    'PW_PORT is not 3310',
  ]);
  assert.deepEqual(compareMachine(fixtureMarker(), withEnv({ PILOT_HOST: 'pilot.x:3000' })), [
    'PILOT_HOST does not use port 3310',
  ]);
});

test('Sentry upload credentials, low disk and a dirty tree each fail the gate', () => {
  const live = withEnv({ SENTRY_AUTH_TOKEN: 'set' });
  live.freeGib = { repository: 120, system: 19.9 };
  live.git = { ...live.git, clean: false };
  assert.deepEqual(compareMachine(fixtureMarker(), live), [
    'SENTRY_AUTH_TOKEN must be unset for gate evidence',
    'free disk on system is 19.9 GiB, below 20 GiB',
    'the working tree is not clean',
  ]);
});

test('the database container must run the pinned CI image on the recorded binding', () => {
  assert.deepEqual(compareMachine(fixtureMarker(), fixtureLive({ database: null })), [
    'database container ida-mac-verify-pg was not found',
  ]);
  const live = fixtureLive({
    database: { image: 'postgres:16', running: false, hostIp: '0.0.0.0', hostPort: '5432' },
    ciPostgresDigest: `sha256:${'e'.repeat(64)}`,
  });
  assert.deepEqual(compareMachine(fixtureMarker(), live), [
    `database.image: marker postgres:16@${FIXTURE_DIGEST}, this run postgres:16`,
    'database container ida-mac-verify-pg is not running',
    'database container is not published on 127.0.0.1',
    'database container is not published on port 55438',
    'database.image digest differs from the CI postgres service image',
  ]);
  assert.ok(
    compareMachine(fixtureMarker(), fixtureLive({ ciPostgresDigest: null })).includes(
      'the CI postgres image digest could not be read'
    )
  );
});

test('probe parsers read ioreg, docker inspect and the CI workflow', () => {
  assert.equal(parsePlatformUuid('  "IOPlatformUUID" = "ABC-123"\n'), 'ABC-123');
  assert.equal(parsePlatformUuid(''), null);
  const ports = JSON.stringify({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55438' }] });
  assert.deepEqual(parseContainer(`postgres:16@${FIXTURE_DIGEST}|true|${ports}`), {
    image: `postgres:16@${FIXTURE_DIGEST}`,
    running: true,
    hostIp: '127.0.0.1',
    hostPort: '55438',
  });
  assert.equal(parseContainer(null), null);
  assert.equal(parseContainer('img|false|not-json').hostPort, null);
  assert.match(readCiPostgresDigest(REPO_ROOT), /^sha256:[0-9a-f]{64}$/u);
  assert.equal(readCiPostgresDigest('/nonexistent-root'), null);
});

test('the probe hashes the hardware id and keeps only the listed environment keys', () => {
  const outputs = new Map([
    ['ioreg', '"IOPlatformUUID" = "UUID-1"'],
    ['sw_vers -productVersion', '27.2.1'],
    ['sw_vers -buildVersion', '26B131'],
    ['pnpm --version', '10.28.2'],
    ['docker context show', 'orbstack'],
    ['git rev-parse HEAD', 'c'.repeat(40)],
    ['git status --porcelain=v1 --untracked-files=no', ''],
    ['git status --porcelain=v1 --untracked-files=all', '?? new.txt'],
  ]);
  const exec = (command, args) => {
    const key = command === 'ioreg' ? 'ioreg' : [command, ...args].join(' ');
    if (!outputs.has(key)) throw new Error(`unavailable: ${key}`);
    return outputs.get(key);
  };
  const live = probeMachine({
    repoRoot: REPO_ROOT,
    marker: fixtureMarker(),
    env: { PW_PORT: '3310', HOME: '/Users/someone' },
    exec,
    statfs: () => ({ bavail: 30n * 1024n, bsize: 1024n * 1024n }),
  });
  assert.equal(live.hardwareUuidSha256.length, 64);
  assert.ok(!JSON.stringify(live).includes('UUID-1'));
  assert.equal(live.container.engine, null);
  assert.equal(live.database, null);
  assert.deepEqual(live.freeGib, { repository: 30, system: 30 });
  assert.deepEqual(live.git, { head: 'c'.repeat(40), trackedClean: true, clean: false });
  assert.equal(live.env.PW_PORT, '3310');
  assert.ok(!Object.hasOwn(live.env, 'HOME'));
});
