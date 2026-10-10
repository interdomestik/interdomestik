import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  SOURCE_COMMIT,
  SOURCE_TREE,
  TS,
  commit,
  git,
  rootDir,
  showAt,
  tmp,
  writeFile,
} from './db-access-required-git.mjs';
import { officialArchive, verifiedCompiler } from './db-access-required-compiler.mjs';
import { REPO, localScript } from './db-access-required-workflow.mjs';

export const ambient = [
  'import { db } from "@interdomestik/database";',
  'export function f() { return db.select().from(user); }',
];
export const canonical = [
  "import { user, withTenantContext } from '@interdomestik/database';",
  'export function authorityPositive(tenantId: string) {',
  '  return withTenantContext({ tenantId }, async tx => tx.select().from(user));',
  '}',
];
export const nodeEnv = Object.freeze({
  PATH: '/usr/bin:/bin',
  HOME: tmp('node-home'),
  LC_ALL: 'C',
  TZ: 'UTC',
  CI: 'true',
});
export const sentinelModule = sentinel =>
  `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(sentinel)}, 'loaded'); process.exit(0);\n`;
// Permission-neutral weakening: records that it executed and forges a passing report.
export const forgingGuard = sentinel =>
  [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    `fs.writeFileSync(${JSON.stringify(sentinel)}, 'executed');`,
    "const arg = process.argv.find(item => item.startsWith('--report=')) ?? '--report=tmp/db-access-guard/protected-base.json';",
    'const report = arg.slice(9);',
    'fs.mkdirSync(path.dirname(report), { recursive: true });',
    "fs.writeFileSync(report, JSON.stringify({ status: 'pass', scannedCount: 1, failingNewEntries: [] }));",
    'export const runGuardCli = () => 0;',
    '',
  ].join('\n');
export const fakeEpoch = (anchor, tree) =>
  `export const ADOPTION = Object.freeze({ commit: '${anchor}', tree: '${tree}', files: {}, critical: [] });\n`;
export const noopCi = [
  'name: CI',
  'on: pull_request',
  'jobs:',
  '  audit:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: "true"',
];
export const candidateLock = integrity => [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '',
  '  .:',
  '    devDependencies:',
  '      typescript:',
  `        specifier: ^${TS}`,
  `        version: ${TS}`,
  '',
  'packages:',
  '',
  `  typescript@${TS}:`,
  `    resolution: {integrity: ${integrity}}`,
];

export function withCompiler(root, action) {
  const modules = path.join(root, 'node_modules');
  assert.equal(fs.existsSync(modules), false);
  fs.mkdirSync(modules);
  fs.symlinkSync(verifiedCompiler, path.join(modules, 'typescript'), 'dir');
  try {
    return action();
  } finally {
    fs.rmSync(modules, { recursive: true, force: true });
  }
}

export const pullRequestEvent = (base, head, merge) => ({
  EVENT_NAME: 'pull_request',
  EVENT_REPO: REPO,
  EVENT_REF: 'refs/pull/1902/merge',
  EVENT_SHA: merge,
  PR_NUMBER: '1902',
  PR_BASE_REPO: REPO,
  PR_BASE_REF: 'main',
  PR_BASE_SHA: base,
  PR_HEAD_SHA: head,
  DEFAULT_BRANCH: 'main',
  TS_EXPECTED_VERSION: TS,
});

