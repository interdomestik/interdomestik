import assert from 'node:assert/strict';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import {
  CALLER,
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
  signupReg,
  use,
  usedShared,
} from './fixtures/screen-contract-check/chk22-fixtures.mjs';

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
      [CALLER]: CALLER_FILES[CALLER],
      ...STAR_FILES,
      [REG]: usedShared(),
      [forms]: `${head}import { ConsentBox } from '@interdomestik/ui';\nexport function A() { return <form action={saveTerms}><ConsentBox /></form>; }\n`,
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${forms}|unmatched-boundary|terms@A`]);
});

test('CHK-22: two unmarked boundaries rendering one entry in a file have distinct keys (H2)', async t => {
  const forms = `${W}/app/forms.tsx`;
  const reg = usedShared();
  const imports = `${head}import { ConsentBox } from '@interdomestik/ui';\n`;
  const twoComponents = tree(
    t,
    base({
      ...SHARED_FILES,
      ...CALLER_FILES,
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
      ...CALLER_FILES,
      [REG]: reg,
      [forms]: `${imports}export function A() { return <div><form action={saveTerms}><ConsentBox /></form><form action={saveTerms}><ConsentBox /></form></div>; }\n`,
    })
  );
  assert.deepEqual(await chk22(oneComponent), [
    `CHK-22|${forms}|unmatched-boundary|terms@A`,
    `CHK-22|${forms}|unmatched-boundary|terms@A#2`,
  ]);
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

const judgeSignupHandler = (t, imports, handler) =>
  chk22(
    tree(
      t,
      base({
        [REG]: signupReg(),
        [PAGE]: `${imports}export default function P() { return <form onSubmit={${handler}} data-consent-use="terms:signup">${CONTROL}</form>; }\n`,
      })
    )
  );

test('CHK-22: a local call alongside the registered submission is ignored', async t => {
  const handler = '() => { const saveDraft = () => {}; saveDraft(); saveTerms(); }';
  assert.deepEqual(await judgeSignupHandler(t, head, handler), []);
});

const NAMESPACE_ACTIONS = "import * as actions from '@/actions/consent';\n";

test('CHK-22: a computed tree import call leaves the handler submission unresolved', async t => {
  const handler = "() => { actions.saveTerms(); actions['saveDraft'](); }";
  assert.deepEqual(await judgeSignupHandler(t, NAMESPACE_ACTIONS, handler), [
    `CHK-22|${PAGE}|unresolved-submission|terms:signup`,
  ]);
});

test('CHK-22: a direct namespace member resolves to the registered submission', async t => {
  const handler = '() => actions.saveTerms()';
  assert.deepEqual(await judgeSignupHandler(t, NAMESPACE_ACTIONS, handler), []);
});
