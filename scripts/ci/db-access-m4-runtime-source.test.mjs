import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { FILES, deriveM4PrivateRuntimeSource } from './db-access-m4-runtime-source.mjs';
import {
  bootstrapCases,
  retirementCases,
  contextCases,
  postureCases,
  typeCases,
} from './db-access-m4-runtime-negative-cases.fixture.mjs';
const sources = Object.fromEntries(
  Object.entries(FILES).map(([role, file]) => [
    role,
    fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8'),
  ])
);
const input = values =>
  Object.fromEntries(Object.entries(values).map(([role, text]) => [role + 'Source', text]));
function changed(role, needle, replacement) {
  if (!needle) return sources[role] + replacement;
  assert.equal(sources[role].split(needle).length, 2, 'one finite negative target');
  let text = sources[role].replace(needle, () => replacement);
  if (replacement === 'const verifySession = cache(createCurrentStoreSessionVerifier({')
    text = text.replace(
      'issuerSecret: captured.issuerSecret,\n        });',
      'issuerSecret: captured.issuerSecret,\n        }));'
    );
  return text;
}
test('complete runtime contracts derive58 ordered clauses without executed admission', () => {
  const result = deriveM4PrivateRuntimeSource(input(sources));
  assert.deepEqual(
    Object.values(result.namedOrderedFacts).map(x => x.length),
    [13, 28, 7, 2, 8]
  );
  assert.equal(result.sourceNodes.length, 58);
  assert(Object.isFrozen(result.facts));
  for (const key of [
    'runtimeAdmission',
    'nativeAdmission',
    'allExecutableContextsQualified',
    'productionEventAuthenticated',
  ])
    assert.equal(result[key], false);
  assert(result.premises.some(text => text.includes('TLS false')));
  assert(result.premises.some(text => text.includes('expiry cleanup')));
  assert(result.premises.some(text => text.includes('actual28 SQL')));
});
test('formatting/comments preserve complete executable and type facts', () => {
  const original = deriveM4PrivateRuntimeSource(input(sources));
  const formatted = Object.fromEntries(
    Object.entries(sources).map(([role, text]) => [
      role,
      ts
        .createPrinter()
        .printFile(
          ts.createSourceFile(
            'module.ts',
            '// reviewed\n' + text,
            ts.ScriptTarget.ES2022,
            true,
            ts.ScriptKind.TS
          )
        ),
    ])
  );
  const result = deriveM4PrivateRuntimeSource(input(formatted));
  for (const key of [
    'bootstrapTree',
    'contextTree',
    'postureTree',
    'bootstrapTypeExports',
    'postureTaggedLiteralTokens',
    'types',
  ])
    assert.deepEqual(result.facts[key], original.facts[key]);
});
function negative(label, role, needle, replacement) {
  test('valid-syntax control/effect negative: ' + label, () => {
    const source = changed(role, needle, replacement);
    assert.notEqual(source, sources[role]);
    const parsed = ts.createSourceFile(
      FILES[role],
      source,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS
    );
    assert.equal(parsed.parseDiagnostics.length, 0);
    assert.throws(
      () => deriveM4PrivateRuntimeSource(input({ ...sources, [role]: source })),
      /source rejected/
    );
  });
}
for (const [label, needle, replacement] of bootstrapCases)
  negative(label, 'bootstrap', needle, replacement);
for (const [label, needle, replacement] of retirementCases)
  negative(label, 'retirement', needle, replacement);
for (const [label, needle, replacement] of contextCases)
  negative(label, 'context', needle, replacement);
for (const [label, needle, replacement] of postureCases)
  negative(label, 'posture', needle, replacement);
for (const [role, label, needle, replacement] of typeCases)
  negative(label, role, needle, replacement);
test('type-contract files emit no imports or executable initialization', () => {
  for (const role of ['runtimeTypes', 'controllerTypes']) {
    const emitted = ts
      .transpileModule(sources[role], {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          verbatimModuleSyntax: true,
        },
      })
      .outputText.trim();
    assert.equal(emitted, 'export {};');
  }
});
