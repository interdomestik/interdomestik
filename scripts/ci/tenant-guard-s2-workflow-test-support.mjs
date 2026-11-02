import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { commit, git, rootDir, tmp, writeFile } from './db-access-required-git.mjs';
import { TRUSTED } from './tenant-guard/trusted.mjs';

// Adversarial coverage of the S2 org-required workflow: its production step text runs verbatim
// (bash) against a fixture origin whose protected main is the current tree on top of the trusted
// commit, with only the pending source pin set to a fixture commit. Successor of the still
// applicable legacy workflow negatives: candidate substitution, CI deletion, compiler integrity,
// environment isolation, exact merge/ref/object identity, closure completeness and resolver data.

export const REPO = 'interdomestik/interdomestik';
export const TS = '5.9.3';
export const workflow = yaml.load(
  fs.readFileSync(path.join(rootDir, '.github/workflows/tenant-guard-s2-required.yml'), 'utf8')
);
export const step = workflow.jobs['tenant-guard-s2'].steps.find(
  entry => entry.id === 'protected_tenant_guard'
);
export const archive = path.join(rootDir, 'tmp', 'db-access-protected', `typescript-${TS}.tgz`);
export const sri = file =>
  `sha512-${createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`;
export const lockIntegrity =
  /^ {2}typescript@5\.9\.3:\n\s+resolution:\s*\n?\s*\{\s*integrity:\s*(sha512-[A-Za-z0-9+/=]+)/mu.exec(
    fs.readFileSync(path.join(rootDir, 'pnpm-lock.yaml'), 'utf8')
  )?.[1];
export const ready = fs.existsSync(archive) && lockIntegrity && sri(archive) === lockIntegrity;
export const skip = ready ? false : `needs the verified TypeScript ${TS} archive at ${archive}`;

// Protected main: the current working tree (tracked and unignored files) as one commit on top of
// the trusted comparator. It is also the approved source unless a test pins a variant.
export let origin;
export let main;
export function fixtureOrigin() {
  if (origin) return origin;
  origin = tmp('s2-origin');
  git(origin, 'init', '-q', '-b', 'main');
  const common = git(rootDir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  fs.writeFileSync(
    path.join(origin, '.git/objects/info/alternates'),
    `${path.join(common, 'objects')}\n`
  );
  git(origin, `--work-tree=${rootDir}`, 'add', '-A');
  const tree = git(origin, 'write-tree');
  main = git(origin, 'commit-tree', tree, '-p', TRUSTED.commit, '-m', 'protected main snapshot');
  git(origin, 'update-ref', 'refs/heads/main', main);
  git(origin, 'reset', '-q', '--hard', 'main');
  return origin;
}

// An approved-source variant on its own origin branch (reachable, as an authority branch is).
export let variants = 0;
export function sourceVariant(files, { reachable = true } = {}) {
  const repo = fixtureOrigin();
  variants += 1;
  git(repo, 'checkout', '-q', '-b', `authority-${variants}`, 'main');
  for (const [file, content] of Object.entries(files)) writeFile(repo, file, content);
  const sha = commit(repo, `source variant ${variants}`);
  git(repo, 'checkout', '-q', 'main');
  if (!reachable) git(repo, 'branch', '-q', '-D', `authority-${variants}`);
  return sha;
}

export let pulls = 0;
export function openPullRequest(mutate = () => {}, { base = 'main', force = [] } = {}) {
  const repo = fixtureOrigin();
  pulls += 1;
  git(repo, 'checkout', '-q', '-b', `candidate-${pulls}`, base);
  mutate(repo);
  if (force.length) git(repo, 'add', '-f', '--', ...force);
  const head = commit(repo, `candidate ${pulls}`);
  git(repo, 'checkout', '-q', 'main');
  const baseSha = git(repo, 'rev-parse', `${base}^{commit}`);
  const ws = tmp('s2-ws');
  git(ws, 'clone', '-q', '--shared', repo, '.');
  git(ws, 'checkout', '-q', '--detach', baseSha);
  git(ws, 'merge', '-q', '--no-ff', '--no-edit', '-m', `Merge ${head} into ${baseSha}`, head);
  const merge = git(ws, 'rev-parse', 'HEAD');
  return {
    ws,
    base: baseSha,
    head,
    merge,
    event: {
      EVENT_NAME: 'pull_request',
      EVENT_REPO: REPO,
      EVENT_REF: 'refs/pull/1950/merge',
      EVENT_SHA: merge,
      PR_NUMBER: '1950',
      PR_BASE_REPO: REPO,
      PR_BASE_REF: 'main',
      PR_BASE_SHA: baseSha,
      PR_HEAD_SHA: head,
      DEFAULT_BRANCH: 'main',
      TS_EXPECTED_VERSION: TS,
    },
  };
}

export function route(pr, { source = main, overrides = {}, extraEnv = {} } = {}) {
  const tree = git(fixtureOrigin(), 'rev-parse', `${source}^{tree}`);
  const script = step.run
    .replace(/^source_commit='[0-9a-f]{40}'$/mu, `source_commit='${source}'`)
    .replace(/^source_tree='[0-9a-f]{40}'$/mu, `source_tree='${tree}'`);
  assert.notEqual(script, step.run, 'the source pin lines must exist');
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
    GITHUB_WORKSPACE: pr.ws,
    RUNNER_TEMP: tmp('s2-runner-temp'),
    DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: archive,
    ...pr.event,
    ...overrides,
    ...extraEnv,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], {
    cwd: pr.ws,
    env,
    encoding: 'utf8',
    timeout: 600000,
  });
  const name = fs
    .readdirSync(env.RUNNER_TEMP)
    .find(entry => entry.startsWith('db-guard-protected.'));
  const work = name && path.join(env.RUNNER_TEMP, name);
  const reportFile = work && path.join(work, 'out/report.json');
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch {
    report = null;
  }
  return { ...result, work, report, source };
}

export function assertFailed(result, reason) {
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, reason);
  assert.doesNotMatch(result.stdout, /Protected tenant guard S2 passed/u);
}

export const ATTACK = 'apps/web/src/lib/s2-attack.ts';
export const adminRead = specifier => [
  `import { dbAdmin } from '${specifier}';`,
  'export const read = () => dbAdmin.select();',
];
