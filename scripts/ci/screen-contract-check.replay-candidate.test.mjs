import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { CHECKS } from './screen-contract/evaluate.mjs';
import { replaySummary, synthesizedBaseline } from './screen-contract/replay.mjs';
import { commit, git, repo, tempDir } from './fixtures/screen-contract-check/harness.mjs';
import {
  BASELINE,
  LANES,
  W,
  baselineOf,
  run,
} from './fixtures/screen-contract-check/replay-fixtures.mjs';

test('r3 B8: a synthesized baseline carries the candidate settings; a partial candidate is refused (r4 B6)', () => {
  const lint = Object.fromEntries(CHECKS.map(({ id }) => [id, { items: [] }]));
  const settings = mode => ({ mode, unit: 'u', predicate: 'p' });
  const full = {
    checks: Object.fromEntries(
      CHECKS.map(({ id }) => [id, settings(id === 'CHK-15c' ? 'fail' : 'report')])
    ),
  };
  const baseline = synthesizedBaseline('a'.repeat(40), lint, full);
  assert.equal(baseline.checks['CHK-15c'].mode, 'fail');
  assert.equal(baseline.checks['CHK-09'].mode, 'report');
  assert.throws(
    () => synthesizedBaseline('a'.repeat(40), lint, { checks: { 'CHK-15c': settings('fail') } }),
    /candidate baseline has no settings for CHK-/u
  );
  // Empty settings are no settings (r5 B8).
  const empty = { checks: Object.fromEntries(CHECKS.map(({ id }) => [id, {}])) };
  assert.throws(
    () => synthesizedBaseline('a'.repeat(40), lint, empty),
    /candidate baseline has no settings for CHK-/u
  );
});

test('r3 B8: a replay without its candidate baseline or revision is not complete', t => {
  const args = { takenAt: 'x', synthesized: {}, baseLint: null, results: [], versions: {} };
  const bare = tempDir(t, 'scc-candidate-');
  assert.throws(() => replaySummary(args, bare), /candidate scanner checkout has no baseline/u);
  fs.mkdirSync(path.join(bare, path.dirname(BASELINE)), { recursive: true });
  // A candidate baseline without every check's settings is no provenance either (r4 B6).
  fs.writeFileSync(
    path.join(bare, BASELINE),
    JSON.stringify({ version: 1, takenAt: 'x', checks: {}, exceptions: [] })
  );
  assert.throws(() => replaySummary(args, bare), /candidate baseline has no settings for CHK-/u);
  fs.writeFileSync(path.join(bare, BASELINE), baselineOf());
  assert.throws(() => replaySummary(args, bare), /candidate scanner revision cannot be read/u);
});

test('r3 B9: a historical pair whose head deletes its last screen completes, adjudicated', t => {
  const page = `${W}/app/only/page.tsx`;
  const root = repo(t, { ...LANES, [page]: 'export default () => null;\n' });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, { [page]: null });
  // (Production refuses such a pair earlier: it has no baseline. The production side of an empty
  // check is the inputs test 'a tree with no screen file is an input error'.)
  const { code, report } = run(t, root, ['--replay', '--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report.errors));
  assert.equal(report.replay.complete, true);
  const lines = report.replay.adjudicate;
  assert.ok(lines.includes('CHK-15c: inventory decrease 1 -> 0'), JSON.stringify(lines));
  assert.ok(
    lines.includes('CHK-15c: no file to examine on the head (historical pair; adjudicate)')
  );
});

// r4 blocker 5: the CHK-15a inventory is its eligible sources, so removing a screen is no
// CHK-15a inventory decrease.
test('r4 B5: removing a screen is no CHK-15a inventory decrease', t => {
  const page = `${W}/app/only/page.tsx`;
  const root = repo(t, {
    ...LANES,
    [page]: 'export default () => null;\n',
    [`${W}/app/kept/page.tsx`]: 'export default () => null;\n',
    [`${W}/actions/save.ts`]: "'use server';\nexport async function save() {}\n",
  });
  const base = git(root, 'rev-parse', 'HEAD');
  const head = commit(root, { [page]: null });
  const { code, report } = run(t, root, ['--replay', '--base', base, '--head', head]);
  assert.equal(code, 0, JSON.stringify(report.errors));
  const lines = report.replay.adjudicate;
  assert.ok(lines.includes('CHK-15c: inventory decrease 2 -> 1'), JSON.stringify(lines));
  assert.ok(!lines.some(line => line.startsWith('CHK-15a: inventory')), JSON.stringify(lines));
  // The published inventory is the eligible sources: the sum of the `source:<layer>` units.
  const { files, units } = report.checks['CHK-15a'];
  const sources = Object.entries(units).filter(([kind]) => kind.startsWith('source:'));
  assert.equal(
    files,
    sources.reduce((sum, [, n]) => sum + n, 0)
  );
  assert.ok(files > 0);
});
