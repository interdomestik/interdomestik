// The candidate judgment of the R-10 replay (the WP-05 flip, §4; r2-B8, r3-B6): each pair judged as
// PR-B's required workflow would judge it. The admitted inventory is the candidate's scan of the
// parent, through production's rebuilt-list admission; each tree has its own revision's floor.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECKS, evaluatorDigest } from './screen-contract/evaluate.mjs';
import { candidateBaseline } from './screen-contract/replay.mjs';
import { candidateJudgment } from './screen-contract/replay-candidate.mjs';
import { commit, git, repo } from './fixtures/screen-contract-check/harness.mjs';
import {
  BASELINE,
  LANES,
  W,
  baselineOf,
  run,
} from './fixtures/screen-contract-check/replay-fixtures.mjs';

const REG = 'scripts/ci/screen-contract-consent-registry.json';
const REBUILT = 'scripts/ci/screen-contract-rebuilt-screens.json';
const DB_PAGE = `${W}/app/legacy/page.tsx`;
const DB_IMPORT = "import { db } from '@interdomestik/database';\nexport default () => db;\n";
const LEGACY = `CHK-15c|${DB_PAGE}|@interdomestik/database`;
const OK_PAGE = `${W}/app/ok/page.tsx`;

function adoptedPair(t, baselineText, headFiles) {
  const root = repo(t, {
    ...LANES,
    [REG]: '{ "version": 1, "entries": [] }\n',
    [REBUILT]: '[]\n',
    [DB_PAGE]: DB_IMPORT,
    [OK_PAGE]: 'export default () => null;\n',
    [BASELINE]: baselineText,
  });
  const base = git(root, 'rev-parse', 'HEAD');
  return { root, base, head: commit(root, headFiles) };
}

const judged = (t, { root, base, head }) => {
  const { code, report } = run(t, root, ['--replay', '--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report?.errors));
  return report.replay.candidateJudgment;
};

test('§4: a head whose baseline admits a genuinely new item gets it as new', t => {
  const added = `CHK-15c|${W}/app/new/page.tsx|@interdomestik/database`;
  const j = judged(
    t,
    adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }), {
      [`${W}/app/new/page.tsx`]: DB_IMPORT,
      [BASELINE]: baselineOf({ 'CHK-15c': [LEGACY, added] }),
    })
  );
  assert.deepEqual(j.checks['CHK-15c'].new, [added]);
  assert.ok(j.wouldRefuse.includes('CHK-15c'));
  assert.deepEqual(j.errors, []);
});

test('§4: a head that removes a violation gets it as fixed (friction)', t => {
  const j = judged(
    t,
    adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }), {
      [DB_PAGE]: 'export default () => null;\n',
      [BASELINE]: baselineOf(),
    })
  );
  assert.deepEqual(j.checks['CHK-15c'].fixed, [LEGACY]);
  assert.deepEqual(j.checks['CHK-15c'].new, []);
});

// r3-B6: production admits nothing on a rebuilt screen, so the candidate does not either.
test('r3-B6: a screen declared rebuilt with its violation kept is new, as in production', t => {
  const pair = adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }), {
    [REBUILT]: `${JSON.stringify([DB_PAGE])}\n`,
    [BASELINE]: baselineOf(),
  });
  const production = run(t, pair.root, ['--base', pair.base, '--head', pair.head]);
  assert.deepEqual(production.report.checks['CHK-15c'].new, [LEGACY]);
  const j = judged(t, pair);
  assert.deepEqual(j.checks['CHK-15c'].new, [LEGACY]);
  assert.ok(j.wouldRefuse.includes('CHK-15c'));
});

test('r3-B6: an unchanged pair is clean; the candidate digest is PR-B’s, the floor the revision’s', t => {
  const floor = { 'CHK-15c': { file: 1 } };
  const j = judged(
    t,
    adoptedPair(t, baselineOf({ 'CHK-15c': [LEGACY] }, floor), {
      'notes.md': 'x\n',
    })
  );
  assert.deepEqual(j.wouldRefuse, []);
  const c = j.checks['CHK-15c'];
  assert.deepEqual(c.floors.base, { source: 'real', value: { file: 1 } });
  assert.deepEqual(c.floors.head, { source: 'real', value: { file: 1 } });
  const candidate = candidateBaseline();
  for (const { id } of CHECKS)
    assert.equal(
      j.checks[id].digest.candidate,
      evaluatorDigest({ ...candidate.checks[id], mode: 'fail' }),
      id
    );
});

test('r3-B6: an adoption pair uses completeness on the parent and the real floor on the head', t => {
  const root = repo(t, { ...LANES, [OK_PAGE]: 'export default () => null;\n' });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, {
    [REG]: '{ "version": 1, "entries": [] }\n',
    [REBUILT]: '[]\n',
    [BASELINE]: baselineOf({}, { 'CHK-15c': { file: 1 } }),
  });
  const j = judged(t, { root, base, head });
  assert.deepEqual(j.checks['CHK-15c'].floors.base, { source: 'completeness', value: 0 });
  assert.deepEqual(j.checks['CHK-15c'].floors.head, { source: 'real', value: { file: 1 } });
  assert.deepEqual(j.errors, []);
});

// The floors are judged per revision: a head that raises its floor above its own count, or a base
// below its own floor, is a recorded scanner error of that check.
test('r3-B6: a floor above the revision’s own count is a recorded scanner error', () => {
  const candidate = candidateBaseline();
  const lint = Object.fromEntries(
    CHECKS.map(({ id }) => [id, { items: [], units: { file: 1 }, files: 1 }])
  );
  const real = floor => ({
    checks: Object.fromEntries(CHECKS.map(({ id }) => [id, { coverageMin: floor }])),
  });
  const ctx = over => ({
    candidate,
    baseLint: lint,
    headLint: lint,
    baseReal: real({ file: 1 }),
    headReal: real({ file: 1 }),
    baseExtra: {},
    headExtra: {},
    headRegistry: new Map(),
    rebuilt: [],
    tamper: {},
    shas: { base: 'a', head: 'b' },
    ...over,
  });
  assert.deepEqual(candidateJudgment(ctx({})).errors, []);
  const raised = candidateJudgment(ctx({ headReal: real({ file: 2 }) }));
  assert.match(raised.errors.join('\n'), /coverage below minimum/u);
  const low = candidateJudgment(ctx({ baseReal: real({ file: 2 }) }));
  assert.match(low.errors.join('\n'), /base coverage below its floor/u);
});

test('§4: under the candidate a head registry entry is frozen (D-7)', () => {
  const candidate = candidateBaseline();
  const lint = Object.fromEntries(CHECKS.map(({ id }) => [id, { items: [], units: {}, files: 1 }]));
  const j = candidateJudgment({
    candidate,
    baseLint: lint,
    headLint: lint,
    baseReal: null,
    headReal: null,
    baseExtra: {},
    headExtra: {},
    headRegistry: new Map([['terms', { id: 'terms', uses: [] }]]),
    rebuilt: [],
    tamper: {},
    shas: { base: 'a', head: 'b' },
  });
  assert.deepEqual(j.checks['CHK-22'].tamper, ['CHK-22#registry-frozen:terms']);
  assert.deepEqual(j.wouldRefuse, ['CHK-22']);
});