let pulls = 0;
// Mirrors GitHub: workspace HEAD is the synthetic --no-ff merge with ordered parents (base, head).
export function openPullRequest(origin, mutate = () => {}, options = {}) {
  const { baseBranch = 'main', advanceBase } = options;
  pulls += 1;
  git(origin, 'checkout', '-q', baseBranch);
  git(origin, 'checkout', '-q', '-b', `candidate-${pulls}`);
  mutate(origin);
  const head = commit(origin, `candidate change ${pulls}`);
  git(origin, 'checkout', '-q', baseBranch);
  if (advanceBase) {
    advanceBase(origin);
    commit(origin, 'base advanced after branching');
  }
  const base = git(origin, 'rev-parse', `${baseBranch}^{commit}`);
  const ws = tmp('ws');
  git(ws, 'clone', '-q', '--shared', origin, '.');
  git(ws, 'checkout', '-q', '--detach', base);
  git(ws, 'merge', '-q', '--no-ff', '--no-edit', '-m', `Merge ${head} into ${base}`, head);
  const merge = git(ws, 'rev-parse', 'HEAD');
  return { origin, ws, base, head, merge, event: pullRequestEvent(base, head, merge) };
}

export function route(pr, overrides = {}, extraEnv = {}) {
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
    GITHUB_WORKSPACE: pr.ws,
    RUNNER_TEMP: tmp('runner-temp'),
    DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: officialArchive,
    ...pr.event,
    ...overrides,
    ...extraEnv,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', localScript], {
    cwd: pr.ws,
    env,
    encoding: 'utf8',
    timeout: 600000,
  });
  const temp = env.RUNNER_TEMP;
  const name =
    temp && fs.existsSync(temp)
      ? fs.readdirSync(temp).find(entry => entry.startsWith('db-guard-protected.'))
      : undefined;
  const work = name && path.join(temp, name);
  const file = path.join(pr.ws, 'tmp/db-access-guard/protected-base.json');
  let report;
  if (fs.existsSync(file)) {
    try {
      report = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      report = null;
    }
  }
  fs.rmSync(file, { force: true });
  return { ...result, work, report };
}

export function assertExecutedApproved(result) {
  assert.ok(
    result.stdout.includes(
      `source=${SOURCE_COMMIT} tree=${SOURCE_TREE} role=approved-guard executable=yes`
    ),
    result.stdout
  );
  assert.ok(result.stdout.includes(`approved guard source=${SOURCE_COMMIT} executes on merge=`));
}
export function assertPassed(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assertExecutedApproved(result);
  assert.equal(result.report.status, 'pass');
  assert.ok(result.report.scannedCount > 0);
  assert.deepEqual(result.report.failingNewEntries, []);
  assert.ok(Number.isSafeInteger(result.report.newCount) && result.report.newCount >= 0);
  assert.ok(
    result.stdout.includes(
      `new=${result.report.newCount} failing_new=0 source_baseline_entries=604`
    ),
    result.stdout
  );
}
export function assertRejected(result, file) {
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assertExecutedApproved(result);
  assert.notEqual(result.report?.status, 'pass');
  if (file)
    assert.ok(
      result.report?.failingNewEntries?.some(entry => entry.file === file),
      JSON.stringify(result.report ?? null).slice(0, 2000)
    );
}

// Oracle for the rejected head-only design: the approved e113 guard scanning the candidate head tree.
export function headOnlyScan(pr) {
  const tree = tmp('head-only');
  git(tree, 'clone', '-q', '--shared', pr.origin, '.');
  git(tree, 'checkout', '-q', '--detach', pr.head);
  const guard = tmp('head-only-guard');
  for (const file of git(rootDir, 'ls-tree', '-r', '--name-only', SOURCE_COMMIT, 'scripts/').split(
    '\n'
  ))
    if (file.endsWith('.mjs') && !/\.test\.mjs$/u.test(file))
      writeFile(guard, file, showAt(SOURCE_COMMIT, file));
  const report = 'tmp/db-access-guard/head-only.json';
  const result = withCompiler(guard, () =>
    spawnSync(
      process.execPath,
      [path.join(guard, 'scripts/check-db-access-guard.mjs'), `--report=${report}`],
      { cwd: tree, env: nodeEnv, encoding: 'utf8' }
    )
  );
  return { ...result, report: JSON.parse(fs.readFileSync(path.join(tree, report), 'utf8')) };
}
