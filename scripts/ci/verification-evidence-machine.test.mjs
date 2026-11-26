import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { head, lockfile, tree } from './verification-evidence-test-fixture.mjs';
import { DISPATCH_DIR_ENV, QUEUE_SCOPE_ENV } from './verification-evidence/m4-dispatch.mjs';
import { checkDocker } from './verification-evidence/machine.mjs';
import {
  checkManifest,
  DELEGATED,
  FULL_CHAIN,
  M4_SCRIPT,
  MANIFEST,
  SECURITY_CHAIN,
} from './verification-evidence/manifest.mjs';
import { checkGitInputs } from './verification-evidence/ticket.mjs';
import { contractBash, delegatedGitEnvironment } from './verification-evidence/worker-profile.mjs';
import { fixtureMarker, FIXTURE_DIGEST } from './verify-machine-fixtures.mjs';
import { harness, MARKER_SHA, packageJson, trusted } from './verify-machine-harness.mjs';
import {
  DELEGATED_MARKER_SCHEMA,
  MACHINE_ROLES,
  validateMarker,
} from './verify-machine-marker.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'verification-evidence-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('the manifest covers the unchanged full chain and the build within full E2E', t => {
  checkManifest(repo);
  assert.equal(packageJson.scripts['pr:verify'], FULL_CHAIN);
  assert.equal(packageJson.scripts['security:guard'], SECURITY_CHAIN);
  assert.equal(new Set(MANIFEST.map(([, id]) => id)).size, MANIFEST.length);
  assert.deepEqual(
    DELEGATED.map(([, , command]) => command),
    [
      'pnpm repo:size:check',
      'pnpm test:ci:contracts:parallel',
      'pnpm test:release-gate',
      'pnpm check:e2e-contracts',
      'pnpm lint:production-warnings',
      'pnpm db:migrations:check-journal',
      'pnpm i18n:check',
      'pnpm i18n:purity:check',
      'pnpm check:tenant-guard',
      'pnpm check:architecture-boundaries',
    ]
  );
  assert.match(packageJson.scripts['e2e:gate'], /run-e2e-lane\.mjs gate$/u);
  const runner = readFileSync(path.join(repo, 'scripts/run-e2e-lane.mjs'), 'utf8');
  assert.match(runner, /gate: gateLane\(\[ksSq, mkMk\], true, fullGateWorkers\)/u);
  assert.match(runner, /const gateLane = [^\n]+\n\s+gatekeeper: true,/u);
  assert.match(runner, /lane\.gatekeeper\) await run\('bash', \['scripts\/m4-gatekeeper\.sh'\]/u);
  const build = readFileSync(path.join(repo, 'scripts/m4-gatekeeper.sh'), 'utf8');
  assert.match(
    build,
    /pnpm db:migrate[\s\S]+pnpm seed:e2e[\s\S]+pnpm --filter @interdomestik\/web build/u
  );
  const root = temporary(t);
  const mutated = structuredClone(packageJson);
  mutated.scripts[M4_SCRIPT] = mutated.scripts[M4_SCRIPT].replace('pnpm coverage:gate && ', '');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(mutated));
  assert.throws(() => checkManifest(root), /manifest/u);
});

