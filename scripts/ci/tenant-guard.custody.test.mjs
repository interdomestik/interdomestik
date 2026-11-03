import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate, sha256 } from './tenant-guard/rules.mjs';
import { fingerprint, parseSource, collectUnits, unitName } from './tenant-guard/syntax.mjs';
import {
  KERNEL,
  PACKAGES,
  assertRefused,
  file,
  pinsOf,
  runWithBase,
} from './tenant-guard-test-support.mjs';

const CUSTODY_BASE = {
  'apps/web/src/contexts.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];",
    "export const CONFIG: any = { base: { hosts: ['a.example'] } };",
    "export const IDS = ['tenant-A', 'tenant-B'] as const;",
    'export function readFirst() {',
    '  return withTenantContext({ tenantId: CONTEXTS[0].tenantId || CONFIG.base || IDS[0] }, tx => tx.select());',
    '}',
  ].join('\n'),
};
const custody = body =>
  runWithBase(CUSTODY_BASE, {
    'apps/web/src/attack.ts': [
      "import { CONFIG, CONTEXTS, IDS } from './contexts';",
      'export function attack() {',
      ...body,
      '}',
    ].join('\n'),
  });

test('Q3-r2: changed code may not reach tracked members through globals, copies, iteration or operands', () => {
  const cases = {
    arrayFrom: [
      /#CONTEXTS .* is passed to a global callee that may keep or change it \(Array.from\)/u,
      "Array.from(CONTEXTS, (item: any) => { item.tenantId = 'tenant-victim'; return item; });",
    ],
    values: [
      /#CONTEXTS .* is passed to a global callee .*\(Object.values\)/u,
      "Object.values(CONTEXTS)[0].tenantId = 'tenant-victim';",
    ],
    objectCopy: [
      /#CONFIG .* is copied or iterated by changed code while its members are not primitives/u,
      'const copy = { ...CONFIG };',
      "copy.base.hosts.push('evil.example');",
    ],
    arrayCopy: [
      /#CONTEXTS .* is copied or iterated by changed code/u,
      "[...CONTEXTS][0].tenantId = 'tenant-victim';",
    ],
    iteration: [
      /#CONTEXTS .* is copied or iterated by changed code/u,
      "for (const item of CONTEXTS) item.tenantId = 'tenant-victim';",
    ],
    operand: [
      /#CONFIG .* escapes/u,
      'const same = CONFIG ?? {};',
      "same.base = { hosts: ['evil.example'] };",
    ],
  };
  for (const [name, [pattern, ...body]] of Object.entries(cases)) {
    const result = custody(body);
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', pattern);
  }
  // A copy of primitives detaches nothing that is tracked, and a key loop yields strings.
  const primitives = custody([
    'const ids = [...IDS];',
    'for (const key in CONFIG) ids.push(key as any);',
    'return ids.length > 0 && CONTEXTS.length > 0;',
  ]);
  assert.deepEqual(primitives.violations, []);
});

