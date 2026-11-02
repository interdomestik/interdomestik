import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { commit, git, rootDir, tmp, writeFile } from './db-access-required-git.mjs';
import { TRUSTED } from './tenant-guard/trusted.mjs';

// Adversarial coverage of the S2 org-required workflow: its production step text runs verbatim
// (bash) against a fixture origin whose protected main is the current tree on top of the trusted
// commit, with only the pending source pin set to a fixture commit. Successor of the still
// applicable legacy workflow negatives: candidate substitution, CI deletion, compiler integrity,
// environment isolation, exact merge/ref/object identity, closure completeness and resolver data.

const REPO = 'interdomestik/interdomestik';
const TS = '5.9.3';
const workflow = yaml.load(
  fs.readFileSync(path.join(rootDir, '.github/workflows/tenant-guard-s2-required.yml'), 'utf8')
);
const step = workflow.jobs['tenant-guard-s2'].steps.find(
  entry => entry.id === 'protected_tenant_guard'
);
const archive = path.join(rootDir, 'tmp', 'db-access-protected', `typescript-${TS}.tgz`);
const sri = file => `sha512-${createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`;
const lockIntegrity =
  /^ {2}typescript@5\.9\.3:\n\s+resolution:\s*\n?\s*\{\s*integrity:\s*(sha512-[A-Za-z0-9+/=]+)/mu.exec(
    fs.readFileSync(path.join(rootDir, 'pnpm-lock.yaml'), 'utf8')
  )?.[1];
const ready = fs.existsSync(archive) && lockIntegrity && sri(archive) === lockIntegrity;
const skip = ready ? false : `needs the verified TypeScript ${TS} archive at ${archive}`;

// Protected main: the current working tree (tracked and unignored files) as one commit on top of
// the trusted comparator. It is also the approved source unless a test pins a variant.
let origin;
let main;
function fixtureOrigin() {
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
let variants = 0;
function sourceVariant(files, { reachable = true } = {}) {
  const repo = fixtureOrigin();
  variants += 1;
  git(repo, 'checkout', '-q', '-b', `authority-${variants}`, 'main');
  for (const [file, content] of Object.entries(files)) writeFile(repo, file, content);
  const sha = commit(repo, `source variant ${variants}`);
  git(repo, 'checkout', '-q', 'main');
  if (!reachable) git(repo, 'branch', '-q', '-D', `authority-${variants}`);
  return sha;
}

let pulls = 0;
function openPullRequest(mutate = () => {}, { base = 'main', force = [] } = {}) {
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

function route(pr, { source = main, overrides = {}, extraEnv = {} } = {}) {
  const tree = git(fixtureOrigin(), 'rev-parse', `${source}^{tree}`);
  const script = step.run
    .replace(/^source_commit='0{40}'$/mu, `source_commit='${source}'`)
    .replace(/^source_tree='0{40}'$/mu, `source_tree='${tree}'`);
  assert.notEqual(script, step.run, 'the pending source pin lines must exist');
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

function assertFailed(result, reason) {
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, reason);
  assert.doesNotMatch(result.stdout, /Protected tenant guard S2 passed/u);
}

const ATTACK = 'apps/web/src/lib/s2-attack.ts';
const adminRead = specifier => [
  `import { dbAdmin } from '${specifier}';`,
  'export const read = () => dbAdmin.select();',
];

test(
  'a clean candidate passes with the approved source against the pinned comparator',
  { skip },
  () => {
    const pr = openPullRequest(repo =>
      writeFile(repo, 'apps/web/src/lib/s2-benign.ts', ['export const benign = 1;'])
    );
    const result = route(pr);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(
      result.stdout,
      new RegExp(`source=${main} tree=[0-9a-f]{40} role=approved-guard`, 'u')
    );
    assert.match(result.stdout, new RegExp(`trusted=${TRUSTED.commit} tree=${TRUSTED.tree}`, 'u'));
    assert.match(result.stdout, /Protected tenant guard S2 passed .*files=\d+ .*violations=0/u);
    assert.deepEqual(result.report.trusted, TRUSTED);
    // Nothing is written into the candidate workspace.
    assert.equal(git(pr.ws, 'status', '--porcelain=v1', '--untracked-files=all'), '');
  }
);

test(
  'candidate guard, comparator, compiler, preload and CI replacements never execute or waive',
  { skip },
  () => {
    const sentinels = tmp('s2-sentinels');
    const mark = name => path.join(sentinels, name);
    const sentinel = name =>
      `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(mark(name))}, 'executed'); process.stdout.write('{"violations":[]}'); process.exit(0);\n`;
    const pr = openPullRequest(
      repo => {
        writeFile(repo, ATTACK, adminRead('@interdomestik/database'));
        writeFile(repo, 'scripts/ci/tenant-guard.mjs', sentinel('guard'));
        writeFile(repo, 'scripts/ci/tenant-guard/rules.mjs', sentinel('rules'));
        writeFile(repo, 'scripts/ci/tenant-guard/trusted.mjs', [
          `export const TRUSTED = Object.freeze({ commit: '${'1'.repeat(40)}', tree: '${'2'.repeat(40)}' });`,
        ]);
        writeFile(
          repo,
          'node_modules/typescript/lib/typescript.js',
          `require('node:fs').writeFileSync(${JSON.stringify(mark('compiler'))}, 'x');\n`
        );
        writeFile(
          repo,
          'node_modules/typescript/package.json',
          '{"name":"typescript","version":"5.9.3","main":"lib/typescript.js"}\n'
        );
        writeFile(
          repo,
          'preload.cjs',
          `require('node:fs').writeFileSync(${JSON.stringify(mark('preload'))}, 'x');\n`
        );
        writeFile(repo, '.npmrc', 'node-options=--require ./preload.cjs\n');
        writeFile(repo, '.github/workflows/ci.yml', ['name: CI', 'on: pull_request', 'jobs: {}']);
        fs.rmSync(path.join(repo, '.github/workflows/tenant-guard-s2-required.yml'));
      },
      { force: ['node_modules/typescript'] }
    );
    const result = route(pr);
    assertFailed(result, /protected report is not a passing scan/u);
    assert.match(
      result.stderr,
      /R-a apps\/web\/src\/lib\/s2-attack\.ts:\d+ .*dbAdmin is not available/u
    );
    assert.deepEqual(result.report.trusted, TRUSTED);
    assert.deepEqual(fs.readdirSync(sentinels), []);
  }
);

test(
  'candidate resolver data cannot hide a privileged import; bundler config is pinned',
  { skip },
  () => {
    const pr = openPullRequest(repo => {
      const config = path.join(repo, 'apps/web/tsconfig.json');
      const text = fs.readFileSync(config, 'utf8');
      assert.ok(text.includes('"paths": {'));
      fs.writeFileSync(
        config,
        text.replace(
          '"paths": {',
          '"paths": {\n      "db-alias": ["../../packages/database/src/db.ts"],'
        )
      );
      writeFile(repo, ATTACK, adminRead('db-alias'));
      fs.appendFileSync(path.join(repo, 'apps/web/next.config.mjs'), '\n// candidate edit\n');
    });
    const result = route(pr);
    assertFailed(result, /protected report is not a passing scan/u);
    assert.match(
      result.stderr,
      /R-a apps\/web\/src\/lib\/s2-attack\.ts:\d+ .*dbAdmin is not available/u
    );
    assert.match(
      result.stderr,
      /resolution-config apps\/web\/next\.config\.mjs:1 .*differs from the trusted tree/u
    );
  }
);

test(
  'the guard process sees only the fixed environment; secrets and overrides never reach it',
  { skip },
  () => {
    const sentinels = tmp('s2-env-sentinels');
    const preload = path.join(sentinels, 'preload.cjs');
    fs.writeFileSync(
      preload,
      `require('node:fs').writeFileSync(${JSON.stringify(path.join(sentinels, 'loaded'))}, 'x');\n`
    );
    const source = sourceVariant({
      'scripts/ci/tenant-guard.mjs': [
        `const trusted = { commit: '${TRUSTED.commit}', tree: '${TRUSTED.tree}' };`,
        'const env = Object.fromEntries(Object.entries(process.env));',
        'const report = { trusted, telemetry: { files: 1 }, violations: [], env, execArgv: process.execArgv };',
        'process.stdout.write(JSON.stringify(report));',
      ],
    });
    const pr = openPullRequest();
    const result = route(pr, {
      source,
      extraEnv: {
        SECRET_TOKEN: 'secret-value',
        NODE_OPTIONS: `--require ${preload}`,
        NODE_PATH: sentinels,
        GIT_DIR: sentinels,
        GIT_CONFIG_PARAMETERS: "'core.fsmonitor=false'",
        npm_config_node_options: `--require ${preload}`,
      },
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    // macOS injects its CoreFoundation encoding variable into every process, even under env -i.
    const keys = Object.keys(result.report.env).filter(key => key !== '__CF_USER_TEXT_ENCODING');
    assert.deepEqual(keys.sort(), [
      'CI',
      'GIT_CONFIG_GLOBAL',
      'GIT_CONFIG_NOSYSTEM',
      'GIT_DIR',
      'GIT_NO_REPLACE_OBJECTS',
      'GIT_TERMINAL_PROMPT',
      'HOME',
      'LC_ALL',
      'PATH',
      'TZ',
    ]);
    assert.equal(result.report.env.GIT_DIR, path.join(result.work, 'git'));
    assert.equal(result.report.env.PATH, '/usr/bin:/bin');
    assert.deepEqual(result.report.execArgv, ['--no-addons']);
    assert.deepEqual(fs.readdirSync(sentinels), ['preload.cjs']);
  }
);

test('a report that does not name the pinned comparator, or is not a pass, fails', { skip }, () => {
  const report = (trusted, violations) =>
    `process.stdout.write(${JSON.stringify(JSON.stringify({ trusted, telemetry: { files: 1 }, violations }))});\n`;
  // Variants exist on origin before the workspace is cloned, as an authority branch would.
  const otherTrusted = sourceVariant({
    'scripts/ci/tenant-guard.mjs': report({ commit: main, tree: TRUSTED.tree }, []),
  });
  const crashed = sourceVariant({ 'scripts/ci/tenant-guard.mjs': 'process.exit(3);\n' });
  const nonzero = sourceVariant({
    'scripts/ci/tenant-guard.mjs': `${report(TRUSTED, []).trimEnd()} process.exitCode = 1;\n`,
  });
  const pr = openPullRequest();
  assertFailed(route(pr, { source: otherTrusted }), /protected report is not a passing scan/u);
  assertFailed(route(pr, { source: crashed }), /protected report is not a passing scan/u);
  assertFailed(route(pr, { source: nonzero }), /approved guard [0-9a-f]{40} exited 1/u);
});

test(
  'compiler bytes must match the approved lock; a substituted archive fails before any guard code',
  { skip },
  () => {
    const corrupt = path.join(tmp('s2-corrupt'), 'typescript.tgz');
    fs.writeFileSync(corrupt, Buffer.concat([fs.readFileSync(archive), Buffer.from([0])]));
    const result = route(openPullRequest(), {
      extraEnv: { DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: corrupt },
    });
    assertFailed(result, /typescript tarball does not match protected lock integrity/u);
    assert.equal(result.report, null);
    assertFailed(
      route(openPullRequest(), { extraEnv: { GITHUB_ACTIONS: 'true' } }),
      /fixture seam under GitHub Actions/u
    );
  }
);

test('the approved closure is complete, static and reachable from origin refs', { skip }, () => {
  const dynamic = sourceVariant({
    'scripts/ci/tenant-guard.mjs': "await import('./tenant-guard/rules.mjs');\n",
  });
  const missing = sourceVariant({
    'scripts/ci/tenant-guard.mjs': "import './tenant-guard/missing.mjs';\n",
  });
  const dangling = sourceVariant({ 'scripts/ci/tenant-guard.mjs': '' }, { reachable: false });
  const pr = openPullRequest();
  const dynamicRun = route(pr, { source: dynamic });
  assertFailed(dynamicRun, /approved guard closure/u);
  assert.match(dynamicRun.stderr, /dynamic loading in protected scripts\/ci\/tenant-guard\.mjs/u);
  const missingRun = route(pr, { source: missing });
  assertFailed(missingRun, /approved guard closure/u);
  assert.match(
    missingRun.stderr,
    /protected closure missing or non-regular scripts\/ci\/tenant-guard\/missing\.mjs/u
  );
  assertFailed(route(pr, { source: dangling }), /approved guard source commit missing/u);
});

test(
  'exact merge, parent order, objects, protected base and a clean workspace are required',
  { skip },
  () => {
    const pr = openPullRequest(repo =>
      writeFile(repo, 'apps/web/src/lib/s2-benign.ts', ['export const x = 2;'])
    );
    assertFailed(
      route(pr, { overrides: { PR_BASE_SHA: pr.head, PR_HEAD_SHA: pr.base } }),
      /merge commit parents are not exactly \(base, head\)/u
    );
    assertFailed(
      route(pr, { overrides: { PR_HEAD_SHA: 'f'.repeat(40) } }),
      /missing base\/head commit object/u
    );
    assertFailed(
      route(pr, { overrides: { EVENT_REF: 'refs/heads/main' } }),
      /pull request merge ref identity/u
    );
    assertFailed(
      route(pr, { overrides: { EVENT_REPO: 'attacker/interdomestik' } }),
      /repository identity/u
    );

    const headOnly = openPullRequest();
    git(headOnly.ws, 'checkout', '-q', '--detach', headOnly.head);
    assertFailed(route(headOnly), /workspace checkout is not the exact merge commit/u);

    const dirty = openPullRequest();
    writeFile(dirty.ws, ATTACK, adminRead('@interdomestik/database'));
    assertFailed(route(dirty), /workspace differs from the merge commit/u);

    const repo = fixtureOrigin();
    git(repo, 'checkout', '-q', '-b', `side-${pulls}`, 'main');
    writeFile(repo, 'apps/web/src/lib/s2-side.ts', ['export const side = 1;']);
    commit(repo, 'unprotected side base');
    git(repo, 'checkout', '-q', 'main');
    const stacked = openPullRequest(() => {}, { base: `side-${pulls}` });
    assertFailed(route(stacked), /base commit not on protected main/u);
  }
);
