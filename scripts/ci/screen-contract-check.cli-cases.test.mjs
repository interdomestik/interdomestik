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
import {
  DB_IMPORT,
  REG,
  W,
  adopted,
  scan,
} from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit, git, tempDir, tree } from './fixtures/screen-contract-check/harness.mjs';

const SAVE = `${W}/actions/consent.ts`;
const ACTIONS =
  "'use server';\nexport async function saveTerms() {}\nexport async function saveDraft() {}\nexport async function saveMarketing() {}\n";
const PAGE = `${W}/app/signup/page.tsx`;
const errorsOf = result => (result.report?.errors ?? []).join('\n');

// An adopted repository (fixture baseline, empty registry) with `headFiles` committed on top, and
// the production CLI's verdict on that pair.
function judgeHead(t, headFiles, baseFiles = {}, extraArgs = []) {
  const { root, base } = adopted(t, undefined, baseFiles);
  const head = commit(root, headFiles);
  return { root, base, head, ...scan(t, root, [...extraArgs, '--base', base, '--head', head]) };
}

const okRun = result => {
  assert.equal(result.code, 0, errorsOf(result));
  assert.deepEqual(result.report.errors, []);
  return result.report.checks;
};

// The fields of each kind a use's test must name (registry.mjs, REQUIRED_BY_KIND).
const KIND_FIELDS = Object.freeze({
  consent: { payloadField: 'acceptTerms', storedIn: 'consents', versionSource: 'TERMS_VERSION' },
  selection: { selectedRecord: 'selectedPlanId', storedIn: 'plans' },
});

const entryOf = ({
  id,
  kind = 'consent',
  file,
  control,
  useId,
  useFile,
  action,
  testFile,
  more,
}) => ({
  id,
  kind,
  file,
  control,
  ...KIND_FIELDS[kind],
  uses: [{ useId, file: useFile, submission: `${SAVE}#${action}`, test: testFile }],
  ...more,
});

// A use test that holds every piece of evidence: it imports and calls the submission and names the
// entry, the use, the fields of its kind and (for consent) a time field.
function evidenceText(entry, omit = null) {
  const use = entry.uses[0];
  const action = use.submission.split('#')[1];
  const names = [entry.id, use.useId, ...Object.values(KIND_FIELDS[entry.kind]), 'acceptedAt'];
  const said = names.filter(name => name !== omit).join(' ');
  return `import { ${action} } from '@/actions/consent';\nit('${said}', async () => {\n  await ${action}();\n});\n`;
}

