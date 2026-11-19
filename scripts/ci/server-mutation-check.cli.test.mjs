import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CHECKS, predicateDigest } from './server-mutation/evaluate.mjs';
import {
  BASE_FILES,
  baselineOf,
  commit,
  git,
  initRepo,
  json,
  pageEntry,
  registryOf,
  runCli,
  tempDir,
  REPO_ROOT,
  SCANNER,
} from './fixtures/server-mutation-check/harness.mjs';

const PAGE = 'apps/web/src/app/page.tsx';
const REGISTRY = 'apps/web/src/lib/public-entry-points.json';
const BASELINE = 'scripts/ci/server-mutation-baseline.json';
const SCRIPT = 'scripts/ci/server-mutation-check.mjs';
const SCRIPT_NAME = 'server-mutation-check.mjs';
const CHECKS_DIR = 'scripts/ci/server-mutation';
const PAGE_ITEM = `page-home@${PAGE}#no-closure`;
const cleanBaseline = (overrides = {}) =>
  baselineOf({ 'CHK-26': { exhausted: undefined, items: [PAGE_ITEM] }, ...overrides });
const tree = (baseline, extra = {}) => ({
  ...BASE_FILES,
  [PAGE]: 'export default function Page() { return null; }\n',
  [REGISTRY]: json(registryOf([pageEntry('page-home', PAGE)])),
  [SCRIPT]: '// placeholder: the base carries the scanner\n',
  ...(baseline ? { [BASELINE]: json(baseline) } : {}),
  ...extra,
});

function withoutCheck(baseline, id) {
  const checks = Object.fromEntries(Object.entries(baseline.checks).filter(([key]) => key !== id));
  return { ...baseline, checks };
}

function scenario(t, base, head) {
  const repo = initRepo(tempDir(t, 'smc-git-'));
  const baseSha = commit(repo, base, 'base');
  const headSha = commit(repo, head, 'head');
  return { repo, baseSha, headSha };
}

test('bootstrap: a base without baseline and scanner is accepted and lists everything', t => {
  const { repo, baseSha } = scenario(
    t,
    { ...BASE_FILES, 'README.md': 'x\n' },
    tree(cleanBaseline())
  );
  const { code, report } = runCli(repo, ['--base', baseSha]);
  assert.equal(code, 0);
  assert.equal(report.bootstrap, true);
  assert.equal(report.status, 'ok');
});

test('a base with the scanner but no baseline is an integrity error (exit 2)', t => {
  const { repo, baseSha } = scenario(t, tree(null), tree(cleanBaseline()));
  const { code, report } = runCli(repo, ['--base', baseSha]);
  assert.equal(code, 2);
  assert.match(report.errors[0], /base has the scanner but no baseline/u);
});

test('an unreadable base exits 2 in the advisory and the enforcing invocation, recorded as error', t => {
  const { repo } = scenario(t, tree(cleanBaseline()), tree(cleanBaseline()));
  for (const extra of [[], ['--enforcing'], ['--check', 'CHK-05b']]) {
    const { code, report } = runCli(repo, ['--base', 'deadbeefdeadbeef', ...extra]);
    assert.equal(code, 2, extra.join(' '));
    assert.equal(report.status, 'error');
  }
});

test('argument errors exit 2: missing base, unknown check, --check with --enforcing', t => {
  const { repo, baseSha } = scenario(t, tree(cleanBaseline()), tree(cleanBaseline()));
  assert.equal(runCli(repo, []).code, 2);
  assert.equal(runCli(repo, ['--base', baseSha, '--check', 'CHK-99']).code, 2);
  assert.equal(runCli(repo, ['--base', baseSha, '--check', 'CHK-04', '--enforcing']).code, 2);
});

test('head baseline: missing, unparseable or valid-but-empty exits 2', t => {
  for (const broken of [
    null,
    '{',
    json({ version: 1, takenAt: 'x', checks: {}, exceptions: [] }),
  ]) {
    const head = tree(cleanBaseline(), { [BASELINE]: broken });
    const { repo, baseSha } = scenario(t, tree(cleanBaseline()), head);
    assert.equal(runCli(repo, ['--base', baseSha]).code, 2, String(broken));
  }
});

test('base baseline: valid-but-empty, or missing a check its own scanner ran, exits 2', t => {
  const empty = json({ version: 1, takenAt: 'x', checks: {}, exceptions: [] });
  const emptyBase = scenario(t, tree(null, { [BASELINE]: empty }), tree(cleanBaseline()));
  assert.equal(runCli(emptyBase.repo, ['--base', emptyBase.baseSha]).code, 2);
  const partial = withoutCheck(cleanBaseline(), 'CHK-05b');
  const ran = { [`${CHECKS_DIR}/chk05b.mjs`]: "export const CHK05B = { id: 'CHK-05b' };\n" };
  const withScanner = scenario(t, tree(partial, ran), tree(cleanBaseline()));
  const { code, report } = runCli(withScanner.repo, ['--base', withScanner.baseSha]);
  assert.equal(code, 2);
  assert.match(report.errors[0], /base baseline has no CHK-05b/u);
  // A check the base scanner never ran is new in this head: accepted.
  const newCheck = scenario(t, tree(partial), tree(cleanBaseline()));
  assert.equal(runCli(newCheck.repo, ['--base', newCheck.baseSha]).code, 0);
});

