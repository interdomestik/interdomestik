import assert from 'node:assert/strict';
import test from 'node:test';

import { directivesOfText, layerOf, roleOf } from './screen-contract/roles.mjs';

const W = 'apps/web/src';

test('roles: one role per file, screens by default (design §1)', () => {
  const cases = {
    [`${W}/app/[locale]/member/page.tsx`]: 'screen',
    [`${W}/app/[locale]/member/page.jsx`]: 'screen',
    [`${W}/components/x/y.mjs`]: 'screen',
    [`${W}/features/a/b.ts`]: 'screen',
    [`${W}/hooks/use-x.ts`]: 'screen',
    [`${W}/brand-new-dir/z.tsx`]: 'screen',
    [`${W}/app/api/claims/route.ts`]: 'handler',
    [`${W}/app/api/helpers/shared.ts`]: 'handler',
    [`${W}/app/[locale]/feed/route.ts`]: 'handler',
    [`${W}/app/[locale]/feed/route.js`]: 'handler',
    [`${W}/actions/claims/submit.ts`]: 'action',
    'packages/domain-claims/src/index.ts': 'domain',
    'packages/database/src/schema/core.ts': 'database',
    [`${W}/lib/utils/number.ts`]: 'support',
    [`${W}/i18n/routing.ts`]: 'support',
    [`${W}/proxy.ts`]: 'support',
    [`${W}/instrumentation.ts`]: 'support',
    [`${W}/instrumentation-client.ts`]: 'support',
    [`${W}/sentry.edge.config.ts`]: 'support',
    'packages/ui/src/components/input.tsx': 'support',
    'packages/shared-auth/src/index.ts': 'support',
    'packages/qa/src/index.ts': 'support',
    [`${W}/components/x/y.test.tsx`]: 'test',
    [`${W}/components/x/y.spec.ts`]: 'test',
    [`${W}/components/x/y.stories.tsx`]: 'test',
    [`${W}/components/__tests__/y.tsx`]: 'test',
    [`${W}/test/setup.ts`]: 'test',
    [`${W}/types/globals.d.ts`]: 'test',
    [`${W}/next.config.test.ts`]: 'test',
    [`${W}/components/x/styles.css`]: null,
    'apps/web/e2e/x.spec.ts': null,
    'scripts/ci/x.mjs': null,
  };
  for (const [rel, role] of Object.entries(cases)) assert.equal(roleOf(rel), role, rel);
});

test('directive prologue: the leading run of string-literal statements (WP-02 semantics)', () => {
  assert.deepEqual(directivesOfText('a.ts', "'use server';\nexport const a = 1;\n"), [
    'use server',
  ]);
  assert.deepEqual(directivesOfText('a.ts', "'use strict';\n'use server';\nexport {};\n"), [
    'use strict',
    'use server',
  ]);
  assert.deepEqual(directivesOfText('a.ts', "// c\n/* d */\n'use server'\nexport {};\n"), [
    'use server',
  ]);
  assert.deepEqual(directivesOfText('a.ts', "import x from 'y';\n'use server';\n"), []);
  assert.deepEqual(directivesOfText('a.tsx', 'const a = <div />;\n'), []);
});

test('layer: one function for both ends of an edge (B1, B15)', () => {
  const server = "'use server';\nexport async function save() {}\n";
  const plain = 'export const a = 1;\n';
  assert.equal(layerOf(`${W}/app/api/x/route.ts`, plain), 2);
  assert.equal(layerOf(`${W}/actions/a.ts`, plain), 2);
  assert.equal(layerOf(`${W}/features/a/actions.ts`, server), 2);
  assert.equal(layerOf(`${W}/features/a/actions.ts`, "'use strict';\n'use server';\n"), 2);
  assert.equal(layerOf(`${W}/lib/save.ts`, server), 2);
  assert.equal(layerOf(`${W}/lib/save.ts`, plain), null);
  assert.equal(layerOf(`${W}/features/a/view.tsx`, plain), 1);
  assert.equal(layerOf('packages/domain-claims/src/a.ts', plain), 3);
  assert.equal(layerOf('packages/database/src/a.ts', plain), 4);
  assert.equal(layerOf('packages/shared-auth/src/a.ts', plain), null);
  assert.equal(layerOf(`${W}/features/a/view.test.tsx`, server), null);
});
