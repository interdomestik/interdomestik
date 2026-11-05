import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefused, byStage, runWithBase } from './tenant-guard-test-support.mjs';

// ---- Q2-r: a schema value reaches only recognized query-builder receivers ---------------------

const RECEIVER_BASE = {
  'packages/database/src/db.ts': [
    "import { claims } from './schema';",
    'export const db: any = {};',
    'export const dbAdmin: any = {};',
    'export const dbRls: any = { claims };',
  ].join('\n'),
  'packages/database/src/schema.ts':
    "export const users = {};\nexport const claims = { id: 'id' };\n",
  'apps/web/src/legacy-read.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "export function read() { return withTenantContext({ tenantId: 'tenant-A' }, tx => tx.select()); }",
  ].join('\n'),
};
// Changed code holds only withTenantAuthority; the legacy entries appear in unchanged code.
const receiverRun = lines =>
  runWithBase(RECEIVER_BASE, { 'apps/web/src/receiver.ts': lines.join('\n') });
const IMPORTS = [
  "import { claims } from '@interdomestik/database';",
  "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
];
const inTransaction = body => [
  ...IMPORTS,
  'export function attack(authority: any) {',
  '  return withTenantAuthority(authority, (tx: any) => {',
  ...body,
  '  });',
  '}',
];

test('Q2-r: kernel clients, kernel transactions and their facades are recognized receivers', () => {
  const lines = [
    "import { claims, db, withTenantContext } from '@interdomestik/database';",
    "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
    'export function direct() { return db.select().from(claims).where(claims.id); }',
    'export function nested(authority: any) {',
    '  return withTenantAuthority(authority, tx => tx.transaction(inner => inner.insert(claims)));',
    '}',
    'function helper(executor: any, { scope }: any) {',
    '  let query = executor.select().from(claims);',
    '  query = query.where(claims.id);',
    '  return scope.update(claims);',
    '}',
    'export function viaHelper(authority: any) {',
    '  return withTenantContext(authority, tx => helper(tx, { scope: tx }));',
    '}',
    'function hookTx(tx: any) { return { insert: tx.insert.bind(tx), select: tx.select.bind(tx) }; }',
    'export function facade(authority: any) {',
    '  return withTenantAuthority(authority, tx => hookTx(tx).insert(claims));',
    '}',
    'function run(action: any) { return withTenantAuthority({}, action); }',
    'export function runner() { return run((scoped: any) => scoped.select().from(claims)); }',
  ];
  const result = runWithBase({ ...RECEIVER_BASE, 'apps/web/src/receiver.ts': lines.join('\n') });
  const { lifetime, other } = byStage(result);
  assert.deepEqual(other, []);
  // The receivers are recognized; L1 still refuses the facade and the runner shapes themselves.
  assert.deepEqual(lifetime, [
    'facade: hookTx: a rebound capability member (bind)',
    'run: a callback read from a parameter (action)',
  ]);
});

test('Q2-r: a hostile receiver is refused however the schema value reaches it', () => {
  const unknown = /#claims .* is handed to an unknown receiver/u;
  const cases = {
    literal: [
      unknown,
      'const hostile = { from(table: any) { table.id = 1; } };',
      'hostile.from(claims);',
    ],
    map: [unknown, 'new Map().set(claims, 1);'],
    let: [unknown, 'let r: any = tx;', 'r = { from() {} };', 'r.from(claims);'],
    facade: [
      unknown,
      'const f = { insert: tx.insert.bind(tx), from: (t: any) => t };',
      'f.from(claims);',
    ],
    // Not a builder method: a container changed code builds keeps the value.
    store: [
      /#claims .* is passed to a callee built by changed code/u,
      'new Set<any>().add(claims);',
    ],
    assign: [
      /#claims .* is passed to a global callee that may keep or change it \(Object.assign\)/u,
      'Object.assign(claims, { id: 1 });',
    ],
  };
  for (const [name, [pattern, ...body]] of Object.entries(cases)) {
    const result = receiverRun(inTransaction(body));
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', pattern);
  }
});

