import assert from 'node:assert/strict';
import test from 'node:test';

import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import {
  ACTION,
  BODY,
  IMPORTING,
  evidence,
} from './fixtures/screen-contract-check/evidence-fixtures.mjs';

test('r2 B5: a different helper from the module plus a local stub of the export does not count', t => {
  const text = `import { otherHelper } from '@/actions/terms';\nconst saveTerms = async () => otherHelper();\n${BODY}`;
  const errors = evidence(t, `${W}/app/signup/page.test.tsx`, text, {
    [ACTION]:
      "'use server';\nexport async function saveTerms() {}\nexport function otherHelper() {}\n",
  });
  assert.match(errors.join('\n'), /does not use the submission export saveTerms/u);
});

test('r2 B5: an imported but unused export does not count', t => {
  const text = `import { saveTerms } from '@/actions/terms';\nit('terms signup termsAccepted consents TERMS_VERSION acceptedAt', () => {});\n`;
  const errors = evidence(t, `${W}/app/signup/page.test.tsx`, text);
  assert.match(errors.join('\n'), /does not use the submission export saveTerms/u);
});

test('r2 B5: a namespace import used as ns.export, and an aliased import, count', t => {
  const ns = `import * as actions from '@/actions/terms';\n${BODY.replace('await saveTerms(', 'await actions.saveTerms(')}`;
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, ns), []);
  const aliased = `import { saveTerms as submit } from '@/actions/terms';\n${BODY.replace('await saveTerms(', 'await submit(')}`;
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, aliased), []);
});

// r3 blocker 3: only a value reference to the import binding itself counts.
const NAMES = "it('terms signup termsAccepted consents TERMS_VERSION acceptedAt', async () => {\n";
const usesOnly = (head, call) => `${head}\n${NAMES}  ${call}\n});\n`;
const IMPORT_SAVE = "import { saveTerms } from '@/actions/terms';";

test('r3 B3: a property key, a type-only import or typeof is not a use of the submission', t => {
  const cases = [
    [
      'property key of a mock',
      usesOnly(
        `${IMPORT_SAVE}\nimport * as mock from './mock';`,
        'const { saveTerms: stub } = mock; await stub();'
      ),
    ],
    [
      'object property name',
      usesOnly(IMPORT_SAVE, 'const api = { saveTerms: async () => {} }; await api.saveTerms();'),
    ],
    [
      'type-only import',
      usesOnly(
        "import type { saveTerms } from '@/actions/terms';",
        'const f: typeof saveTerms = null as never; await f();'
      ),
    ],
    [
      'inline type-only specifier',
      usesOnly("import { type saveTerms } from '@/actions/terms';", 'let f: typeof saveTerms;'),
    ],
    ['typeof only', usesOnly(IMPORT_SAVE, 'let f: typeof saveTerms;')],
    ...[
      'export default saveTerms;', // r5 B5
      'export default (saveTerms);', // r6 B4
      'export default saveTerms as never;', // r6 B4
      'export type { saveTerms as T };',
      'export { type saveTerms as U };',
      'export { saveTerms as V };',
    ].map(line => [`a re-export (r4 B1, r5 B5): ${line}`, usesOnly(`${IMPORT_SAVE}\n${line}`, '')]),
    [
      'a shadowing parameter',
      usesOnly(IMPORT_SAVE, 'const run = (saveTerms: () => void) => saveTerms(); run(() => {});'),
    ],
  ];
  for (const [label, text] of cases)
    assert.match(
      evidence(t, `${W}/app/signup/page.test.tsx`, text).join('\n'),
      /does not (use the submission export saveTerms|import the submission module)/u,
      label
    );
});

test('r3 B3: a shorthand property and a call through a passed reference are uses', t => {
  const shorthand = usesOnly(IMPORT_SAVE, 'await exercise({ saveTerms });');
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, shorthand), []);
  const passed = usesOnly(IMPORT_SAVE, 'await render(saveTerms);');
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, passed), []);
});

// r5 blocker 5: a registered `#default` submission is used through a default import.
test('r5 B5: a default import of a #default submission, called, is a use', t => {
  const text = `import save from '@/actions/terms';\n${BODY.replace('await saveTerms(', 'await save(')}`;
  const lanes = { [ACTION]: "'use server';\nexport default async function saveTerms() {}\n" };
  assert.deepEqual(evidence(t, `${W}/app/signup/page.test.tsx`, text, lanes, 'default'), []);
  const unused = `import save from '@/actions/terms';\n${BODY}`;
  assert.match(
    evidence(t, `${W}/app/signup/page.test.tsx`, unused, lanes, 'default').join('\n'),
    /does not use the submission export default/u
  );
});

