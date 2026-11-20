// Contract tests of the screen-contract CLI's baseline lifecycle (WP-05 code review r1: B9, B10,
// H6): rebuilt declarations, retired checks and the evaluator digest.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  CHECKS,
  evaluatorDigest,
  lockfileDigest,
  toolVersions,
} from './screen-contract/evaluate.mjs';
import { SCANNER_ROOT } from './screen-contract/lint.mjs';
import {
  BASELINE,
  DB_IMPORT,
  DB_PAGE,
  LEGACY,
  REBUILT,
  adopted,
  asText,
  baselineData,
  baselineOf,
  owner,
  scan,
} from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit, tempDir } from './fixtures/screen-contract-check/harness.mjs';

const errorsOf = result => (result.report?.errors ?? []).join('\n');

test('B9: a rebuilt declaration that is not a canonical tracked screen path is an error', t => {
  const { root, base } = adopted(t);
  for (const listed of [
    `./${DB_PAGE}`,
    `${DB_PAGE}x`,
    'apps/web/src//app/legacy/page.tsx',
    'apps/web/src/app/a|b/page.tsx', // r2 B9: `|` is the item-key separator
  ]) {
    const head = commit(root, { [REBUILT]: `${JSON.stringify([listed])}\n` }, `list ${listed}`);
    const result = scan(t, root, ['--base', base, '--head', head]);
    assert.equal(
      result.code,
      2,
      `${listed}: ${JSON.stringify(result.report?.checks?.['CHK-15c'])}`
    );
    assert.match(errorsOf(result), /rebuilt/u);
  }
});

test('B9: a newly declared rebuilt file must be a screen of the head', t => {
  const { root, base } = adopted(t);
  const head = commit(root, {
    [REBUILT]: `${JSON.stringify(['apps/web/src/lib/helper.ts'])}\n`,
    'apps/web/src/lib/helper.ts': 'export const x = 1;\n',
  });
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(result.code, 2);
  assert.match(errorsOf(result), /not a screen/u);
});

test('B9: a scoped run keeps the owner-approved removal of a rebuilt entry', t => {
  const { root } = adopted(t);
  const listed = commit(root, { [REBUILT]: `${JSON.stringify([DB_PAGE])}\n` });
  const removed = commit(root, {
    [REBUILT]: '[]\n',
    [BASELINE]: baselineOf(
      { 'CHK-15c': [LEGACY] },
      { exceptions: [owner('rebuilt', `#rebuilt:${DB_PAGE}`, 'downgrade')] }
    ),
  });
  const scoped = scan(t, root, ['--base', listed, '--head', removed, '--check', 'CHK-15c']);
  assert.deepEqual(scoped.report.errors, []);
  assert.ok(!scoped.report.checks['CHK-15c'].tamper.includes(`rebuilt#removed:${DB_PAGE}`));
  const full = scan(t, root, ['--base', listed, '--head', removed]);
  assert.ok(!full.report.checks['CHK-15c'].tamper.includes(`rebuilt#removed:${DB_PAGE}`));
});

test('B10: a check the trusted base enforces and the scanner retired is judged as a removal', t => {
  const data = baselineData({ 'CHK-15c': [LEGACY] });
  data.checks['CHK-99'] = {
    mode: 'fail',
    unit: 'u',
    predicate: 'p',
    coverageMin: 0,
    items: ['CHK-99|x'],
  };
  const { root, base } = adopted(t, asText(data));
  // The head cannot name a check the scanner no longer has, so it drops the row.
  const head = commit(root, { [BASELINE]: baselineOf({ 'CHK-15c': [LEGACY] }) });
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.deepEqual(result.report.errors, []);
  const retired = result.report.checks['CHK-99'];
  assert.ok(retired, JSON.stringify(Object.keys(result.report.checks)));
  assert.equal(retired.retired, true);
  assert.equal(retired.files, 0); // r5 B9: a retired check examines no file
  assert.ok(retired.tamper.length > 0);
  assert.equal(result.code, 1);
  const approved = commit(root, {
    [BASELINE]: baselineOf(
      { 'CHK-15c': [LEGACY] },
      { exceptions: [owner('CHK-99', '#check', 'downgrade')] }
    ),
  });
  const after = scan(t, root, ['--base', base, '--head', approved]);
  assert.deepEqual(after.report.checks['CHK-99'].tamper, []);
  assert.equal(after.code, 0);
});

