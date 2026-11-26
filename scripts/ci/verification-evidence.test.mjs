import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { approved, authorityFixture, evidenceFixture, head, lockfile, now, tree }
  from './verification-evidence-test-fixture.mjs';
import { EVIDENCE_DIR_ENV, checkRecordPair } from './verification-evidence/m4.mjs';
import { checkDocker } from './verification-evidence/machine.mjs';
import { checkManifest, DELEGATED, FULL_CHAIN, M4_SCRIPT, MANIFEST, SECURITY_CHAIN }
  from './verification-evidence/manifest.mjs';
import { checkGitInputs, checkLiveAuthority, checkTicket, issueTicket }
  from './verification-evidence/ticket.mjs';
import { fixtureMarker, FIXTURE_DIGEST } from './verify-machine-fixtures.mjs';
import { harness, MARKER_SHA, packageJson, trusted } from './verify-machine-harness.mjs';
import { DELEGATED_MARKER_SCHEMA, MACHINE_ROLES, validateMarker } from './verify-machine-marker.mjs';
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
  assert.deepEqual(DELEGATED.map(([, , command]) => command), [
    'pnpm repo:size:check', 'pnpm test:ci:contracts:parallel', 'pnpm test:release-gate',
    'pnpm check:e2e-contracts', 'pnpm lint:production-warnings', 'pnpm db:migrations:check-journal',
    'pnpm i18n:check', 'pnpm i18n:purity:check', 'pnpm check:tenant-guard',
    'pnpm check:architecture-boundaries',
  ]);
  assert.match(packageJson.scripts['e2e:gate'], /run-e2e-lane\.mjs gate$/u);
  const runner = readFileSync(path.join(repo, 'scripts/run-e2e-lane.mjs'), 'utf8');
  assert.match(runner, /gate: gateLane\(\[ksSq, mkMk\], true, fullGateWorkers\)/u);
  assert.match(runner, /const gateLane = [^\n]+\n\s+gatekeeper: true,/u);
  assert.match(runner, /lane\.gatekeeper\) await run\('bash', \['scripts\/m4-gatekeeper\.sh'\]/u);
  const build = readFileSync(path.join(repo, 'scripts/m4-gatekeeper.sh'), 'utf8');
  assert.match(build, /pnpm db:migrate[\s\S]+pnpm seed:e2e[\s\S]+pnpm --filter @interdomestik\/web build/u);
  const root = temporary(t);
  const mutated = structuredClone(packageJson);
  mutated.scripts[M4_SCRIPT] = mutated.scripts[M4_SCRIPT].replace('pnpm coverage:gate && ', '');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(mutated));
  assert.throws(() => checkManifest(root), /manifest/u);
});

test('the exact signed attempt authenticates and binds the receipt bytes', t => {
  const f = evidenceFixture(t);
  assert.equal(f.verify().receiptSha256, f.save());
});

test('authority refuses cancelled and superseded attempts even with the original identity', () => {
  const identity = authorityFixture();
  assert.deepEqual(checkLiveAuthority({ state: 'eligible', identity }, identity), identity);
  for (const state of ['cancelled', 'superseded', 'stale']) {
    assert.throws(() => checkLiveAuthority({ state, identity }, identity), /attempt-ineligible/u);
  }
  assert.throws(() => checkLiveAuthority({ state: 'eligible', identity }, authorityFixture()),
    /attempt-mismatch/u);
});

test('missing, empty, malformed and valid-but-empty signed documents fail closed', async t => {
  for (const name of ['ticket', 'receipt']) {
    for (const bad of [null, '', '{', '{}']) {
      await t.test(`${name}: ${JSON.stringify(bad)}`, sub => {
        const f = evidenceFixture(sub);
        if (bad === null) rmSync(path.join(f.dir, `${name}.json`));
        else f.signed(name, bad);
        assert.throws(() => f.verify());
      });
    }
  }
});

test('the ticket expires when Git refs, review, policy, configuration or attempt change', t => {
  const { current, verify, receipt } = evidenceFixture(t);
  assert.throws(() => verify(current, receipt.ticket.expiresAt), /expired/u);
  assert.throws(() => verify(current, now, { ...approved, sha256: 'b'.repeat(64) }), /policy/u);
  for (const key of ['repo', 'subject', 'attempt', 'reviewSha256', 'configurationSha256']) {
    const value = authorityFixture()[key];
    const changed = { repo: 'example/other', subject: 'pr:2154', attempt: value,
      reviewSha256: 'a'.repeat(64), configurationSha256: 'b'.repeat(64) }[key];
    assert.throws(() => verify({ ...current, [key]: changed }), /stale/u);
  }
  for (const key of ['main', 'head', 'tree']) {
    const changed = structuredClone(current);
    changed[key] = '7'.repeat(40);
    changed.merge = { ...changed.merge, parents: [changed.main, changed.head], tree: changed.tree };
    assert.throws(() => verify(changed), /stale/u);
  }
  // #2157 had different pregate and reviewed heads, even if a tree happens to be identical.
  const pregate = { ...current, head: `774a6443d${'0'.repeat(31)}` };
  pregate.merge = { ...current.merge, parents: [current.main, pregate.head] };
  const final = { ...current, head: `0d56cac89${'0'.repeat(31)}` };
  final.merge = { ...current.merge, parents: [current.main, final.head] };
  assert.throws(() => checkTicket(issueTicket(pregate, approved, lockfile, now), approved, now, final),
    /stale/u);
  assert.throws(() => verify({ ...current, merge: { ...current.merge,
    parents: [head, current.main] } }), /git-identity/u);
});

