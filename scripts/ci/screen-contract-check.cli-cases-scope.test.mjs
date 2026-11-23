import assert from 'node:assert/strict';
import test from 'node:test';

import { W, adopted, scan } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { commit, git } from './fixtures/screen-contract-check/harness.mjs';
import {
  PAGE,
  entryOf,
  judgeHead,
  okRun,
  registryFiles,
} from './fixtures/screen-contract-check/cli-cases-fixtures.mjs';

const CONTROL = '<input type="checkbox" id="terms" data-consent="terms" aria-label="Terms" />';

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
        '{\n  "compilerOptions": { "moduleResolution": "bundler", "baseUrl": ".", "paths": { "@/*": ["packages/database/src/*"] } }\n}\n',
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

// --- r3 B10: reachable §5 cases at the CLI ---------------------------------------------------

// A tracked source under a node_modules directory is in the inventory, and ESLint ignores it: the
// run is a scanner error naming the file, in production and in replay, never a silent skip.
for (const rel of ['packages/node_modules/src/sample.ts', `${W}/node_modules/x/page.tsx`])
  test(`r3 B10: a tracked ${rel} is the ignored-file error at the CLI`, t => {
    const message = `${rel} is ignored by the screen-contract config`;
    const production = judgeHead(t, { [rel]: 'export const x = 1;\n' });
    assert.equal(production.code, 2);
    assert.deepEqual(production.report.errors, [message]);
    const replay = scan(t, production.root, [
      '--replay',
      '--base',
      production.base,
      '--head',
      production.head,
    ]);
    assert.equal(replay.code, 2);
    assert.deepEqual(replay.report.errors, [message]);
  });

test('r3 B10: CHK-15a sees a layer-2 file whose prologue is use strict then use server', t => {
  const action = `${W}/features/g/actions.ts`;
  const checks = okRun(
    judgeHead(t, {
      [`${W}/components/view.tsx`]: 'export const View = () => null;\n',
      [action]:
        "'use strict';\n'use server';\nimport { View } from '@/components/view';\nexport async function g() { return View; }\n",
    })
  );
  assert.deepEqual(checks['CHK-15a'].new, [`CHK-15a|${action}|@/components/view`]);
});

test('r3 B10: two forms in one file listing one use are shared-use at the CLI', t => {
  const forms = `${W}/app/forms/page.tsx`;
  const entry = entryOf({
    id: 'terms',
    file: forms,
    control: 'terms',
    useId: 'a',
    useFile: forms,
    action: 'saveTerms',
    testFile: `${W}/app/forms/terms.test.ts`,
  });
  const form = `<form action={saveTerms} data-consent-use="terms:a">${CONTROL}</form>`;
  const checks = okRun(
    judgeHead(t, {
      ...registryFiles([entry]),
      [forms]: `import { saveTerms } from '@/actions/consent';\nexport function A() { return ${form}; }\nexport default function B() { return ${form}; }\n`,
    })
  );
  assert.deepEqual(checks['CHK-22'].new, [`CHK-22|${forms}|shared-use|terms:a`]);
});

// --- r3 B9: the per-check inventory counts what each rule examines -----------------------------

test('r3 B9: a tree whose only sources are screens has no CHK-15a source, an input error', t => {
  // Every layer-2, -3 and -4 source of the fixture removed; screens and shared UI remain.
  const production = judgeHead(t, {
    'packages/domain-claims/src/index.ts': null,
    'packages/database/src/index.ts': null,
    'packages/database/src/schema/index.ts': null,
  });
  assert.equal(production.code, 2);
  assert.deepEqual(production.report.errors, ['no expected file for CHK-15a']);
});