test('Q3: literal computed mutators, custom methods and opaque members are refused from changed code', () => {
  const base = {
    'apps/web/src/contexts.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];",
      'export const ALIAS = CONTEXTS;',
      'export function readFirst() {',
      '  return withTenantContext(CONTEXTS[0], tx => tx.select());',
      '}',
    ].join('\n'),
  };
  const result = runWithBase(base, {
    'apps/web/src/attack.ts': [
      "import { ALIAS, CONTEXTS } from './contexts';",
      'export function attack(name: string, input: any) {',
      "  CONTEXTS['unshift']({ tenantId: 'tenant-victim' });",
      '  CONTEXTS.retarget(input);',
      '  CONTEXTS[name](input);',
      "  ALIAS.push({ tenantId: 'tenant-victim' });",
      '}',
    ].join('\n'),
  });
  assertRefused(result, 'C1', /#CONTEXTS .* is mutated by changed code \(unshift\)/u);
  assertRefused(
    result,
    'C1',
    /#CONTEXTS .* is called by changed code \(retarget\) without a read-only contract/u
  );
  assertRefused(result, 'C1', /#CONTEXTS .* is called through a computed member/u);
  assertRefused(result, 'C1', /#ALIAS .* is mutated by changed code \(push\)/u);
});

test('Q3: a source-bound read-only contract admits only its path while its declaration is unchanged', () => {
  const base = {
    'apps/web/src/contexts.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];",
      'export function readFirst() { return withTenantContext(CONTEXTS[0], tx => tx.select()); }',
    ].join('\n'),
  };
  const declaration = "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];";
  const unit = parseSource('apps/web/src/contexts.ts', declaration);
  const contract = {
    key: 'apps/web/src/contexts.ts#CONTEXTS',
    paths: ['find'],
    sha256: sha256(fingerprint(unit.statements[0], unit)),
  };
  const evaluateWith = (changes, stateContracts) => {
    const trusted = new Map(Object.entries({ ...KERNEL, ...base }));
    const sources = new Map(trusted);
    for (const [path, text] of Object.entries(changes)) sources.set(path, text);
    const graph = createModuleGraph({
      sources,
      packages: PACKAGES,
      appAliases: [['@/', 'apps/web/src/']],
    });
    return evaluate({
      sources,
      trusted,
      graph,
      contracts: [],
      legacyPins: pinsOf(trusted),
      stateContracts,
    });
  };
  const reader = {
    'apps/web/src/reader.ts': [
      "import { CONTEXTS } from './contexts';",
      'export function first(id: string) { return CONTEXTS.find((entry: any) => entry.tenantId === id) ? id : null; }',
    ].join('\n'),
  };
  assertRefused(
    evaluateWith(reader, []),
    'C1',
    /is called by changed code \(find\) without a read-only contract/u
  );
  assert.deepEqual(evaluateWith(reader, [contract]).violations, []);
  // A contract reviewed against other declaration text admits nothing.
  const stale = evaluateWith(reader, [{ ...contract, sha256: sha256('reviewed elsewhere') }]);
  assertRefused(stale, 'C1', /is called by changed code \(find\) without a read-only contract/u);
  // A contract for another path admits nothing either.
  assertRefused(
    evaluateWith(reader, [{ ...contract, paths: ['some'] }]),
    'C1',
    /\(find\) without a read-only contract/u
  );
});

test('Q3-r: an escape contract admits the escape only while its reviewed consumers alone call it', () => {
  const hosts = [
    "import { withTenantContext } from '@interdomestik/database';",
    "const HOSTS: any = ['a.example'];",
    'export function getHosts() { return { allowed: HOSTS }; }',
    'export function readFirst() { return withTenantContext({ tenantId: HOSTS[0] }, tx => tx.select()); }',
  ].join('\n');
  const config = [
    "import { getHosts } from './hosts';",
    'export const config = { base: getHosts() };',
  ].join('\n');
  const base = { 'apps/web/src/hosts.ts': hosts, 'apps/web/src/config.ts': config };
  const printOf = (file, text, name) => {
    const sourceFile = parseSource(file, text);
    const [unit] = collectUnits(sourceFile).filter(each => unitName(each, sourceFile) === name);
    return sha256(fingerprint(unit, sourceFile));
  };
  const escape = {
    file: 'apps/web/src/hosts.ts',
    unit: 'getHosts',
    sha256: printOf('apps/web/src/hosts.ts', hosts, 'getHosts'),
    consumers: [
      {
        file: 'apps/web/src/config.ts',
        unit: 'config',
        sha256: printOf('apps/web/src/config.ts', config, 'config'),
      },
    ],
  };
  const contract = { key: 'apps/web/src/hosts.ts#HOSTS', escapes: [escape] };
  const evaluateWith = (changes, stateContracts) => {
    const trusted = new Map(Object.entries({ ...KERNEL, ...base }));
    const sources = new Map(trusted);
    for (const [path, text] of Object.entries(changes)) sources.set(path, text);
    const graph = createModuleGraph({
      sources,
      packages: PACKAGES,
      appAliases: [['@/', 'apps/web/src/']],
    });
    return evaluate({
      sources,
      trusted,
      graph,
      contracts: [],
      legacyPins: pinsOf(trusted),
      stateContracts,
    });
  };
  const escapes = /module state apps\/web\/src\/hosts.ts#HOSTS .* escapes/u;

  assert.deepEqual(evaluateWith({}, [contract]).violations, []);
  assertRefused(evaluateWith({}, []), 'C1', escapes);
  // An escape that names no consumer is never admitted.
  const { consumers: _omitted, ...bare } = escape;
  assertRefused(evaluateWith({}, [{ ...contract, escapes: [bare] }]), 'C1', escapes);

  const thief = {
    'apps/web/src/attack.ts': [
      "import { getHosts } from './hosts';",
      "export function steal() { getHosts().allowed.push('evil.example'); }",
    ].join('\n'),
  };
  assertRefused(evaluateWith(thief, [contract]), 'C1', escapes);
  const handle = {
    'apps/web/src/attack.ts':
      "import { getHosts } from './hosts';\nexport const kept = getHosts;\n",
  };
  assertRefused(evaluateWith(handle, [contract]), 'C1', escapes);
  // A consumer changed after review no longer binds the escape.
  const widened = {
    'apps/web/src/config.ts': config.replace('{ base: getHosts() }', '{ base: getHosts(), x: 1 }'),
  };
  assertRefused(evaluateWith(widened, [contract]), 'C1', escapes);
});