test('Q2-r: helper parameters bind their callers, defaults and hand-offs', () => {
  const helper = 'function load(r: any) { return r.select().from(claims); }';
  const hostileCaller = receiverRun([
    ...IMPORTS,
    helper,
    'export const x = load({ select() {} });',
  ]);
  assertRefused(hostileCaller, 'C1', /query receiver: an unknown receiver .* reaches .*#load/u);

  const hostileDefault = receiverRun([
    ...IMPORTS,
    'export function load(r: any = { from() {} }) { return r.from(claims); }',
  ]);
  assertRefused(hostileDefault, 'C1', /query receiver: an unknown receiver .* reaches .*#load/u);

  const stored = receiverRun([...IMPORTS, helper, 'export const saved = [load];']);
  assertRefused(stored, 'C1', /query receiver: a callback handed on .* reaches .*#load/u);

  const callback = receiverRun([
    ...IMPORTS,
    'function run(cb: any) { return cb({ from() {} }); }',
    'export const x = run((tx: any) => tx.from(claims));',
  ]);
  assertRefused(callback, 'C1', /query receiver: an unknown receiver .* reaches .*#run/u);

  const member = receiverRun([
    ...IMPORTS,
    'function run(args: any) { return args.after({ from() {} }); }',
    'export const x = run({ after: (tx: any) => tx.from(claims) });',
  ]);
  assertRefused(member, 'C1', /query receiver: an unknown receiver .* reaches .*#run/u);

  const escaped = receiverRun([
    ...IMPORTS,
    'let kept: any;',
    'function run(args: any) { kept = args; }',
    'export const x = run({ after: (tx: any) => tx.from(claims) });',
  ]);
  assertRefused(escaped, 'C1', /query receiver: a callback carrier handed on .* reaches .*#run/u);

  const injected = receiverRun([
    ...IMPORTS,
    'function core(deps: any) {',
    '  const runner = deps.run ?? withTenantAuthority;',
    '  return runner({}, (tx: any) => tx.from(claims));',
    '}',
    'export const x = core({ run: (_: any, cb: any) => cb({ from() {} }) });',
  ]);
  assertRefused(injected, 'C1', /query receiver: an unknown receiver .* reaches/u);
});

test('Q2-r2: a spread or computed key never hides an earlier or overriding receiver', () => {
  const unknown = /#claims .* is handed to an unknown receiver/u;
  const cases = {
    // `...{}` carries no `r`, so the earlier hostile `r` is the value.
    emptySpread: ['const holder: any = { r: { from() {} }, ...{} };', 'holder.r.from(claims);'],
    spreadOfSafe: [
      'const holder: any = { r: { from() {} }, ...{ other: tx } };',
      'holder.r.from(claims);',
    ],
    computed: [
      "const key: string = 'r';",
      'const holder: any = { r: tx, [key]: { from() {} } };',
      'holder.r.from(claims);',
    ],
  };
  for (const [name, body] of Object.entries(cases)) {
    const result = receiverRun(inTransaction(body));
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', unknown);
  }
  // A spread that does carry a recognized `r` over an earlier hostile one is still checked
  // through the earlier one too: either may be the value when the spread's shape is unknown.
  const layered = receiverRun(
    inTransaction([
      'const carrier: any = { r: tx };',
      'const holder: any = { r: { from() {} }, ...carrier };',
      'holder.r.from(claims);',
    ])
  );
  assertRefused(layered, 'C1', unknown);
  const overridden = receiverRun(
    inTransaction([
      'const holder: any = { ...{ r: { from() {} } }, r: tx };',
      'holder.r.from(claims);',
    ])
  );
  // The receiver is recognized; L1 refuses the spread carrier the transaction is placed in.
  assert.deepEqual(byStage(overridden), {
    lifetime: ['attack: a carrier object with spreads, methods or computed keys'],
    other: [],
  });

  const injected = receiverRun([
    ...IMPORTS,
    'function core(deps: any) {',
    '  const runner = deps.run ?? withTenantAuthority;',
    '  return runner({}, (tx: any) => tx.from(claims));',
    '}',
    'export const x = core({ run: (_: any, cb: any) => cb({ from() {} }), ...{} });',
  ]);
  assertRefused(injected, 'C1', /query receiver: an unknown receiver .* reaches/u);
});
