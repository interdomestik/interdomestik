// The registry freeze of the WP-05 flip (D-7; r2-B1/B2/B4/B5/B6, r3-B1): while CHK-22 enforces, the
// consent registry must be empty, and no exception admits an entry. No base registry is consulted,
// so a registration that reached main during the advisory interval, even with a base already in
// `fail` mode, is refused rather than inherited.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BASELINE,
  LEGACY,
  adopted,
  baselineOf,
  owner,
  scan,
} from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit } from './fixtures/screen-contract-check/harness.mjs';
import {
  PAGE,
  entryOf,
  judgeHead,
  registryFiles,
} from './fixtures/screen-contract-check/cli-cases-fixtures.mjs';

const W = 'apps/web/src';
const TEST = `${W}/app/signup/terms.test.ts`;
const terms = (more = {}) =>
  entryOf({
    id: 'terms',
    file: PAGE,
    control: 'terms',
    useId: 'signup',
    useFile: PAGE,
    action: 'saveTerms',
    testFile: TEST,
    more,
  });
const TERMS_PAGE = `import { saveTerms } from '@/actions/consent';\nexport default function P() { return <form action={saveTerms} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" aria-label="Terms" /></form>; }\n`;
const ITEMS = { 'CHK-15c': [LEGACY] };
const fail = exceptions => baselineOf(ITEMS, { mode: 'fail', exceptions });
const chk22 = result => result.report.checks['CHK-22'];
// A pair whose base baseline is `baseBaseline` (judgeHead's base is always in report mode).
function judgeOn(t, baseBaseline, baseFiles, headFiles) {
  const { root, base } = adopted(t, baseBaseline, baseFiles);
  const head = commit(root, headFiles);
  return scan(t, root, ['--base', base, '--head', head]);
}

test('D-7: at the cutover a registration is frozen, and a fresh #registry exception does not admit it', t => {
  const head = { ...registryFiles([terms()]), [PAGE]: TERMS_PAGE };
  const plain = judgeHead(t, { ...head, [BASELINE]: fail([]) });
  assert.equal(plain.code, 1);
  assert.deepEqual(chk22(plain).tamper, ['CHK-22#registry-frozen:terms']);
  const excepted = judgeHead(t, {
    ...head,
    [BASELINE]: fail([owner('CHK-22', '#registry:terms', 'added')]),
  });
  assert.equal(excepted.code, 1);
  assert.ok(chk22(excepted).tamper.includes('CHK-22#registry-frozen:terms'));
});

test('D-7: in report mode on both sides a registration is no frozen finding', t => {
  const result = judgeHead(t, { ...registryFiles([terms()]), [PAGE]: TERMS_PAGE });
  assert.equal(result.code, 0, JSON.stringify(result.report?.errors));
  assert.deepEqual(chk22(result).tamper, []);
});

test('D-7: a base that already enforces and holds an entry is not inherited (r3-B1)', t => {
  const base = { ...registryFiles([terms()]), [PAGE]: TERMS_PAGE };
  const kept = judgeOn(t, fail([]), base, { [`${W}/app/ok/other.tsx`]: 'export const x = 1;\n' });
  assert.deepEqual(kept.report.errors, []);
  assert.deepEqual(chk22(kept).tamper, ['CHK-22#registry-frozen:terms']);
  assert.equal(kept.code, 1);
});

test('D-7: an empty registry under enforcement passes', t => {
  const result = judgeOn(t, fail([]), {}, { [`${W}/app/ok/other.tsx`]: 'export const x = 1;\n' });
  assert.equal(result.code, 0, JSON.stringify(result.report?.errors));
  assert.deepEqual(chk22(result).tamper, []);
});

test('D-7: a not-consent entry is frozen too', t => {
  const news = { id: 'news', kind: 'not-consent', file: PAGE, control: 'news', reason: 'fixture' };
  const registry = { version: 1, entries: [news] };
  const result = judgeOn(
    t,
    baselineOf(ITEMS),
    {},
    {
      'scripts/ci/screen-contract-consent-registry.json': `${JSON.stringify(registry, null, 2)}\n`,
      [BASELINE]: fail([]),
    }
  );
  assert.deepEqual(result.report.errors, []);
  assert.ok(chk22(result).tamper.includes('CHK-22#registry-frozen:news'));
  assert.equal(result.code, 1);
});
