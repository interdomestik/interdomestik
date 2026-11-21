import assert from 'node:assert/strict';
import test from 'node:test';

import { tree } from './fixtures/screen-contract-check/harness.mjs';
import {
  CONTROL,
  PAGE,
  REG,
  W,
  base,
  chk22,
  consent,
  head,
  registry,
  signupReg,
  use,
} from './fixtures/screen-contract-check/chk22-fixtures.mjs';

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