test('H6: the evaluator digest changes with the mode and with the lockfile', () => {
  const settings = { mode: 'report', unit: 'u', predicate: 'p', coverageMin: 0 };
  const versions = { node: 'v0', eslint: '0' };
  const report = evaluatorDigest(settings, undefined, versions);
  assert.notEqual(report, evaluatorDigest({ ...settings, mode: 'fail' }, undefined, versions));
  assert.notEqual(
    report,
    evaluatorDigest(settings, undefined, { ...versions, lockfile: 'other' }),
    'versions enter the digest'
  );
});

test("code-r2 H6: the digest reads the scanner checkout's own lockfile", () => {
  const lock = fs.readFileSync(path.join(SCANNER_ROOT, 'pnpm-lock.yaml'), 'utf8');
  const versions = toolVersions();
  assert.equal(versions.lockfile, createHash('sha256').update(lock).digest('hex'));
  const settings = { mode: 'report', unit: 'u', predicate: 'p', coverageMin: 0 };
  assert.equal(evaluatorDigest(settings), evaluatorDigest(settings, undefined, versions));
  assert.notEqual(
    evaluatorDigest(settings),
    evaluatorDigest(settings, undefined, { ...versions, lockfile: 'other' })
  );
});

test('code-r2 H6: a scanner checkout without its lockfile is an error', t => {
  const root = tempDir(t, 'scc-nolock-');
  fs.cpSync(path.join(SCANNER_ROOT, 'package.json'), path.join(root, 'package.json'));
  assert.throws(() => lockfileDigest(root), /pnpm-lock\.yaml is missing/u);
});

test('H6: the CHK-15b coverage floor names every edge kind measured at adoption', async () => {
  const { readFileSync } = await import('node:fs');
  const real = JSON.parse(
    readFileSync(new URL('./screen-contract-baseline.json', import.meta.url))
  );
  const floor = real.checks['CHK-15b'].coverageMin;
  for (const kind of ['file', 'edge:import', 'edge:type', 'edge:dynamic'])
    assert.ok(floor[kind] > 0, `${kind} is floored`);
  assert.equal(CHECKS.length, 6);
});

test('H3: a registered use naming a support file CHK-22 never visits is an orphan', t => {
  const W = 'apps/web/src';
  const support = `${W}/lib/consent-helper.ts`;
  const testFile = `${W}/lib/consent-helper.test.ts`;
  const action = `${W}/actions/consent.ts`;
  const registry = {
    version: 1,
    entries: [
      {
        id: 'terms',
        kind: 'consent',
        file: support,
        control: 'terms',
        payloadField: 'acceptTerms',
        storedIn: 'consents',
        versionSource: 'TERMS_VERSION',
        uses: [
          { useId: 'helper', file: support, submission: `${action}#saveTerms`, test: testFile },
        ],
      },
    ],
  };
  const { root, base } = adopted(t);
  const head = commit(root, {
    [action]: "'use server';\nexport async function saveTerms() {}\n",
    [support]: 'export const helper = 1;\n',
    [testFile]: [
      "import { saveTerms } from '@/actions/consent';",
      "it('terms helper stores acceptTerms in consents with TERMS_VERSION and acceptedAt', async () => {",
      '  await saveTerms();',
      '});',
      '',
    ].join('\n'),
    'scripts/ci/screen-contract/consent-registry.json': `${JSON.stringify(registry)}\n`,
  });
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.deepEqual(result.report.errors, []);
  assert.ok(
    result.report.checks['CHK-22'].new.includes(`CHK-22|${support}|orphan-use|terms:helper`),
    JSON.stringify(result.report.checks['CHK-22'].new)
  );
});

