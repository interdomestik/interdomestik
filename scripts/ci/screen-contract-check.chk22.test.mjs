import assert from 'node:assert/strict';
import test from 'node:test';

import { ids, lint, tree } from './fixtures/screen-contract-check/harness.mjs';

const W = 'apps/web/src';
const REG = 'scripts/ci/screen-contract/consent-registry.json';
const SAVE = `${W}/actions/consent.ts`;
const ACTIONS = `'use server';\nexport async function saveTerms() {}\nexport async function saveDraft() {}\nexport async function saveMarketing() {}\nexport async function saveToggle() {}\n`;
const registry = entries => JSON.stringify({ version: 1, entries });
const use = (useId, file, name = 'saveTerms') => ({
  useId,
  file,
  submission: `${SAVE}#${name}`,
  test: `${W}/x.test.ts`,
});
const consent = (id, file, control, uses, extra = {}) => ({
  id,
  kind: 'consent',
  file,
  control,
  payloadField: 'acceptTerms',
  storedIn: 'consents',
  versionSource: 'TERMS_VERSION',
  uses,
  ...extra,
});
const base = files => ({
  [SAVE]: ACTIONS,
  [`${W}/messages/en/app.json`]: JSON.stringify({
    signup: { terms: 'I agree', neutral: 'Box one', sneaky: 'I accept the terms' },
  }),
  ...files,
});
const chk22 = async root => ids(await lint(root), 'CHK-22');
const PAGE = `${W}/app/signup/page.tsx`;
const head = "import { saveTerms, saveDraft, saveMarketing } from '@/actions/consent';\n";

test('CHK-22 discovery: attribute, handler, label key and catalogue text (B3)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [file]: [
        "import { useTranslations } from 'next-intl';",
        "import { Checkbox } from '@interdomestik/ui';",
        'export function D({ setAgreed }) {',
        "  const t = useTranslations('signup');",
        '  return (<div>',
        '    <input type="checkbox" name="terms" />',
        '    <Checkbox id="box" onCheckedChange={setAgreed} />',
        '    <label><input type="checkbox" id="n1" />{t("terms")}</label>',
        '    <Checkbox id="n2" /><label htmlFor="n2">{t("sneaky")}</label>',
        '    <Checkbox id="n3" /><label htmlFor="n3">{t("neutral")}</label>',
        '    <input type="text" name="terms" />',
        '  </div>);',
        '}',
      ].join('\n'),
    })
  );
  assert.deepEqual(await chk22(root), [
    `CHK-22|${file}|unregistered|Checkbox:box`,
    `CHK-22|${file}|unregistered|Checkbox:n2`,
    `CHK-22|${file}|unregistered|input:n1`,
    `CHK-22|${file}|unregistered|input:terms`,
  ]);
});

test('CHK-22: a label key missing from the catalogue is a scanner error', async t => {
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [PAGE]:
        "import { useTranslations } from 'next-intl';\nexport default function P() { const t = useTranslations('signup'); return <label><input type=\"checkbox\" />{t('gone')}</label>; }\n",
    })
  );
  await assert.rejects(lint(root), /signup\.gone is not in the English catalogue/u);
});

test('CHK-22: registered, marked and invoking the registered submission passes', async t => {
  const root = tree(
    t,
    base({
      [REG]: registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]),
      [PAGE]: `${head}export default function P() { return <form action={saveTerms} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), []);
});

test('CHK-22: action changed to another submission is submission-mismatch (B16)', async t => {
  const root = tree(
    t,
    base({
      [REG]: registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]),
      [PAGE]: `${head}export default function P() { return <form action={saveDraft} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${PAGE}|submission-mismatch|terms:signup`]);
});

test('CHK-22: an onSubmit handler named in the file, through startTransition, passes', async t => {
  const root = tree(
    t,
    base({
      [REG]: registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]),
      [PAGE]: `${head}import { startTransition } from 'react';\nimport { toast } from 'sonner';\nexport default function P() {\n  function onSubmit(e) { e.preventDefault(); toast('x'); startTransition(async () => { await saveTerms(); }); }\n  return <form onSubmit={onSubmit} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" /></form>;\n}\n`,
    })
  );
  assert.deepEqual(await chk22(root), []);
});