test('signed partial, skipped, cancelled, failed and wrong-role receipts fail closed', async t => {
  const cases = {
    'zero-exit PRE-CHECK': r => { r.class = 'PRE-CHECK'; },
    'wrong role': r => { r.machineRole = 'm4'; },
    'no lanes': r => { r.lanes = []; },
    'omitted lane': r => { r.lanes.pop(); },
    'duplicate lane': r => { r.lanes[1] = r.lanes[0]; },
    'serial contracts': r => { r.lanes[1].command = 'pnpm test:ci:contracts'; },
    'failed lane': r => { r.lanes[2].exit = 1; },
    'failed job': r => { r.exit = 1; },
    'cancelled job': r => { r.completed = false; },
    'unexpected runner': r => { r.runnerSha256 = 'a'.repeat(64); },
    'unexpected manifest': r => { r.manifestSha256 = 'b'.repeat(64); },
    'Bash 3.2': r => { r.start.bash = '3.2.57'; r.finish.bash = '3.2.57'; },
    'wrong slot': r => { r.start.slot = 'B'; r.finish.slot = 'B'; },
    'marker drift': r => { r.finish.markerSha256 = 'b'.repeat(64); },
    'OrbStack drift': r => { r.finish.container.engine = '100.1'; },
    'socket drift': r => { r.finish.container.socket = 'unix:///other.sock'; },
    'unready database': r => { r.start.container.ready = false; r.finish.container.ready = false; },
    'finish tree drift': r => { r.finish.git.tree = 'a'.repeat(40); },
    'lockfile drift': r => { r.start.git.lockfileSha256 = 'a'.repeat(64); },
    'missing report digest': r => { r.lanes.find(lane => lane.id === 'i18n-purity').reports = {}; },
    'impossible time': r => { r.finishedAt = r.ticket.expiresAt; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, sub => {
      const f = evidenceFixture(sub);
      mutate(f.receipt);
      f.save();
      assert.throws(() => f.verify());
    });
  }
});

test('collected files and signatures must match, including simultaneous receipt and log replacement', async t => {
  for (const log of ['job.log', 'contracts.log', 'i18n-purity.json', 'install.log']) {
    await t.test(log, sub => {
      const f = evidenceFixture(sub);
      assert.throws(() => { f.write(log, 'truncated\n'); f.verify(); }, /digest/u);
      assert.throws(() => { f.write(log, ''); f.verify(); }, /artifact-file/u);
      rmSync(path.join(f.dir, log));
      assert.throws(() => f.verify());
    });
  }
  const f = evidenceFixture(t);
  f.receipt.logSha256 = f.write('job.log', 'replacement transcript\n');
  f.write('receipt.json', JSON.stringify(f.receipt));
  assert.throws(() => f.verify(), /signature mismatch/u);
  f.signed('receipt', JSON.stringify(f.receipt), 'm4');
  assert.throws(() => f.verify(), /signature mismatch/u);
  f.receipt.lanes.find(lane => lane.id === 'i18n-purity').reports['i18n-purity.json'] =
    f.write('i18n-purity.json', '{}');
  f.save();
  assert.throws(() => f.verify(), /i18n-purity-report/u);
  rmSync(path.join(f.dir, 'receipt.sig'));
  assert.throws(() => f.verify(), /ENOENT/u);
});

test('M5 Docker admission refuses runtime, socket, readiness, image and port changes', () => {
  const imageId = `sha256:${'1'.repeat(64)}`;
  const marker = fixtureMarker();
  marker.container_runtime.socket = 'unix:///slot-A.sock';
  const fixture = {
    context: 'orbstack', socket: marker.container_runtime.socket, engine: '99.0.0',
    image: marker.database.image, digests: [marker.database.image], host: '127.0.0.1',
    port: String(marker.database.port), ready: true,
  };
  function check(overrides) {
    const f = { ...fixture, ...overrides };
    const exec = (_command, args) => {
      if (args[0] === 'context') return args[1] === 'show' ? f.context : JSON.stringify(f.socket);
      const command = args[2];
      if (command === 'version') return f.engine;
      if (command === 'ps') return `${'c'.repeat(64)}\t${marker.database.container}`;
      if (command === 'image') return JSON.stringify(f.digests);
      if (command === 'inspect') return args[4] === '{{.Image}}' ? imageId :
        `${f.image}|true|${JSON.stringify({ '5432/tcp': [{ HostIp: f.host, HostPort: f.port }] })}`;
      if (args.includes('pg_isready')) {
        if (!f.ready) throw new Error('unavailable');
        return '';
      }
      return JSON.stringify([marker.database.name]);
    };
    return checkDocker(repo, marker, exec, () => FIXTURE_DIGEST);
  }
  assert.equal(check({}).imageId, imageId);
  for (const changed of [{ context: 'default' }, { socket: 'tcp://localhost' }, { engine: null },
    { ready: false }, { digests: [] }, { host: '0.0.0.0' }, { port: '54322' }]) {
    assert.throws(() => check(changed), /container-runtime|database-/u);
  }
});