test('the reserved M5 account retains only the exact Git admission and enrolled Bash', t => {
  const worker = '_interdomestik_gate_worker';
  const root = temporary(t);
  const checkout = realpathSync(root);
  const base = { PATH: '/usr/bin:/bin' };
  const workerEnv = {
    INTERDOMESTIK_M5_CHECKOUT: checkout,
    INTERDOMESTIK_M5_BASH: '/tools/bash',
    GIT_DIR: '/wrong',
    GIT_CONFIG_KEY_0: 'core.fsmonitor',
    GIT_CONFIG_VALUE_0: '/wrong',
  };
  const env = delegatedGitEnvironment(base, workerEnv, worker);
  const gitConfig = execFileSync('/usr/bin/git', ['config', '--get-all', 'safe.directory'], {
    cwd: checkout,
    env,
    encoding: 'utf8',
  });
  assert.equal(gitConfig.trim(), checkout);
  assert.equal(env.GIT_DIR, undefined);
  assert.equal(env.GIT_OPTIONAL_LOCKS, '0');
  assert.equal(env.GIT_NO_REPLACE_OBJECTS, '1');
  assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(contractBash('/bin/bash', workerEnv, worker), '/tools/bash');
  assert.equal(contractBash('/bin/bash', workerEnv, 'ordinary'), '/bin/bash');
  assert.equal(delegatedGitEnvironment(base, workerEnv, 'ordinary'), base);
  for (const bad of ['', '*', 'relative', `${checkout}/*`]) {
    assert.throws(
      () => delegatedGitEnvironment(base, { INTERDOMESTIK_M5_CHECKOUT: bad }, worker),
      /exact Git checkout/u
    );
  }
  for (const bad of [undefined, '', 'unresolved/bash']) {
    assert.throws(
      () => contractBash('/bin/bash', { INTERDOMESTIK_M5_BASH: bad }, worker),
      /enrolled Bash/u
    );
  }
});

test('M5 Docker admission refuses runtime, socket, readiness, image and port changes', () => {
  const imageId = `sha256:${'1'.repeat(64)}`;
  const marker = fixtureMarker();
  marker.container_runtime.socket = 'unix:///slot-A.sock';
  const fixture = {
    context: 'orbstack',
    socket: marker.container_runtime.socket,
    engine: '99.0.0',
    image: marker.database.image,
    digests: [marker.database.image],
    host: '127.0.0.1',
    port: String(marker.database.port),
    ready: true,
  };
  function check(overrides) {
    const f = { ...fixture, ...overrides };
    const exec = (_command, args) => {
      if (args[0] === 'context') return args[1] === 'show' ? f.context : JSON.stringify(f.socket);
      const command = args[2];
      if (command === 'version') return f.engine;
      if (command === 'ps') return `${'c'.repeat(64)}\t${marker.database.container}`;
      if (command === 'image') return JSON.stringify(f.digests);
      if (command === 'inspect')
        return args[4] === '{{.Image}}'
          ? imageId
          : `${f.image}|true|${JSON.stringify({ '5432/tcp': [{ HostIp: f.host, HostPort: f.port }] })}`;
      if (args.includes('pg_isready')) {
        if (!f.ready) throw new Error('unavailable');
        return '';
      }
      return JSON.stringify([marker.database.name]);
    };
    return checkDocker(repo, marker, exec, () => FIXTURE_DIGEST);
  }
  assert.equal(check({}).imageId, imageId);
  for (const changed of [
    { context: 'default' },
    { socket: 'tcp://localhost' },
    { engine: null },
    { ready: false },
    { digests: [] },
    { host: '0.0.0.0' },
    { port: '54322' },
  ]) {
    assert.throws(() => check(changed), /container-runtime|database-/u);
  }
});

test('the observed checkout and committed lockfile must agree at both ends', t => {
  const root = temporary(t);
  const git = (...args) =>
    execFileSync(
      '/usr/bin/git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      {
        cwd: root,
        env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    ).trim();
  git('init', '-q');
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'fixture lockfile\n');
  git('add', 'pnpm-lock.yaml');
  git('commit', '-qm', 'base');
  const main = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', main);
  git('commit', '--allow-empty', '-qm', 'reviewed head');
  const head = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const merge = git('commit-tree', tree, '-p', main, '-p', head, '-m', 'tested merge');
  const identity = { head, main, tree, merge: { commit: merge, tree, parents: [main, head] } };
  assert.deepEqual(checkGitInputs(root, identity, true), {
    head,
    main,
    tree,
    lockfileSha256: lockfile,
  });
  assert.throws(
    () => checkGitInputs(root, { ...identity, tree: 'e'.repeat(40) }, true),
    /git-drift/u
  );
  writeFileSync(path.join(root, 'untracked'), 'fixture');
  assert.throws(() => checkGitInputs(root, identity, true), /checkout-dirty/u);
  assert.equal(checkGitInputs(root, identity, false).head, head);
  for (const flag of ['assume-unchanged', 'skip-worktree']) {
    git('update-index', `--${flag}`, 'pnpm-lock.yaml');
    assert.throws(() => checkGitInputs(root, identity, false), /hidden-index/u);
    git('update-index', `--no-${flag}`, 'pnpm-lock.yaml');
  }
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'another lockfile\n');
  assert.throws(() => checkGitInputs(root, identity, false), /checkout-dirty/u);
  git('restore', 'pnpm-lock.yaml');
  git('update-ref', 'refs/remotes/origin/main', head);
  assert.throws(() => checkGitInputs(root, identity, false), /git-drift/u);
  git('update-ref', 'refs/remotes/origin/main', main);
  git('commit', '--allow-empty', '-qm', 'same tree different head');
  assert.throws(() => checkGitInputs(root, identity, false), /git-drift/u);
});

