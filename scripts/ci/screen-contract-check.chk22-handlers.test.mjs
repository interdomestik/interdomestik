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