test('the observed checkout and committed lockfile must agree at both ends', t => {
  const root = temporary(t);
  const git = (...args) => execFileSync('/usr/bin/git', ['-c', 'user.name=Fixture',
    '-c', 'user.email=fixture@example.invalid', ...args], {
    cwd: root, env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
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
  assert.deepEqual(checkGitInputs(root, identity, true), { head, main, tree, lockfileSha256: lockfile });
  assert.throws(() => checkGitInputs(root, { ...identity, tree: 'e'.repeat(40) }, true), /git-drift/u);
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
  const h = harness({ marker: trusted(), env: { npm_lifecycle_event: M4_SCRIPT,
    [EVIDENCE_DIR_ENV]: '/fixture' } });
  t.after(h.cleanup);
  const scope = { markerSha256: MARKER_SHA, head, tree, base: 'd'.repeat(40),
    m5ReceiptSha256: 'f'.repeat(64) };
  h.deps.verifyComposition = () => scope;
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  h.deps.verifyComposition = () => ({ ...scope, m5ReceiptSha256: 'a'.repeat(64) });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  h.state.marker = { status: 'absent' };
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  h.state.marker = trusted();
  h.deps.verifyComposition = () => scope;
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.deepEqual(h.readFinal().composition, scope);
  assert.equal(h.readFinal().machineRole, 'm4');
});

test('composed verification refuses a missing collection and a zero-exit hosted shortcut', t => {
  const h = harness({ marker: trusted(), env: { npm_lifecycle_event: M4_SCRIPT } });
  t.after(h.cleanup);
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 1);
  h.deps.env[EVIDENCE_DIR_ENV] = '/fixture';
  h.deps.env.GITHUB_ACTIONS = 'true';
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  assert.deepEqual(h.files(), []);
});

test('an M5 marker cannot issue full M4 stamps or use a second slot', t => {
  const marker = fixtureMarker({ schema: DELEGATED_MARKER_SCHEMA, role: MACHINE_ROLES.m5, slot: 'A',
    tool_path: '/fixture/bin:/usr/bin', executables: { node: '/fixture/bin/node',
      pnpm: '/fixture/bin/pnpm', bash: '/fixture/bin/bash' }, bash_version: '5.2.1' });
  marker.container_runtime.socket = 'unix:///fixture.sock';
  assert.deepEqual(validateMarker(marker), []);
  assert.ok(validateMarker({ ...marker, slot: 'B' }).length > 0);
  assert.ok(validateMarker({ ...marker, bash_version: '3.2.57' }).length > 0);
  for (const [script, lane] of [['pr:verify', 'pr-verify'], ['security:guard', 'security-guard']]) {
    const h = harness({ marker: trusted(marker), env: { npm_lifecycle_event: script } });
    t.after(h.cleanup);
    assert.equal(runVerifyMachine(['begin', lane], h.deps), 0);
    assert.equal(runVerifyMachine(['stamp', lane], h.deps), 0);
    assert.equal(h.readFinal().mode, 'PRE-CHECK');
  }
});

test('final publication requires the distinct passed M4 pair for the same evidence', t => {
  const f = evidenceFixture(t);
  const scope = { head, markerSha256: MARKER_SHA, m5ReceiptSha256: f.verify().receiptSha256,
    m5FinishedAt: f.receipt.finishedAt, expiresAt: f.receipt.ticket.expiresAt };
  const record = { mode: 'GATE-EVIDENCE', machineRole: 'm4', result: 'passed', head,
    markerSha256: MARKER_SHA, composition: scope, runId: f.receipt.runId,
    startedAt: new Date(now).toISOString(), finishedAt: new Date(now + 100).toISOString() };
  const pr = { ...record, lane: 'pr-verify' };
  const sec = { ...record, lane: 'security-guard', runId: f.receipt.ticket.id };
  checkRecordPair(pr, sec, scope);
  for (const bad of [null, {}, { ...sec, mode: 'PRE-CHECK' }, { ...sec, mode: 'TRIAL-EVIDENCE' },
    { ...sec, runId: pr.runId },
    { ...sec, composition: { ...scope, m5ReceiptSha256: 'e'.repeat(64) } }]) {
    assert.throws(() => checkRecordPair(pr, bad, scope), /m4-record|m4-run-pair/u);
  }
});