test('composed stamps require both marked M4 and the same receipt at begin and finish', t => {
  const h = harness({
    marker: trusted(),
    env: {
      npm_lifecycle_event: M4_SCRIPT,
      [DISPATCH_DIR_ENV]: '/fixture',
      [QUEUE_SCOPE_ENV]: '{}',
    },
  });
  t.after(h.cleanup);
  const scope = {
    markerSha256: MARKER_SHA,
    head,
    tree,
    base: 'd'.repeat(40),
    m5ReceiptSha256: 'f'.repeat(64),
  };
  const runId = 'run-fixture';
  h.deps.verifyComposition = () => ({ scope, runId });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  h.deps.verifyComposition = () => ({
    scope: { ...scope, m5ReceiptSha256: 'a'.repeat(64) },
    runId,
  });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  h.deps.verifyComposition = () => ({ scope, runId: 'different-run' });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  h.state.marker = { status: 'absent' };
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  h.state.marker = trusted();
  h.deps.verifyComposition = () => ({ scope, runId });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.deepEqual(h.readFinal().composition, scope);
  assert.equal(h.readFinal().machineRole, 'm4');
  assert.equal(h.readFinal().runId, runId);
});

test('composed verification refuses a missing collection and a zero-exit hosted shortcut', t => {
  const h = harness({ marker: trusted(), env: { npm_lifecycle_event: M4_SCRIPT } });
  t.after(h.cleanup);
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 1);
  h.deps.env[DISPATCH_DIR_ENV] = '/fixture';
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 1);
  h.deps.env[QUEUE_SCOPE_ENV] = '{}';
  h.deps.env.GITHUB_ACTIONS = 'true';
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  assert.deepEqual(h.files(), []);
});

test('an M5 marker cannot issue full M4 stamps or use a second slot', t => {
  const marker = fixtureMarker({
    schema: DELEGATED_MARKER_SCHEMA,
    role: MACHINE_ROLES.m5,
    slot: 'A',
    tool_path: '/fixture/bin:/usr/bin',
    executables: {
      node: '/fixture/bin/node',
      pnpm: '/fixture/bin/pnpm',
      bash: '/fixture/bin/bash',
    },
    bash_version: '5.2.1',
  });
  marker.container_runtime.socket = 'unix:///fixture.sock';
  assert.deepEqual(validateMarker(marker), []);
  assert.ok(validateMarker({ ...marker, slot: 'B' }).length > 0);
  assert.ok(validateMarker({ ...marker, bash_version: '3.2.57' }).length > 0);
  for (const [script, lane] of [
    ['pr:verify', 'pr-verify'],
    ['security:guard', 'security-guard'],
  ]) {
    const h = harness({ marker: trusted(marker), env: { npm_lifecycle_event: script } });
    t.after(h.cleanup);
    assert.equal(runVerifyMachine(['begin', lane], h.deps), 0);
    assert.equal(runVerifyMachine(['stamp', lane], h.deps), 0);
    assert.equal(h.readFinal().mode, 'PRE-CHECK');
  }
});