test('r2 B3: a committed symbolic link anywhere in the head tree is a scanner error', async t => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { tempDir, git } = await import('./fixtures/screen-contract-check/harness.mjs');
  const outside = tempDir(t, 'scc-outside-');
  fs.writeFileSync(
    path.join(outside, 'x.json'),
    '{ "consent": { "terms": "I accept the terms" } }\n'
  );
  for (const rel of [
    'apps/web/src/messages/en/linked.json',
    'apps/web/src/app/linked/page.tsx',
    'packages/linked',
  ]) {
    const { root, base } = adopted(t);
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.symlinkSync(
      rel === 'packages/linked' ? outside : path.join(outside, 'x.json'),
      path.join(root, rel)
    );
    git(root, 'add', '-A');
    git(root, 'commit', '--quiet', '-m', 'link');
    const head = git(root, 'rev-parse', 'HEAD');
    const result = scan(t, root, ['--base', base, '--head', head]);
    assert.equal(result.code, 2, rel);
    assert.match(result.report.errors.join('\n'), /symbolic link/u, rel);
  }
});

test('r2 B9: a rebuilt screen whose path holds the key separator is refused, not half-matched', t => {
  const piped = 'apps/web/src/app/a|b/page.tsx';
  const item = `CHK-15c|${piped}|@interdomestik/database`;
  const { root, base } = adopted(t, baselineOf({ 'CHK-15c': [LEGACY, item] }), {
    [piped]: "import { db } from '@interdomestik/database';\nexport default () => db;\n",
  });
  const head = commit(root, { [REBUILT]: `${JSON.stringify([piped])}\n` });
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.equal(result.code, 2, JSON.stringify(result.report?.checks?.['CHK-15c']));
  assert.match(errorsOf(result), /non-canonical path/u);
});

// The rebuild notice counts a replaced line once (code-r2 optional): 30 of 100 lines replaced is
// not "more than half"; 60 replaced is.
test('code-r2: the likely-rebuild notice counts a replaced line once', t => {
  // The notice concerns baselined files: the legacy page with its database import.
  const page = DB_PAGE;
  const body = n => Array.from({ length: n }, (_, i) => `// line ${i}`);
  const withEdits = edited =>
    `${body(100)
      .map((line, i) => (i < edited ? `${line} edited` : line))
      .join('\n')}\n${DB_IMPORT}`;
  const { root, base } = adopted(t, undefined, { [page]: withEdits(0) });
  const notice = new RegExp(`likely rebuild: ${page} changes more than half`, 'u');
  const small = commit(root, { [page]: withEdits(30) });
  const smallRun = scan(t, root, ['--base', base, '--head', small]);
  assert.equal(smallRun.code, 0, JSON.stringify(smallRun.report.errors));
  assert.ok(!smallRun.report.changes.signals.some(line => notice.test(line)));
  const large = commit(root, { [page]: withEdits(60) });
  const largeRun = scan(t, root, ['--base', base, '--head', large]);
  assert.ok(largeRun.report.changes.signals.some(line => notice.test(line)));
});

// r5 blocker 9: a check whose removal the owner recorded is still linted; its report keeps the
// files it examined.
test('r5 B9: a removed check is published with its files', t => {
  const { root, base } = adopted(t);
  const data = baselineData(
    { 'CHK-15c': [LEGACY] },
    { exceptions: [owner('CHK-09', '#check', 'downgrade')] }
  );
  delete data.checks['CHK-09'];
  const head = commit(root, { [BASELINE]: asText(data) });
  const result = scan(t, root, ['--base', base, '--head', head]);
  assert.deepEqual(result.report.errors, []);
  const removed = result.report.checks['CHK-09'];
  // r6 hardening: the count is the one measured on the same tree with the check present.
  const measured = scan(t, root, ['--base', base, '--head', base]).report.checks['CHK-09'].files;
  assert.ok(measured > 1, String(measured));
  assert.equal(removed?.files, measured, JSON.stringify(removed));
});