// r6 blocker 4: a namespace member forwarded by `export default` is no use either.
test('r6 B4: export default ns.export is not a use of the submission', t => {
  const text = usesOnly(
    "import * as actions from '@/actions/terms';\nexport default actions.saveTerms;",
    ''
  );
  assert.match(
    evidence(t, `${W}/app/signup/page.test.tsx`, text).join('\n'),
    /does not use the submission export saveTerms/u
  );
});

// r6 blocker 5: a skipped test or suite supplies no evidence, `suite` (Vitest's alias of
// `describe`) included.
test('r6 B5: a skipped test or suite is not evidence', t => {
  for (const skipped of ['it.skip', 'test.skip', 'describe.skip', 'suite.skip', 'xit'])
    assert.match(
      evidence(t, `${W}/app/signup/page.test.tsx`, IMPORTING.replace('it(', `${skipped}(`)).join(
        '\n'
      ),
      /is skipped/u,
      skipped
    );
});

// r7 blocker 2: an angle-bracket type assertion (only in a .ts file) forwarded by `export default`
// is no use either.
test('r7 B2: export default <T>submission in a .test.ts file is not a use', t => {
  for (const line of [
    'export default <never>saveTerms;',
    'export default <never>(saveTerms);',
    'export default (<never>saveTerms);',
  ])
    assert.match(
      evidence(t, `${W}/app/signup/page.test.ts`, usesOnly(`${IMPORT_SAVE}\n${line}`, '')).join(
        '\n'
      ),
      /does not use the submission export saveTerms/u,
      line
    );
});

// r7 blocker 3: a test function imported under another name could be skipped unseen, so the
// renamed import is no evidence at all (fail closed); the plain names still are.
test('r7 B3: a renamed import of it, test, describe or suite is not evidence', t => {
  const renamed = [
    ...['it', 'test', 'describe', 'suite'].map(name => `import { ${name} as s } from 'vitest';`),
    "import { test as s } from '@playwright/test';",
  ];
  for (const line of renamed)
    for (const body of [IMPORTING, IMPORTING.replace('it(', 's.skip(')])
      assert.match(
        evidence(t, `${W}/app/signup/page.test.tsx`, `${line}\n${body}`).join('\n'),
        /renames the test function/u,
        line
      );
  assert.deepEqual(
    evidence(
      t,
      `${W}/app/signup/page.test.tsx`,
      `import { it, describe } from 'vitest';\n${IMPORTING}`
    ),
    []
  );
});

// r8 blocker 2: the renamed-import rule reads value imports from the test runners only; the same
// name renamed from another module, or a type-only import, is no test function.
test('r8 B2: a renamed import from another module or a type-only import is still evidence', t => {
  for (const line of [
    "import { it as italian } from 'date-fns/locale';",
    "import { type it as T } from 'vitest';",
    "import type { suite as S } from 'vitest';",
  ])
    assert.deepEqual(
      evidence(t, `${W}/app/signup/page.test.tsx`, `${line}\n${IMPORTING}`),
      [],
      line
    );
});

// r9 blocker: a repository-local module (relative or `@/`) can re-export a runner's test function,
// as the auth fixture does, so a renamed import from one is no evidence either; a bare package
// other than a runner (date-fns) is still exempt (r8 B2).
test('r9 B1: a renamed test function from a repository-local module is not evidence', t => {
  for (const line of [
    "import { test as t } from '../fixtures/auth.fixture';",
    "import { test as t, expect } from './fixtures/one-door.fixture';",
    "import { it as t } from '@/test/helpers';",
  ])
    for (const body of [IMPORTING, IMPORTING.replace('it(', 't.skip(')])
      assert.match(
        evidence(t, `${W}/app/signup/page.test.tsx`, `${line}\n${body}`).join('\n'),
        /renames the test function/u,
        line
      );
  assert.deepEqual(
    evidence(
      t,
      `${W}/app/signup/page.test.tsx`,
      `import { it as italian } from 'date-fns/locale';\n${IMPORTING}`
    ),
    []
  );
});