test('removing an enforcing check from the head is judged as tamper, not as a broken head', t => {
  const enforcing = cleanBaseline({ 'CHK-05b': { mode: 'fail' } });
  const removal = withoutCheck(enforcing, 'CHK-05b');
  const plain = scenario(t, tree(enforcing), tree(removal));
  const refused = runCli(plain.repo, ['--base', plain.baseSha]);
  assert.equal(refused.code, 1);
  assert.deepEqual(refused.report.checks['CHK-05b'].tamper, ['CHK-05b#removed-check']);
  const approved = {
    ...removal,
    exceptions: [
      {
        check: 'CHK-05b',
        item: '#check',
        kind: 'downgrade',
        approvedBy: 'owner',
        ref: 'r',
        date: '2026-11-19',
      },
    ],
  };
  const owned = scenario(t, tree(enforcing), tree(approved));
  assert.equal(runCli(owned.repo, ['--base', owned.baseSha]).code, 0);
});

test('a report that cannot be written exits 2, never 0 or 1', t => {
  const { repo, baseSha } = scenario(t, tree(cleanBaseline()), tree(cleanBaseline()));
  const result = spawnSync(
    process.execPath,
    [SCANNER, '--base', baseSha, '--report', `${PAGE}/r.json`],
    {
      cwd: repo,
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /report not written/u);
});

test('a broken registry: advisory 2; enforcing or --check limited to CHK-05b on a clean scan 0 (r8 B18)', t => {
  const enforcing = cleanBaseline({ 'CHK-05b': { mode: 'fail' } });
  const { repo, baseSha } = scenario(
    t,
    tree(enforcing),
    tree(enforcing, { [REGISTRY]: '{ broken' })
  );
  assert.equal(runCli(repo, ['--base', baseSha]).code, 2);
  const scoped = runCli(repo, ['--base', baseSha, '--enforcing']);
  assert.equal(scoped.code, 0);
  assert.deepEqual(Object.keys(scoped.report.checks), ['CHK-05b']);
  assert.equal(runCli(repo, ['--base', baseSha, '--check', 'CHK-05b']).code, 0);
  assert.equal(runCli(repo, ['--base', baseSha, '--check', 'CHK-26']).code, 2);
});

test('a head downgrade fail -> report without an owner exception exits 1 (judged by the base)', t => {
  const base = cleanBaseline({ 'CHK-05b': { mode: 'fail' } });
  const { repo, baseSha } = scenario(t, tree(base), tree(cleanBaseline()));
  const { code, report } = runCli(repo, ['--base', baseSha]);
  assert.equal(code, 1);
  assert.deepEqual(report.checks['CHK-05b'].tamper, ['CHK-05b#downgrade']);
});

test('a CHK-26 promotion head is enforced on its own PR: duplicate claimant 1, broken registry 2', t => {
  const promoted = cleanBaseline({
    'CHK-26': { mode: 'fail', exhausted: undefined, items: [PAGE_ITEM] },
  });
  const twice = json(registryOf([pageEntry('page-home', PAGE), pageEntry('page-again', PAGE)]));
  const dup = scenario(t, tree(cleanBaseline()), tree(promoted, { [REGISTRY]: twice }));
  assert.equal(runCli(dup.repo, ['--base', dup.baseSha, '--enforcing']).code, 1);
  const broken = scenario(t, tree(cleanBaseline()), tree(promoted, { [REGISTRY]: '' }));
  assert.equal(runCli(broken.repo, ['--base', broken.baseSha, '--enforcing']).code, 2);
});

test('an enforcing check fails on a new item and on a fixed item still listed; report mode does not', t => {
  const code = "export function f() { throw new Error('Unauthorized'); }\n";
  const fail = cleanBaseline({ 'UNAUTH-TEXT': { mode: 'fail' } });
  const added = scenario(t, tree(fail), tree(fail, { 'packages/p/src/a.ts': code }));
  assert.equal(runCli(added.repo, ['--base', added.baseSha]).code, 1);
  const report = scenario(
    t,
    tree(cleanBaseline()),
    tree(cleanBaseline(), { 'packages/p/src/a.ts': code })
  );
  assert.equal(runCli(report.repo, ['--base', report.baseSha]).code, 0);
  const stale = cleanBaseline({
    'CHK-26': { mode: 'fail', exhausted: undefined, items: [PAGE_ITEM, 'gone@x#no-closure'] },
  });
  const fixed = scenario(t, tree(stale), tree(stale));
  assert.equal(runCli(fixed.repo, ['--base', fixed.baseSha]).code, 1);
});

test('coverage below the minimum exits 2', t => {
  const strict = cleanBaseline({ 'CHK-05b': { coverageMin: 1000 } });
  const { repo, baseSha } = scenario(t, tree(strict), tree(strict));
  const { code, report } = runCli(repo, ['--base', baseSha]);
  assert.equal(code, 2);
  assert.match(report.errors[0], /CHK-05b coverage below minimum/u);
});

test('B22: every check records base, head and the predicate digest; --head scans that revision', t => {
  const { repo, baseSha, headSha } = scenario(t, tree(cleanBaseline()), tree(cleanBaseline()));
  commit(
    repo,
    { 'packages/p/src/later.ts': "export function f() { throw new Error('Unauthorized'); }\n" },
    'later'
  );
  const { code, report } = runCli(repo, ['--base', baseSha, '--head', headSha]);
  assert.equal(code, 0);
  assert.equal(report.head, headSha);
  for (const check of CHECKS) {
    const entry = report.checks[check.id];
    assert.equal(entry.base, baseSha);
    assert.equal(entry.head, headSha);
    assert.equal(entry.digest, predicateDigest(check, cleanBaseline().checks[check.id]));
  }
  assert.equal(
    report.checks['UNAUTH-TEXT'].total,
    0,
    'the later commit is not in the scanned head'
  );
});

test('--head scans every committed file, also one marked export-ignore (Astra r1 B09)', t => {
  const hidden = 'packages/p/src/hidden.ts';
  const { repo, baseSha, headSha } = scenario(
    t,
    tree(cleanBaseline()),
    tree(cleanBaseline(), {
      '.gitattributes': `${hidden} export-ignore\n`,
      [hidden]: "export function f() { throw new Error('Unauthorized'); }\n",
    })
  );
  const { report } = runCli(repo, ['--base', baseSha, '--head', headSha]);
  assert.equal(report.checks['UNAUTH-TEXT'].total, 1);
});

test("B22: the digest follows a check's own predicate source and settings, not another check's", t => {
  const dir = path.join(tempDir(t, 'smc-src-'), 'server-mutation');
  const source = path.join(REPO_ROOT, 'scripts/ci/server-mutation');
  fs.mkdirSync(dir);
  for (const name of fs.readdirSync(source))
    fs.copyFileSync(path.join(source, name), path.join(dir, name));
  fs.copyFileSync(
    path.join(source, '../server-mutation-check.mjs'),
    path.join(dir, '..', SCRIPT_NAME)
  );
  const [chk04, chk05b] = ['CHK-04', 'CHK-05b'].map(id => CHECKS.find(c => c.id === id));
  const settings = cleanBaseline().checks['CHK-05b'];
  const before = [predicateDigest(chk04, settings, dir), predicateDigest(chk05b, settings, dir)];
  fs.appendFileSync(path.join(dir, 'chk05b.mjs'), '\n// predicate edit\n');
  assert.equal(predicateDigest(chk04, settings, dir), before[0]);
  assert.notEqual(predicateDigest(chk05b, settings, dir), before[1]);
  // The shared evaluation is part of every check's predicate (Astra r1 B11).
  const shared = before.map((_, i) => predicateDigest([chk04, chk05b][i], settings, dir));
  fs.appendFileSync(path.join(dir, 'evaluate.mjs'), '\n// evaluation edit\n');
  assert.notEqual(predicateDigest(chk04, settings, dir), shared[0]);
  assert.notEqual(predicateDigest(chk05b, settings, dir), shared[1]);
  for (const key of ['unit', 'predicate', 'coverageMin'])
    assert.notEqual(
      predicateDigest(chk04, { ...settings, [key]: key === 'coverageMin' ? 1 : 'changed' }, dir),
      before[0],
      key
    );
});

test('a shallow clone fetches the base sha once; a base the origin cannot serve exits 2', t => {
  const { repo, baseSha } = scenario(t, tree(cleanBaseline()), tree(cleanBaseline()));
  git(repo, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  const clone = path.join(tempDir(t, 'smc-clone-'), 'c');
  git(path.dirname(clone), 'clone', '--quiet', '--depth', '1', `file://${repo}`, clone);
  assert.throws(() => git(clone, 'cat-file', '-e', `${baseSha}^{commit}`));
  const { code, report } = runCli(clone, ['--base', baseSha]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  assert.equal(report.base, baseSha);
  assert.equal(runCli(clone, ['--base', 'ffffffffffffffffffffffffffffffffffffffff']).code, 2);
});