test('CHK-22: a submit callback received through props is unresolved-submission', async t => {
  const root = tree(
    t,
    base({
      [REG]: registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]),
      [PAGE]: `export default function P({ onSave }) { return <form onSubmit={() => onSave()} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${PAGE}|unresolved-submission|terms:signup`]);
});

test('CHK-22: formAction on a submit button is an invoked submission too (post-r5)', async t => {
  const page = withButton =>
    `${head}export default function P() { return <form action={saveTerms} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" />${withButton}</form>; }\n`;
  const reg = registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]);
  const bad = tree(
    t,
    base({ [REG]: reg, [PAGE]: page('<button formAction={saveDraft}>Draft</button>') })
  );
  assert.deepEqual(await chk22(bad), [`CHK-22|${PAGE}|submission-mismatch|terms:signup`]);
  const good = tree(
    t,
    base({ [REG]: reg, [PAGE]: page('<button formAction={saveTerms}>Save</button>') })
  );
  assert.deepEqual(await chk22(good), []);
});

test('CHK-22: two controls in one form list both uses; omitting one is unmatched (B20)', async t => {
  const reg = registry([
    consent('terms', PAGE, 'terms', [use('signup', PAGE)]),
    consent('marketing', PAGE, 'marketing', [use('signup', PAGE)]),
  ]);
  const page = list =>
    `${head}export default function P() { return <form action={saveTerms} data-consent-use="${list}"><input type="checkbox" id="terms" data-consent="terms" /><input type="checkbox" id="marketing" data-consent="marketing" /></form>; }\n`;
  assert.deepEqual(
    await chk22(tree(t, base({ [REG]: reg, [PAGE]: page('terms:signup marketing:signup') }))),
    []
  );
  assert.deepEqual(await chk22(tree(t, base({ [REG]: reg, [PAGE]: page('terms:signup') }))), [
    `CHK-22|${PAGE}|orphan-use|marketing:signup`,
    `CHK-22|${PAGE}|unmatched-boundary|marketing`,
  ]);
});

const SHARED = 'packages/ui/src/components/consent-box.tsx';
const SHARED_FILES = {
  [SHARED]:
    'export function ConsentBox() { return <input type="checkbox" id="terms" data-consent="terms" />; }\n',
  'packages/ui/src/index.ts':
    "export * from './components/button';\nexport { ConsentBox } from './components/consent-box';\n",
};

test('CHK-22: a shared control: the definition needs no use; each form needs its own (B11, B16)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const reg = uses =>
    registry([consent('terms', SHARED, 'terms', uses, { exportName: 'ConsentBox' })]);
  const twoForms = (a, b) =>
    `${head}import { ConsentBox } from '@interdomestik/ui';\nexport function A() { return <form action={saveTerms}${a}><ConsentBox /></form>; }\nexport function B() { return <form action={saveTerms}${b}><ConsentBox /></form>; }\n`;
  // Definition alone, no render: passes.
  assert.deepEqual(await chk22(tree(t, base({ ...SHARED_FILES, [REG]: reg([]) }))), []);
  // One use listed by both forms: shared-use. A second form unmarked: unmatched-boundary.
  const shared = tree(
    t,
    base({
      ...SHARED_FILES,
      [REG]: reg([use('a', forms)]),
      [forms]: twoForms(' data-consent-use="terms:a"', ' data-consent-use="terms:a"'),
    })
  );
  assert.deepEqual(await chk22(shared), [`CHK-22|${forms}|shared-use|terms:a`]);
  const unmarked = tree(
    t,
    base({
      ...SHARED_FILES,
      [REG]: reg([use('a', forms)]),
      [forms]: twoForms(' data-consent-use="terms:a"', ''),
    })
  );
  assert.deepEqual(await chk22(unmarked), [`CHK-22|${forms}|unmatched-boundary|terms`]);
  const both = tree(
    t,
    base({
      ...SHARED_FILES,
      [REG]: reg([use('a', forms), use('b', forms)]),
      [forms]: twoForms(' data-consent-use="terms:a"', ' data-consent-use="terms:b"'),
    })
  );
  assert.deepEqual(await chk22(both), []);
});

