import test from 'node:test';
import { append, refuses, scan } from './tenant-guard-schema-test-support.mjs';

const FILE = 'apps/web/src/billing.ts';
const SCHEMA = '@interdomestik/database/schema';
const RELATIVE = '../../../packages/database/src/schema';
const FORWARD = 'apps/web/src/forward-schema.ts';
const REEXPORT = 'apps/web/src/reexport-schema.ts';
const reason = file => `candidate: schema destructuring export ${file}`;

for (const specifier of [SCHEMA, RELATIVE, `${RELATIVE}/index`]) {
  test(`a destructuring export cannot read the schema namespace through ${specifier}`, () => {
    refuses(
      scan(
        append({
          [FILE]: `import * as schema from '${specifier}';
export const { rates: billingRows } = schema;`,
        })
      ),
      reason(FILE)
    );
  });
}

for (const [name, code] of [
  ['a local alias', `import * as s from '${SCHEMA}'; const t = s; export const { rates } = t;`],
  [
    'a forwarding chain',
    "import { forwarded as s } from './reexport-schema'; export let { rates } = s;",
  ],
  ['an array pattern', `import * as s from '${SCHEMA}'; export var [rates] = s;`],
  [
    'the database barrel',
    "import * as db from '@interdomestik/database'; export const { rates } = db;",
  ],
  [
    'a table module',
    `import { rates as table } from '${RELATIVE}/rates'; export const { id } = table;`,
  ],
  [
    'an unresolved table module',
    `import * as s from '${RELATIVE}/missing'; export const { rates } = s;`,
  ],
  [
    'an unresolved member',
    `import * as s from '${SCHEMA}'; export const { rates } = s[chooseKey()];`,
  ],
]) {
  test(`a schema destructuring export refuses ${name}`, () => {
    const candidate = append({
      [FILE]: code,
      [FORWARD]: `export * as schema from '${SCHEMA}';`,
      [REEXPORT]: "export { schema as forwarded } from './forward-schema';",
    });
    refuses(scan(candidate), reason(FILE));
  });
}

test('an unresolved relative schema source refuses through a forward', () => {
  const candidate = append({
    [FILE]: "import { missing } from './forward-schema'; export const { rates } = missing;",
    [FORWARD]: `export * as missing from '${RELATIVE}/missing';`,
  });
  refuses(scan(candidate), reason(FILE));
});

test('a candidate with a previously admitted table still checks destructuring without an append', () => {
  const base = append();
  const candidate = append({
    [FILE]: `import * as schema from '${SCHEMA}'; export const { rates } = schema;`,
  });
  refuses(scan(candidate, { base }), reason(FILE));
});
