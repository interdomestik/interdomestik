import assert from 'node:assert/strict';
import path from 'node:path';
import ts from 'typescript';
import { createSourceModel, isFunction } from './db-access-source.mjs';
import { createLexicalLookups } from './db-access-source-symbol.mjs';

// Test-only checker adapters and source-model fixtures, mechanically extracted from the Opus proposal.
const ALIAS = ts.SymbolFlags.Alias;

const SRC = 'apps/web/src/';

const count = (list, item) => list.filter(entry => entry === item).length;

function assertCalls(actual, expected) {
  assert.equal(actual.length, expected.length);
  expected.forEach((item, index) => assert.equal(actual[index], item));
}

function finder(sourceFile) {
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return (text, nth = 0, kind = ts.SyntaxKind.Identifier) => {
    const found = nodes.filter(node => node.kind === kind && node.getText() === text)[nth];
    assert.ok(found, `missing ${text}#${nth} in ${sourceFile.fileName}`);
    return found;
  };
}

function compile(files) {
  const parsed = new Map(
    Object.entries(files).map(([name, text]) => {
      const file = `/fixture/${name}`;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      return [file, sf];
    })
  );
  const host = {
    getSourceFile: file => parsed.get(file),
    getDefaultLibFileName: () => '',
    writeFile() {},
    getCurrentDirectory: () => '/fixture/',
    getDirectories: () => [],
    fileExists: file => parsed.has(file),
    readFile: file => parsed.get(file)?.text,
    getCanonicalFileName: file => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    resolveModuleNames: (names, from) =>
      names.map(name => {
        const target = path.posix.join(path.posix.dirname(from), name) + '.ts';
        return parsed.has(target)
          ? { resolvedFileName: target, isExternalLibraryImport: false }
          : undefined;
      }),
  };
  const program = ts.createProgram(
    [...parsed.keys()],
    { noLib: true, types: [], target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext },
    host
  );
  return {
    checker: program.getTypeChecker(),
    find: name => finder(parsed.get(`/fixture/${name}`)),
  };
}

function instrument(real, overrides = {}) {
  const calls = { location: [], shorthand: [], aliased: [] };
  const adapter = {
    getSymbolAtLocation(node) {
      calls.location.push(node);
      return overrides.location ? overrides.location(node) : real.getSymbolAtLocation(node);
    },
    getShorthandAssignmentValueSymbol(node) {
      calls.shorthand.push(node);
      return real.getShorthandAssignmentValueSymbol(node);
    },
    getAliasedSymbol(item) {
      calls.aliased.push(item);
      return overrides.aliased ? overrides.aliased(item) : real.getAliasedSymbol(item);
    },
  };
  return { calls, ...createLexicalLookups(adapter, isFunction) };
}

const ALIAS_FILES = {
  'a.ts': 'export const value = () => 1;\n',
  'b.ts': "import { value } from './a';\nvalue();\n",
  'c.ts': "import { value as other } from './a';\nother();\n",
};

function aliasFixture() {
  const { checker, find } = compile(ALIAS_FILES);
  const a = find('a.ts');
  const bUse = find('b.ts')('value', 1);
  const cUse = find('c.ts')('other', 1);
  const arrow = a('value', 0).parent.initializer;
  const aliasA = checker.getSymbolAtLocation(bUse);
  const aliasB = checker.getSymbolAtLocation(cUse);
  assert.ok(aliasA.flags & ALIAS);
  assert.ok(aliasB.flags & ALIAS);
  assert.notEqual(aliasA, aliasB);
  const target = checker.getAliasedSymbol(aliasA);
  assert.equal(checker.getAliasedSymbol(aliasB), target);
  assert.equal(target.flags & ALIAS, 0);
  assert.equal(target.valueDeclaration, arrow.parent);
  return { checker, bUse, cUse, arrow, aliasA, aliasB, target };
}

const MODEL_FILES = [
  [
    'apps/web/package.json',
    JSON.stringify({ name: '@fixture/web', dependencies: { 'drizzle-orm': '1.0.0' } }),
  ],
  [
    `${SRC}a.ts`,
    'export const value = () => 1;\nexport default function main() {\n  return 2;\n}\n',
  ],
  [
    `${SRC}b.ts`,
    "import main, { value } from './a';\nimport * as ns from './a';\nimport { eq } from 'drizzle-orm';\nexport { value as renamed } from './a';\nconst local = value;\nconst bag = { local };\nmain();\nvalue();\nns.value();\neq;\nbag;\n",
  ],
  [`${SRC}c.ts`, "import { renamed } from './b';\nrenamed();\n"],
  [`${SRC}d.ts`, "export { loop } from './e';\n"],
  [`${SRC}e.ts`, "export { loop } from './d';\n"],
  [`${SRC}f.ts`, "import { loop } from './d';\nloop;\n"],
];

function fixtureModel() {
  const model = createSourceModel(new Map(MODEL_FILES));
  const a = finder(model.parsed.get(`${SRC}a.ts`));
  const b = finder(model.parsed.get(`${SRC}b.ts`));
  const c = finder(model.parsed.get(`${SRC}c.ts`));
  const f = finder(model.parsed.get(`${SRC}f.ts`));
  return {
    model,
    aFile: model.parsed.get(`${SRC}a.ts`),
    arrow: a('value', 0).parent.initializer,
    valueDecl: a('value', 0).parent,
    mainFn: a('main', 0).parent,
    importSpecifier: b('value', 0).parent,
    valueInit: b('value', 2),
    valueCall: b('value', 3),
    nsValue: b('value', 4),
    mainCall: b('main', 1),
    nsUse: b('ns', 1),
    localDecl: b('local', 0).parent,
    localShort: b('local', 1),
    eqImport: b('eq', 0).parent,
    eqUse: b('eq', 1),
    renamedUse: c('renamed', 1),
    loopUse: f('loop', 1),
  };
}

const twinSources = body =>
  new Map([
    [`${SRC}a.ts`, `export const value = () => ${body};\n`],
    [`${SRC}b.ts`, "import { value } from './a';\nvalue();\n"],
  ]);

function twinParts(model) {
  const a = finder(model.parsed.get(`${SRC}a.ts`));
  const b = finder(model.parsed.get(`${SRC}b.ts`));
  return { use: b('value', 1), arrow: a('value', 0).parent.initializer };
}

export {
  ALIAS,
  SRC,
  count,
  assertCalls,
  compile,
  instrument,
  aliasFixture,
  fixtureModel,
  twinSources,
  twinParts,
};