test('CHK-22: wrappers: unregistered is unmatched in its file; registered as an alias passes', async t => {
  const wrapper = `${W}/components/terms-field.tsx`;
  const caller = `${W}/app/c/page.tsx`;
  const files = aliases => ({
    ...SHARED_FILES,
    [wrapper]:
      "import { ConsentBox } from '@interdomestik/ui';\nexport function TermsField() { return <div><ConsentBox /></div>; }\n",
    [caller]: `${head}import { TermsField } from '@/components/terms-field';\nexport default function C() { return <form action={saveTerms} data-consent-use="terms:c"><TermsField /></form>; }\n`,
    [REG]: registry([
      consent('terms', SHARED, 'terms', [use('c', caller)], { exportName: 'ConsentBox', aliases }),
    ]),
  });
  assert.deepEqual(await chk22(tree(t, base(files([])))), [
    `CHK-22|${caller}|orphan-use|terms:c`,
    `CHK-22|${wrapper}|unmatched-boundary|terms`,
  ]);
  assert.deepEqual(
    await chk22(tree(t, base(files([{ file: wrapper, exportName: 'TermsField' }])))),
    []
  );
});

test('CHK-22: a selfSubmitting component: its own form is judged, embedders need nothing (post-r5)', async t => {
  const own = `${W}/components/newsletter.tsx`;
  const embedder = `${W}/app/home/page.tsx`;
  const component = action =>
    `import { ${action} } from '@/actions/consent';\nexport function Newsletter() { return <form action={${action}} data-consent-use="newsletter:own"><input type="checkbox" id="nl" data-consent="newsletter" /></form>; }\n`;
  const files = action => ({
    [own]: component(action),
    [embedder]:
      "import { Newsletter } from '@/components/newsletter';\nexport default function H() { return <main><Newsletter /></main>; }\n",
    [REG]: registry([
      consent('newsletter', own, 'nl', [use('own', own, 'saveMarketing')], {
        exportName: 'Newsletter',
        selfSubmitting: true,
      }),
    ]),
  });
  assert.deepEqual(await chk22(tree(t, base(files('saveMarketing')))), []);
  assert.deepEqual(await chk22(tree(t, base(files('saveDraft')))), [
    `CHK-22|${own}|submission-mismatch|newsletter:own`,
  ]);
});

test('CHK-22: a settings toggle with no form is its own boundary', async t => {
  const file = `${W}/components/settings.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([
        consent('marketing', file, 'email-marketing', [use('toggle', file, 'saveToggle')]),
      ]),
      [file]:
        'import { Switch } from \'@interdomestik/ui\';\nimport { saveToggle } from \'@/actions/consent\';\nexport function S() { return <Switch id="email-marketing" data-consent="marketing" data-consent-use="marketing:toggle" onCheckedChange={v => saveToggle(v)} />; }\n',
    })
  );
  assert.deepEqual(await chk22(root), []);
});

test('CHK-22: misbound ids and an empty registry fail closed', async t => {
  const other = `${W}/app/other/page.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]),
      [PAGE]: `${head}export default function P() { return <form action={saveTerms} data-consent-use="terms:signup"><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n`,
      [other]: `export default function O() { return <input type="checkbox" id="terms" data-consent="terms" />; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${other}|misbound|terms`]);
  const empty = tree(
    t,
    base({
      [REG]: registry([]),
      [PAGE]: `export default function P() { return <input type="checkbox" id="terms" data-consent="terms" />; }\n`,
    })
  );
  assert.deepEqual(await chk22(empty), [`CHK-22|${PAGE}|misbound|terms`]);
});
