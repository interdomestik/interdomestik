// Negative and scope cases of the screen-contract checks run through the production CLI (WP-05
// code review): each asserts the named diagnostic or item key, not only an exit code. Where a head
// tree cannot reach a diagnostic (the ESLint config comes from the scanner's own checkout and
// inline config is off), a CLI case proves that, and the reconciliation is tested on its own with a
// config variant.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { ScanError } from './server-mutation/ast.mjs';
import { CONFIG_PATH, SCANNER_ROOT, lintTree, linted } from './screen-contract/lint.mjs';
import { DB_IMPORT, W, scan } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { tempDir, tree } from './fixtures/screen-contract-check/harness.mjs';
import {
  PAGE,
  entryOf,
  judgeHead,
  okRun,
  registryFiles,
} from './fixtures/screen-contract-check/cli-cases-fixtures.mjs';

// --- 1. A valid selection entry whose test does not name its selected record -----------------

const PLAN_TEST = `${W}/app/signup/plan.test.ts`;
const planEntry = () =>
  entryOf({
    id: 'plan',
    kind: 'selection',
    file: PAGE,
    control: 'plan',
    useId: 'signup',
    useFile: PAGE,
    action: 'saveTerms',
    testFile: PLAN_TEST,
  });
const PLAN_PAGE = `import { saveTerms } from '@/actions/consent';\nexport default function P() { return <form action={saveTerms} data-consent-use="plan:signup"><input type="checkbox" id="plan" data-consent="plan" aria-label="Plan" /></form>; }\n`;

test('CLI case 1: a valid selection use whose test omits selectedRecord is the evidence error', t => {
  const missing = judgeHead(t, {
    ...registryFiles([planEntry()], 'selectedPlanId'),
    [PAGE]: PLAN_PAGE,
  });
  assert.equal(missing.code, 2);
  assert.deepEqual(missing.report.errors, [
    `consent registry plan:signup test ${PLAN_TEST} does not name selectedPlanId`,
  ]);
  // The same entry with the record named passes: the registry itself is valid.
  const named = judgeHead(t, { ...registryFiles([planEntry()]), [PAGE]: PLAN_PAGE });
  assert.deepEqual(okRun(named)['CHK-22'].new, []);
});

// --- 2, 7, 8. Reconciliation of the lint results: unreachable from a head tree ----------------

// A config that re-exports the real one, with `body` defining its default export.
function variantConfig(t, body) {
  const dir = tempDir(t, 'scc-config-');
  const real = pathToFileURL(path.join(SCANNER_ROOT, CONFIG_PATH)).href;
  const file = path.join(dir, 'config.mjs');
  const reexports = ['A11Y_EXCLUDED', 'A11Y_RULES', 'LOCAL_RULES']
    .map(name => `export const ${name} = real.${name};`)
    .join('\n');
  fs.writeFileSync(
    file,
    `import config, * as real from ${JSON.stringify(real)};\n${reexports}\n${body}\n`
  );
  return file;
}

const OK_PAGE = `${W}/app/ok/page.tsx`;
const twoScreens = t =>
  tree(t, {
    [OK_PAGE]: 'export default () => null;\n',
    [`${W}/app/other/page.tsx`]: 'export default () => null;\n',
  });

async function rejectsWith(promise, message) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof ScanError, String(error));
    assert.equal(error.message, message);
    return true;
  });
}

// What a head tree might try in order to drop a file from the lint: its own flat config and
// ignore file at the root, its own copy of the screen-contract config, and inline directives.
const IGNORE_ATTEMPTS = Object.freeze({
  'eslint.config.mjs': `export default [{ ignores: ['${W}/app/hidden/**'] }];\n`,
  '.eslintignore': `${W}/app/hidden/\n`,
  [CONFIG_PATH]: "export default [{ ignores: ['**'] }];\n",
  [`${W}/app/hidden/page.tsx`]: `/* eslint-disable */\n/* eslint screen-contract/no-database-import: "off" */\n${DB_IMPORT}`,
});
const HIDDEN_ITEM = `CHK-15c|${W}/app/hidden/page.tsx|@interdomestik/database`;

test('CLI cases 2, 7, 8: a head tree cannot ignore a file or disable a rule (replay and production)', t => {
  const production = judgeHead(t, IGNORE_ATTEMPTS);
  assert.deepEqual(okRun(production)['CHK-15c'].new, [HIDDEN_ITEM]);
  const replay = scan(t, production.root, [
    '--replay',
    '--base',
    production.base,
    '--head',
    production.head,
  ]);
  assert.deepEqual(okRun(replay)['CHK-15c'].new, [HIDDEN_ITEM]);
  assert.equal(replay.report.replay.complete, true);
});

test('function case 2: an expected file with no lint result is the missing-result diagnostic', async t => {
  const root = twoScreens(t);
  // ESLint reports every existing expected file (an ignored one too, with warnIgnored), so only
  // an expected path that names no result reaches this branch: here, a non-canonical spelling.
  const odd = `${W}/app/ok/../ok/page.tsx`;
  await rejectsWith(lintTree(root, [odd]), `${odd} is missing from the lint results`);
});

test('function cases 2, 7: an expected file the config ignores is the ignored diagnostic', async t => {
  const root = twoScreens(t);
  const configFile = variantConfig(t, `export default [...config, { ignores: ['${OK_PAGE}'] }];`);
  await rejectsWith(
    lintTree(root, linted(root), { configFile }),
    `${OK_PAGE} is ignored by the screen-contract config`
  );
});

test('function case 8: a check rule not at error for an expected file is the reconciliation diagnostic', async t => {
  const root = twoScreens(t);
  const names = ['screen-contract/no-database-import', 'jsx-a11y/alt-text'];
  await Promise.all(
    names.map(name => {
      const configFile = variantConfig(
        t,
        `export default [...config, { files: ['${W}/app/ok/**'], rules: { '${name}': 'warn' } }];`
      );
      return rejectsWith(
        lintTree(root, linted(root), { configFile }),
        `${name} is not enabled at error for ${OK_PAGE}`
      );
    })
  );
});

// --- L6 (WP-05 flip): CHK-09 formatters are bound by value, through the production CLI ------------

test('CLI case L6: a value shadow is no formatter; a type shadow keeps the imported formatter', t => {
  const file = `${W}/components/l6.tsx`;
  const result = judgeHead(t, {
    [file]: [
      "import { format } from 'date-fns';",
      'export function Value({ d, format }) { return <p>{format(d)}</p>; }',
      'export function Type<format>({ d }: { d: Date }) { return <p>{format(d, "P")}</p>; }',
    ].join('\n'),
    // r3-B8: the initializer reads the import; the body's own `format` is a local.
    [`${W}/components/l6-default.jsx`]: [
      "import { format } from 'date-fns';",
      "export function Default({ d, label = format(d, 'P') }) { const format = x => String(x); return <p>{label}{format(d)}</p>; }",
    ].join('\n'),
  });
  const checks = okRun(result);
  assert.deepEqual(
    checks['CHK-09'].new.filter(id => id.includes(file)),
    [`CHK-09|${file}|date-fns.format`]
  );
  assert.deepEqual(
    checks['CHK-09'].new.filter(id => id.includes('l6-default')),
    [`CHK-09|${W}/components/l6-default.jsx|date-fns.format`]
  );
});
