import assert from 'node:assert/strict';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import {
  CALLER_FILES,
  CONTROL,
  PAGE,
  REG,
  SHARED,
  SHARED_FILES,
  W,
  base,
  chk22,
  consent,
  head,
  registry,
  use,
  usedShared,
} from './fixtures/screen-contract-check/chk22-fixtures.mjs';

test('CHK-22: a shared control: the definition needs no use; each form needs its own (B11, B16)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const reg = uses =>
    registry([consent('terms', SHARED, 'terms', uses, { exportName: 'ConsentBox' })]);
  const twoForms = (a, b) =>
    `${head}import { ConsentBox } from '@interdomestik/ui';\nexport function A() { return <form action={saveTerms}${a}><ConsentBox /></form>; }\nexport function B() { return <form action={saveTerms}${b}><ConsentBox /></form>; }\n`;
  // A definition with no use is a registry error (r5 B2): nothing would ever judge it.
  await assert.rejects(
    lint(tree(t, base({ ...SHARED_FILES, [REG]: reg([]) }))),
    /has an exportName but no use and is not selfSubmitting/u
  );
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
  const reg = usedShared();
  const definition =
    'export function ConsentBox() { return <input type="checkbox" id="terms" data-consent="terms" />; }\n';
  const inline = tree(
    t,
    base({
      ...CALLER_FILES,
      [REG]: reg,
      [SHARED]: `${definition}export function Inline() { return <form><input type="checkbox" id="terms" data-consent="terms" /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(inline), [`CHK-22|${SHARED}|unmatched-boundary|terms@Inline`]);
  const local = tree(
    t,
    base({
      ...CALLER_FILES,
      [REG]: reg,
      [SHARED]: `${definition}export function Local() { return <form><ConsentBox /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(local), [`CHK-22|${SHARED}|unmatched-boundary|terms@Local`]);
});

// r4 blocker 4 / r5 blocker 2: an exported control that nothing renders in JSX (a route's
// component, also through a `page.tsx` re-export) cannot rest on the definition exemption: an
// entry with an exportName needs a use or selfSubmitting, and a use whose file lists no boundary
// is an orphan.
test('CHK-22: an exported control needs a use or selfSubmitting (r5 B2)', async t => {
  const core = `${W}/app/signup/_core.entry.tsx`;
  const files = (uses, extra = {}) =>
    base({
      [REG]: registry([consent('terms', core, 'terms', uses, { exportName: 'default', ...extra })]),
      [core]: `${head}export default function P() { return <div>${CONTROL}</div>; }\n`,
      [PAGE]: "export { default } from './_core.entry';\n",
    });
  await assert.rejects(
    lint(tree(t, files([]))),
    /has an exportName but no use and is not selfSubmitting/u
  );
  assert.deepEqual(await chk22(tree(t, files([use('signup', core)]))), [
    `CHK-22|${core}|orphan-use|terms:signup`,
  ]);
  // selfSubmitting: the toggle is a render, its own boundary unmarked, its use listed nowhere.
  assert.deepEqual(await chk22(tree(t, files([use('signup', core)], { selfSubmitting: true }))), [
    `CHK-22|${core}|orphan-use|terms:signup`,
    `CHK-22|${core}|unmatched-boundary|terms@P`,
  ]);
});

// r5 blocker 4: the UI package's `<Form>` is react-hook-form's FormProvider, a context, not the
// submitting form; a shared field inside it stays a definition judged at its caller.
test('CHK-22: a shared field inside the FormProvider <Form> is a definition (r5 B4)', async t => {
  const field = `${W}/components/terms-field.tsx`;
  const root = tree(
    t,
    base({
      'packages/ui/src/index.ts': "export { Form } from './components/form';\n",
      'packages/ui/src/components/form.tsx':
        "import { FormProvider } from 'react-hook-form';\nexport const Form = FormProvider;\n",
      [field]: `import { Form } from '@interdomestik/ui';\nexport function TermsField({ form }) { return <Form {...form}>${CONTROL}</Form>; }\n`,
      [PAGE]: `${head}import { TermsField } from '@/components/terms-field';\nexport default function P({ form }) { return <form action={saveTerms} data-consent-use="terms:signup"><TermsField form={form} /></form>; }\n`,
      [REG]: registry([
        consent('terms', field, 'terms', [use('signup', PAGE)], { exportName: 'TermsField' }),
      ]),
    })
  );
  assert.deepEqual(await chk22(root), []);
});
