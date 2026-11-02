import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { commit, git, tmp, writeFile } from './db-access-required-git.mjs';
import { TRUSTED } from './tenant-guard/trusted.mjs';
import {
  ATTACK,
  adminRead,
  assertFailed,
  main,
  openPullRequest,
  route,
  skip,
} from './tenant-guard-s2-workflow-test-support.mjs';

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