const registryFiles = (entries, omit = null) => ({
  [SAVE]: ACTIONS,
  [REG]: `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
  ...Object.fromEntries(entries.map(entry => [entry.uses[0].test, evidenceText(entry, omit)])),
});

const CONTROL = '<input type="checkbox" id="terms" data-consent="terms" aria-label="Terms" />';

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
  for (const name of ['screen-contract/no-database-import', 'jsx-a11y/alt-text']) {
    const configFile = variantConfig(
      t,
      `export default [...config, { files: ['${W}/app/ok/**'], rules: { '${name}': 'warn' } }];`
    );
    await rejectsWith(
      lintTree(root, linted(root), { configFile }),
      `${name} is not enabled at error for ${OK_PAGE}`
    );
  }
});

// --- 3. CHK-22 formAction ---------------------------------------------------------------------

const termsEntry = () =>
  entryOf({
    id: 'terms',
    file: PAGE,
    control: 'terms',
    useId: 'signup',
    useFile: PAGE,
    action: 'saveTerms',
    testFile: `${W}/app/signup/terms.test.ts`,
  });
const formActionPage = button =>
  `import { saveTerms, saveDraft } from '@/actions/consent';\nexport default function P() { return <form action={saveTerms} data-consent-use="terms:signup">${CONTROL}${button}</form>; }\n`;

test('CLI case 3: a submit button whose formAction names another action is submission-mismatch', t => {
  const files = button => ({ ...registryFiles([termsEntry()]), [PAGE]: formActionPage(button) });
  const bad = okRun(judgeHead(t, files('<button formAction={saveDraft}>Draft</button>')));
  assert.deepEqual(bad['CHK-22'].new, [`CHK-22|${PAGE}|submission-mismatch|terms:signup`]);
  const good = okRun(judgeHead(t, files('<button formAction={saveTerms}>Save</button>')));
  assert.deepEqual([good['CHK-22'].new, good['CHK-22'].total], [[], 0]);
});

// --- 4. CHK-22 selfSubmitting -----------------------------------------------------------------

const OWN = `${W}/components/newsletter.tsx`;
const EMBEDDER = `${W}/app/home/page.tsx`;
const newsletterFiles = action => ({
  ...registryFiles([
    entryOf({
      id: 'newsletter',
      file: OWN,
      control: 'nl',
      useId: 'own',
      useFile: OWN,
      action: 'saveMarketing',
      testFile: `${W}/components/newsletter.test.ts`,
      more: { exportName: 'Newsletter', selfSubmitting: true },
    }),
  ]),
  [OWN]: `import { ${action} } from '@/actions/consent';\nexport function Newsletter() { return <form action={${action}} data-consent-use="newsletter:own"><input type="checkbox" id="nl" data-consent="newsletter" aria-label="News" /></form>; }\n`,
  [EMBEDDER]:
    "import { Newsletter } from '@/components/newsletter';\nexport default function H() { return <main><Newsletter /></main>; }\n",
});

test('CLI case 4: a selfSubmitting component is judged in its own file; its embedder needs nothing', t => {
  const passing = okRun(judgeHead(t, newsletterFiles('saveMarketing')));
  assert.deepEqual([passing['CHK-22'].new, passing['CHK-22'].total], [[], 0]);
  const changed = okRun(judgeHead(t, newsletterFiles('saveDraft')));
  assert.deepEqual(changed['CHK-22'].new, [`CHK-22|${OWN}|submission-mismatch|newsletter:own`]);
});

// --- 5. A11Y scope ----------------------------------------------------------------------------

const PROFILE = `${W}/app/profile/page.tsx`;
const profilePage = extra =>
  `import { Input } from '@interdomestik/ui';\nimport { FancyField } from '@/components/fancy-field';\nexport default function P({ field }) { return <form><input type="hidden" name="token" value="x" /><FancyField /><Input {...field} />${extra}</form>; }\n`;

test('CLI case 5: hidden input, unmapped wrapper and spread control are out of A11Y scope, as reported', t => {
  const files = extra => ({
    [`${W}/components/fancy-field.tsx`]: 'export const FancyField = () => <div />;\n',
    [PROFILE]: profilePage(extra),
  });
  const scoped = okRun(judgeHead(t, files('')))['A11Y'];
  assert.deepEqual(scoped.new, []);
  assert.equal(scoped.units['skipped-spread'], 1);
  assert.equal(scoped.units.control, undefined, JSON.stringify(scoped.units));
  // The check is live in that file: one plain unlabelled input is counted and reported.
  const live = okRun(judgeHead(t, files('<input type="text" name="q" />')))['A11Y'];
  assert.deepEqual(live.new, [`A11Y|${PROFILE}|screen-contract/labelled-control|input`]);
  assert.deepEqual([live.units.control, live.units['skipped-spread']], [1, 1]);
});

// --- 6. Root and web @/ mappings --------------------------------------------------------------

test('CLI case 6: @/x follows the root tsconfig for a package and the web one for a web file', t => {
  const checks = okRun(
    judgeHead(t, {
      // Root: @/x is packages/database/src/x.ts (layer 4). Web: @/x is apps/web/src/x.ts (layer 1).
      'tsconfig.json':
        '{\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["packages/database/src/*"] } }\n}\n',
      'packages/database/src/x.ts': 'export const x = 4;\n',
      [`${W}/x.ts`]: 'export const x = 1;\n',
      // Layer 3 importing layer 4: allowed. Under the web mapping it would import layer 1.
      'packages/domain-claims/src/p.ts': "import { x } from '@/x';\nexport const p = x;\n",
      // Layer 2 importing layer 1: a finding. Under the root mapping it would import layer 4.
      [`${W}/actions/c.ts`]:
        "'use server';\nimport { x } from '@/x';\nexport async function c() { return x; }\n",
    })
  );
  assert.deepEqual(checks['CHK-15a'].new, [`CHK-15a|${W}/actions/c.ts|@/x`]);
});

// --- 9. Rediscovery after a catalogue-only commit ---------------------------------------------

const CATALOGUE = `${W}/messages/en/app.json`;
const PREFS = `${W}/app/prefs/page.tsx`;
const PREFS_PAGE = [
  "import { useTranslations } from 'next-intl';",
  "import { Checkbox } from '@interdomestik/ui';",
  'export default function P() { const t = useTranslations(\'signup\'); return <div><Checkbox id="n3" /><label htmlFor="n3">{t(\'neutral\')}</label></div>; }',
  '',
].join('\n');
const catalogueText = label => `${JSON.stringify({ signup: { neutral: label } })}\n`;

test('CLI case 9: a catalogue-only change that makes a label mention terms rediscovers the control', t => {
  const { root, base } = adopted(t, undefined, {
    [PREFS]: PREFS_PAGE,
    [CATALOGUE]: catalogueText('Box one'),
  });
  assert.deepEqual(okRun(scan(t, root, ['--base', base, '--head', base]))['CHK-22'].new, []);
  const head = commit(root, { [CATALOGUE]: catalogueText('I accept the terms') });
  assert.equal(git(root, 'diff', '--name-only', base, head), CATALOGUE);
  const checks = okRun(scan(t, root, ['--base', base, '--head', head]));
  assert.deepEqual(checks['CHK-22'].new, [`CHK-22|${PREFS}|unregistered|Checkbox:n3`]);
});
