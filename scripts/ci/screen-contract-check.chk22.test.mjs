import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ids, lint, tempDir, tree, writeTree } from './fixtures/screen-contract-check/harness.mjs';
import { originIn, originOf } from './screen-contract/origins.mjs';

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
// Every lint needs a screen (code-r2: a check with no expected file is an input error).
const base = files => ({
  [`${W}/app/home/page.tsx`]: 'export default () => null;\n',
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
    `CHK-22|${PAGE}|unmatched-boundary|marketing@P`,
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
  assert.deepEqual(await chk22(unmarked), [`CHK-22|${forms}|unmatched-boundary|terms@B`]);
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
    `CHK-22|${wrapper}|unmatched-boundary|terms@TermsField`,
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

// A relative-only resolver, so the origin tests do not depend on the workspace resolver.
const relativeResolver = root => ({
  root,
  resolveFile(fromRel, specifier) {
    if (!specifier.startsWith('.')) return null;
    const stem = path.posix.join(path.posix.dirname(fromRel), specifier);
    return (
      ['.ts', '.tsx'].map(ext => stem + ext).find(rel => fs.existsSync(path.join(root, rel))) ??
      null
    );
  },
});

test('CHK-22 origins: export * searches every star; none is unresolved, two are ambiguous (B6)', t => {
  const root = writeTree(tempDir(t), {
    'm/none.ts': 'export const Other = 1;\n',
    'm/has.ts': 'export const X = 1;\n',
    'm/also.ts': 'export const X = 2;\n',
    'm/via.ts': "export * from './has';\n",
    'm/later.ts': "export * from './none';\nexport * from './has';\n",
    'm/missing.ts': "export * from './none';\n",
    'm/twice.ts': "export * from './has';\nexport * from './also';\n",
    'm/diamond.ts': "export * from './has';\nexport * from './via';\n",
    'm/renamed.ts': 'const Local = 1;\nexport { Local as Public };\n',
    'm/barrel.ts': "export * from './none';\nexport { Public as Again } from './renamed';\n",
  });
  const resolver = relativeResolver(root);
  assert.deepEqual(originOf(resolver, 'x.ts', './m/later', 'X'), {
    file: 'm/has.ts',
    name: 'X',
    local: 'X',
  });
  assert.deepEqual(originOf(resolver, 'x.ts', './m/diamond', 'X'), {
    file: 'm/has.ts',
    name: 'X',
    local: 'X',
  });
  const renamed = { file: 'm/renamed.ts', name: 'Public', local: 'Local' };
  assert.deepEqual(originOf(resolver, 'x.ts', './m/renamed', 'Public'), renamed);
  assert.deepEqual(originOf(resolver, 'x.ts', './m/barrel', 'Again'), renamed);
  const missing = originOf(resolver, 'x.ts', './m/missing', 'X');
  assert.equal(missing.unresolved, true);
  assert.equal(missing.ambiguous, undefined);
  const twice = originOf(resolver, 'x.ts', './m/twice', 'X');
  assert.equal(twice.unresolved, true);
  assert.equal(twice.ambiguous, true);
});

const STAR_FILES = {
  [SHARED]: SHARED_FILES[SHARED],
  'packages/ui/src/index.ts':
    "export * from './components/button';\nexport * from './components/consent-box';\n",
};

test('CHK-22: a render through an export * chain past a module without the name is found (B6)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const root = tree(
    t,
    base({
      ...STAR_FILES,
      [REG]: registry([consent('terms', SHARED, 'terms', [], { exportName: 'ConsentBox' })]),
      [forms]: `${head}import { ConsentBox } from '@interdomestik/ui';\nexport function A() { return <form action={saveTerms}><ConsentBox /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${forms}|unmatched-boundary|terms@A`]);
});

test('CHK-22: the alias exemption covers only the alias component, not its whole file (B6)', async t => {
  const wrapper = `${W}/components/terms-field.tsx`;
  const caller = `${W}/app/c/page.tsx`;
  const root = tree(
    t,
    base({
      ...SHARED_FILES,
      [wrapper]: `${head}import { ConsentBox } from '@interdomestik/ui';\nexport function TermsField() { return <div><ConsentBox /></div>; }\nexport function Second() { return <form action={saveTerms}><ConsentBox /></form>; }\n`,
      [caller]: `${head}import { TermsField } from '@/components/terms-field';\nexport default function C() { return <form action={saveTerms} data-consent-use="terms:c"><TermsField /></form>; }\n`,
      [REG]: registry([
        consent('terms', SHARED, 'terms', [use('c', caller)], {
          exportName: 'ConsentBox',
          aliases: [{ file: wrapper, exportName: 'TermsField' }],
        }),
      ]),
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${wrapper}|unmatched-boundary|terms@Second`]);
});

test('CHK-22: the definition exemption covers only the exported component that owns the control (B6)', async t => {
  const reg = registry([consent('terms', SHARED, 'terms', [], { exportName: 'ConsentBox' })]);
  const definition =
    'export function ConsentBox() { return <input type="checkbox" id="terms" data-consent="terms" />; }\n';
  const inline = tree(
    t,
    base({
      [REG]: reg,
      [SHARED]: `${definition}export function Inline() { return <form><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(inline), [`CHK-22|${SHARED}|unmatched-boundary|terms@Inline`]);
  const local = tree(
    t,
    base({
      [REG]: reg,
      [SHARED]: `${definition}export function Local() { return <form><ConsentBox /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(local), [`CHK-22|${SHARED}|unmatched-boundary|terms@Local`]);
});

const signupReg = () => registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]);
const CONTROL = '<input type="checkbox" id="terms" data-consent="terms" />';

test('CHK-22: a prop or local that shadows the imported action is not the action (B7)', async t => {
  const prop = tree(
    t,
    base({
      [REG]: signupReg(),
      [PAGE]: `${head}export default function P({ saveTerms }) { return <form action={saveTerms} data-consent-use="terms:signup">${CONTROL}</form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(prop), [`CHK-22|${PAGE}|unresolved-submission|terms:signup`]);
  const local = tree(
    t,
    base({
      [REG]: signupReg(),
      [PAGE]: `${head}import { startTransition } from 'react';\nexport default function P({ make }) {\n  function onSubmit(e) { e.preventDefault(); const saveTerms = make(); startTransition(() => saveTerms()); }\n  return <form onSubmit={onSubmit} data-consent-use="terms:signup">${CONTROL}</form>;\n}\n`,
    })
  );
  assert.deepEqual(await chk22(local), [`CHK-22|${PAGE}|unresolved-submission|terms:signup`]);
});

test('CHK-22: a call inside a nested function the handler never invokes does not count (B7)', async t => {
  const page = body =>
    `${head}export default function P() {\n  function onSubmit(e) { e.preventDefault(); ${body} }\n  return <form onSubmit={onSubmit} data-consent-use="terms:signup">${CONTROL}</form>;\n}\n`;
  const never = tree(
    t,
    base({ [REG]: signupReg(), [PAGE]: page('const later = async () => { await saveTerms(); };') })
  );
  assert.deepEqual(await chk22(never), [`CHK-22|${PAGE}|unresolved-submission|terms:signup`]);
  const called = tree(
    t,
    base({
      [REG]: signupReg(),
      [PAGE]: page('const run = async () => { await saveTerms(); }; run();'),
    })
  );
  assert.deepEqual(await chk22(called), []);
});

test('CHK-22: a form with action and onSubmit checks both submit paths (B7)', async t => {
  const page = call =>
    `${head}import { startTransition } from 'react';\nexport default function P() { return <form action={saveTerms} onSubmit={e => { e.preventDefault(); startTransition(() => ${call}()); }} data-consent-use="terms:signup">${CONTROL}</form>; }\n`;
  assert.deepEqual(await chk22(tree(t, base({ [REG]: signupReg(), [PAGE]: page('saveDraft') }))), [
    `CHK-22|${PAGE}|submission-mismatch|terms:signup`,
  ]);
  assert.deepEqual(
    await chk22(tree(t, base({ [REG]: signupReg(), [PAGE]: page('saveTerms') }))),
    []
  );
});

test('CHK-22: formAction counts only on submit-capable buttons and inputs (B7)', async t => {
  const page = control =>
    `${head}import { Button, Input } from '@interdomestik/ui';\nexport default function P() { return <form action={saveTerms} data-consent-use="terms:signup">${CONTROL}${control}</form>; }\n`;
  const judge = async control =>
    chk22(tree(t, base({ [REG]: signupReg(), [PAGE]: page(control) })));
  const mismatch = [`CHK-22|${PAGE}|submission-mismatch|terms:signup`];
  assert.deepEqual(await judge('<button type="button" formAction={saveDraft}>x</button>'), []);
  assert.deepEqual(await judge('<button type="reset" formAction={saveDraft}>x</button>'), []);
  assert.deepEqual(await judge('<input type="text" formAction={saveDraft} />'), []);
  assert.deepEqual(await judge('<Button type="button" formAction={saveDraft}>x</Button>'), []);
  assert.deepEqual(await judge('<Input formAction={saveDraft} />'), []);
  assert.deepEqual(
    await judge('<button type="submit" formAction={saveDraft}>x</button>'),
    mismatch
  );
  assert.deepEqual(await judge('<input type="image" formAction={saveDraft} />'), mismatch);
  assert.deepEqual(await judge('<Button formAction={saveDraft}>x</Button>'), mismatch);
  assert.deepEqual(await judge('<Input type="submit" formAction={saveDraft} />'), mismatch);
});

test('CHK-22 discovery: a dynamic data-consent and each aria-labelledby id count (H2)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [file]: [
        "import { useTranslations } from 'next-intl';",
        "import { Checkbox } from '@interdomestik/ui';",
        'export function D({ kind }) {',
        "  const t = useTranslations('signup');",
        '  return (<div>',
        '    <Checkbox id="box1" data-consent={kind} />',
        '    <Checkbox id="n4" aria-labelledby="h1 h2" />',
        '    <span id="h1">{t("neutral")}</span><span id="h2">{t("sneaky")}</span>',
        '  </div>);',
        '}',
      ].join('\n'),
    })
  );
  assert.deepEqual(await chk22(root), [
    `CHK-22|${file}|unregistered|Checkbox:box1`,
    `CHK-22|${file}|unregistered|Checkbox:n4`,
  ]);
});

test('CHK-22: two unmarked boundaries rendering one entry in a file have distinct keys (H2)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const reg = registry([consent('terms', SHARED, 'terms', [], { exportName: 'ConsentBox' })]);
  const imports = `${head}import { ConsentBox } from '@interdomestik/ui';\n`;
  const twoComponents = tree(
    t,
    base({
      ...SHARED_FILES,
      [REG]: reg,
      [forms]: `${imports}export function A() { return <form action={saveTerms}><ConsentBox /></form>; }\nexport function B() { return <form action={saveTerms}><ConsentBox /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(twoComponents), [
    `CHK-22|${forms}|unmatched-boundary|terms@A`,
    `CHK-22|${forms}|unmatched-boundary|terms@B`,
  ]);
  const oneComponent = tree(
    t,
    base({
      ...SHARED_FILES,
      [REG]: reg,
      [forms]: `${imports}export function A() { return <div><form action={saveTerms}><ConsentBox /></form><form action={saveTerms}><ConsentBox /></form></div>; }\n`,
    })
  );
  assert.deepEqual(await chk22(oneComponent), [
    `CHK-22|${forms}|unmatched-boundary|terms@A`,
    `CHK-22|${forms}|unmatched-boundary|terms@A#2`,
  ]);
});

test('CHK-22: a marker-only boundary is judged although it renders nothing (H2)', async t => {
  const unknown = tree(
    t,
    base({
      [REG]: signupReg(),
      [PAGE]: `${head}export default function P() { return <div><form action={saveTerms} data-consent-use="terms:signup">${CONTROL}</form><form action={saveDraft} data-consent-use="bogus:x" /></div>; }\n`,
    })
  );
  assert.deepEqual(await chk22(unknown), [`CHK-22|${PAGE}|unmatched-boundary|bogus:x@P#2`]);
  const listed = tree(
    t,
    base({
      [REG]: signupReg(),
      [PAGE]: `${head}export default function P() { return <form action={saveDraft} data-consent-use="terms:signup"><p>x</p></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(listed), [
    `CHK-22|${PAGE}|orphan-use|terms:signup`,
    `CHK-22|${PAGE}|submission-mismatch|terms:signup`,
  ]);
});

const handlerPage = (imports, body) =>
  `${head}${imports}export default function P({ register, makeHandler }) {\n${body}\n  return <form onSubmit={onSubmit} data-consent-use="terms:signup">${CONTROL}</form>;\n}\n`;
const judgeHandler = async (t, imports, body) =>
  chk22(tree(t, base({ [REG]: signupReg(), [PAGE]: handlerPage(imports, body) })));
const UNRESOLVED = [`CHK-22|${PAGE}|unresolved-submission|terms:signup`];

test('CHK-22: a callback passed to an unrecognised call is not invoked by the handler (code-r2 B6)', async t => {
  assert.deepEqual(
    await judgeHandler(
      t,
      '',
      '  function onSubmit(e) { e.preventDefault(); register(() => saveTerms()); }'
    ),
    UNRESOLVED
  );
});

test('CHK-22: only an identity wrapper makes its argument the named handler (code-r2 B6)', async t => {
  assert.deepEqual(
    await judgeHandler(
      t,
      '',
      '  const onSubmit = makeHandler(async () => { await saveTerms(); });'
    ),
    UNRESOLVED
  );
  assert.deepEqual(
    await judgeHandler(
      t,
      "import { useCallback } from 'react';\n",
      '  const onSubmit = useCallback(async () => { await saveTerms(); }, []);'
    ),
    []
  );
  assert.deepEqual(
    await judgeHandler(
      t,
      "import * as React from 'react';\n",
      '  const onSubmit = React.useCallback(async () => { await saveTerms(); }, []);'
    ),
    []
  );
});

test('CHK-22: the recognised invoking wrappers and a direct call credit the submission (code-r2 B6)', async t => {
  const cases = [
    [
      "import { useTransition } from 'react';\n",
      '  const [pending, start] = useTransition();\n  function onSubmit() { start(async () => { await saveTerms(); }); }',
    ],
    [
      "import * as React from 'react';\n",
      '  function onSubmit() { React.startTransition(async () => { await saveTerms(); }); }',
    ],
    ['', '  function onSubmit() { queueMicrotask(() => saveTerms()); }'],
    ['', '  function onSubmit() { (async () => { await saveTerms(); })(); }'],
  ];
  const judged = await Promise.all(cases.map(([imports, body]) => judgeHandler(t, imports, body)));
  judged.forEach((found, index) => assert.deepEqual(found, [], cases[index][1]));
  assert.deepEqual(
    await judgeHandler(
      t,
      '',
      '  const startTransition = register;\n  function onSubmit() { startTransition(() => saveTerms()); }'
    ),
    UNRESOLVED
  );
});

test('CHK-22: a component exported under another name is found at its importers (code-r2 B7)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const root = tree(
    t,
    base({
      [SHARED]:
        'const Local = () => <input type="checkbox" id="terms" data-consent="terms" />;\nexport { Local as ConsentBox };\n',
      'packages/ui/src/index.ts':
        "export * from './components/button';\nexport { ConsentBox } from './components/consent-box';\n",
      [REG]: registry([
        consent('terms', SHARED, 'terms', [use('a', forms)], { exportName: 'ConsentBox' }),
      ]),
      [forms]: `${head}import { ConsentBox } from '@interdomestik/ui';\nexport function A() { return <form action={saveTerms} data-consent-use="terms:a"><ConsentBox /></form>; }\nexport function B() { return <form action={saveTerms}><ConsentBox /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${forms}|unmatched-boundary|terms@B`]);
});

test('CHK-22 discovery: a translator resolves in the label scope, not by its name (code-r2 H)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [`${W}/messages/en/app.json`]: JSON.stringify({
        signup: { sneaky: 'I accept the terms' },
        other: { sneaky: 'Box two' },
      }),
      [file]: [
        "import { useTranslations } from 'next-intl';",
        "import { Checkbox } from '@interdomestik/ui';",
        "export function A() { const t = useTranslations('signup'); return <label><Checkbox id=\"a1\" />{t('sneaky')}</label>; }",
        "export function B() { const t = useTranslations('other'); return <label><Checkbox id=\"b1\" />{t('sneaky')}</label>; }",
      ].join('\n'),
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${file}|unregistered|Checkbox:a1`]);
});

test('CHK-22 origins: a path leaving the tree, an absolute path or a link is refused; a missing file is not an empty one (r3 F1)', t => {
  const outer = tempDir(t);
  const root = writeTree(path.join(outer, 'tree'), {
    'm/empty.ts': '',
    'm/has.ts': 'export const X = 1;\n',
  });
  writeTree(outer, { 'outside.ts': 'export const X = 1;\n' });
  fs.symlinkSync(path.join(outer, 'outside.ts'), path.join(root, 'm/link.ts'));
  const resolver = relativeResolver(root);
  assert.throws(
    () => originIn(resolver, '../outside.ts', 'X'),
    /not a plain path inside the tree/u
  );
  assert.throws(
    () => originIn(resolver, path.join(outer, 'outside.ts'), 'X'),
    /not a plain path inside the tree/u
  );
  assert.throws(
    () => originIn(resolver, 'm/link.ts', 'X'),
    /m\/link\.ts: link\.ts is a symbolic link/u
  );
  assert.deepEqual(originIn(resolver, 'm/gone.ts', 'X'), {
    file: 'm/gone.ts',
    name: 'X',
    unresolved: true,
    missing: true,
  });
  assert.equal(originIn(resolver, 'm/empty.ts', 'X'), null);
  assert.deepEqual(originIn(resolver, 'm/has.ts', 'X'), {
    file: 'm/has.ts',
    name: 'X',
    local: 'X',
  });
});

const LOCAL = `${W}/lib/local.ts`;
const LOCAL_FILE = {
  [LOCAL]: 'export async function saveLocally() {}\nexport const helpers = { save() {} };\n',
};

test('CHK-22: an action or formAction is credited only when it is a layer-2 export (r3 F5)', async t => {
  const localUse = { ...use('signup', PAGE), submission: `${LOCAL}#saveLocally` };
  const action = tree(
    t,
    base({
      ...LOCAL_FILE,
      [REG]: registry([consent('terms', PAGE, 'terms', [localUse])]),
      [PAGE]: `import { saveLocally } from '@/lib/local';\nexport default function P() { return <form action={saveLocally} data-consent-use="terms:signup">${CONTROL}</form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(action), UNRESOLVED);
  const formAction = tree(
    t,
    base({
      ...LOCAL_FILE,
      [REG]: signupReg(),
      [PAGE]: `${head}import { saveLocally } from '@/lib/local';\nexport default function P() { return <form action={saveTerms} data-consent-use="terms:signup">${CONTROL}<button formAction={saveLocally}>x</button></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(formAction), UNRESOLVED);
});

const NS_IMPORTS =
  "import * as actions from '@/actions/consent';\nimport * as local from '@/lib/local';\nimport { helpers } from '@/lib/local';\n";
const judgeNs = async (t, body) =>
  chk22(
    tree(t, base({ ...LOCAL_FILE, [REG]: signupReg(), [PAGE]: handlerPage(NS_IMPORTS, body) }))
  );

test('CHK-22: a handler reaching two submissions is not reduced to one (r3 F5)', async t => {
  const mismatch = [`CHK-22|${PAGE}|submission-mismatch|terms:signup`];
  const cases = [
    ['  function onSubmit(e) { if (e.x) saveTerms(); else actions.saveDraft(); }', mismatch],
    ['  function onSubmit(e) { if (e.x) saveTerms(); else saveDraft(); }', mismatch],
    ['  function onSubmit() { actions.saveTerms(); }', []],
    ['  function onSubmit() { saveTerms(); local.saveLocally(); }', []],
    ['  function onSubmit(e) { saveTerms(); actions[e.k](); }', UNRESOLVED],
    ['  function onSubmit() { saveTerms(); actions.notExported(); }', UNRESOLVED],
    ['  function onSubmit() { saveTerms(); helpers.save(); }', UNRESOLVED],
  ];
  const judged = await Promise.all(cases.map(([body]) => judgeNs(t, body)));
  judged.forEach((found, index) => assert.deepEqual(found, cases[index][1], cases[index][0]));
});

test('CHK-22: a render through a namespace import is found; an unresolvable one is a scanner error (r3 F6)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const files = body =>
    base({
      ...SHARED_FILES,
      [REG]: registry([
        consent('terms', SHARED, 'terms', [use('a', forms)], { exportName: 'ConsentBox' }),
      ]),
      [forms]: `${head}import * as UI from '@interdomestik/ui';\nimport * as Radix from '@radix-ui/react-checkbox';\n${body}`,
    });
  const twoForms =
    'export function A() { return <form action={saveTerms} data-consent-use="terms:a"><UI.ConsentBox /><Radix.Root /></form>; }\nexport function B() { return <form action={saveTerms}><UI.ConsentBox /></form>; }\n';
  assert.deepEqual(await chk22(tree(t, files(twoForms))), [
    `CHK-22|${forms}|unmatched-boundary|terms@B`,
  ]);
  const component = element => `export function C() { return <div>${element}</div>; }\n`;
  await assert.rejects(
    lint(tree(t, files(component('<UI.Missing />')))),
    /<UI\.Missing> cannot be resolved to a component/u
  );
  await assert.rejects(
    lint(tree(t, files(component('<UI.ConsentBox.Inner />')))),
    /<UI\.ConsentBox\.Inner> cannot be resolved to a component/u
  );
});

test('CHK-22 discovery: the shared Input with a choice type is a control (r3 F6)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [file]:
        'import { Input } from \'@interdomestik/ui\';\nexport function D() { return <div><Input type="checkbox" name="terms" /><Input type="text" name="termsText" /></div>; }\n',
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${file}|unregistered|Input:terms`]);
});

test('CHK-22: the named handler limits stay unresolved-submission (r3 hardening)', async t => {
  const hookForm = `${head}import { useForm } from 'react-hook-form';\nexport default function P() {\n  const { handleSubmit } = useForm();\n  return <form onSubmit={handleSubmit(async v => saveTerms(v))} data-consent-use="terms:signup">${CONTROL}</form>;\n}\n`;
  const cases = [
    [
      "import { startTransition } from 'react';\n",
      '  async function run() { await saveTerms(); }\n  function onSubmit() { startTransition(run); }',
    ],
    [
      "import { useMemo } from 'react';\n",
      '  const onSubmit = useMemo(() => async () => { await saveTerms(); }, []);',
    ],
  ];
  const judged = await Promise.all([
    chk22(tree(t, base({ [REG]: signupReg(), [PAGE]: hookForm }))),
    ...cases.map(([imports, body]) => judgeHandler(t, imports, body)),
  ]);
  judged.forEach(found => assert.deepEqual(found, UNRESOLVED));
});

// r4 blocker 3: a client module is no server origin, even under actions/.
test('CHK-22: a client-only module under actions/ is not a submission (r4 B3)', async t => {
  const client = `${W}/actions/client-save.ts`;
  const clientUse = { ...use('signup', PAGE), submission: `${client}#saveClient` };
  const root = tree(
    t,
    base({
      [client]: "'use client';\nexport async function saveClient() {}\n",
      [REG]: registry([consent('terms', PAGE, 'terms', [clientUse])]),
      [PAGE]: `import { saveClient } from '@/actions/client-save';\nexport default function P() { return <form action={saveClient} data-consent-use="terms:signup">${CONTROL}</form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), UNRESOLVED);
});

// r4 blocker 4: a registered export that owns its form, or a route module Next renders without a
// JSX caller, gets no definition exemption: its control is a render and needs a listed use.
test('CHK-22: a page that owns its consent form with no uses is a finding (r4 B4)', async t => {
  const judged = await Promise.all(
    [
      `${head}export default function P() { return <form action={saveTerms}>${CONTROL}</form>; }\n`,
      `${head}export default function P() { return <div>${CONTROL}</div>; }\n`,
    ].map(text =>
      chk22(
        tree(
          t,
          base({
            [REG]: registry([consent('terms', PAGE, 'terms', [], { exportName: 'default' })]),
            [PAGE]: text,
          })
        )
      )
    )
  );
  judged.forEach(found => assert.deepEqual(found, [`CHK-22|${PAGE}|unmatched-boundary|terms@P`]));
  const shared = `${W}/components/terms-form.tsx`;
  const owned = tree(
    t,
    base({
      [REG]: registry([consent('terms', shared, 'terms', [], { exportName: 'TermsForm' })]),
      [shared]: `${head}export function TermsForm() { return <form action={saveTerms}>${CONTROL}</form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(owned), [`CHK-22|${shared}|unmatched-boundary|terms@TermsForm`]);
});
