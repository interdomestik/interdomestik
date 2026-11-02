import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commit, git, tmp, writeFile } from './db-access-required-git.mjs';
import { TRUSTED } from './tenant-guard/trusted.mjs';
import {
  ATTACK,
  adminRead,
  archive,
  assertFailed,
  fixtureOrigin,
  main,
  openPullRequest,
  pulls,
  route,
  skip,
  sourceVariant,
} from './tenant-guard-s2-workflow-test-support.mjs';

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
