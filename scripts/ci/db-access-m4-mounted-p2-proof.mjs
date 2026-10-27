// Pure current-source unit construction. Only the existing private ordinary take supplies authority.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import FIXED from './db-access-m4-mounted-p2-proof-contract.json' with { type: 'json' };
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
freeze(FIXED);
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SPEC = '@/server/operations/m4-assignment-relay';
const fail = reason => {
  throw Error('M4 mounted P2 construction refused: ' + reason);
};
const unit = (file, text) => {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) fail('source syntax');
  return ast;
};
function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text),
    rows = [];
  for (let kind; (kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken;)
    rows.push([kind, scanner.getTokenText()]);
  return rows;
}
function retained(original, generated, file, segments, expected) {
  const selected = segments.filter(row => row.file === file);
  if (
    !same(
      selected.map(row => [row.start, row.end]),
      expected
    )
  )
    fail('complete retained statements');
  for (const row of selected) {
    const text = original.slice(row.start, row.end);
    if (
      row.generatedEnd - row.generatedStart !== row.end - row.start ||
      hash(text) !== row.sha256 ||
      generated.slice(row.generatedStart, row.generatedEnd) !== text
    )
      fail('retained bytes/control');
  }
}
function testPrograms(ast) {
  const tests = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'it') {
      if (
        node.arguments.length !== 2 ||
        !ts.isStringLiteral(node.arguments[0]) ||
        !ts.isArrowFunction(node.arguments[1])
      )
        fail('exact test program');
      const assertions = [];
      function inspect(child) {
        if (
          ts.isCallExpression(child) &&
          child.expression.getText(ast).startsWith('expect(') &&
          /(?:^|\.)to[A-Z]/u.test(child.expression.getText(ast))
        )
          assertions.push(hash(JSON.stringify(tokens(child.getText(ast)))));
        ts.forEachChild(child, inspect);
      }
      inspect(node.arguments[1].body);
      tests.push({ name: node.arguments[0].text, assertions });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return tests;
}
export function deriveMountedAssignmentProofConstruction(execution) {
  if (ts.version !== FIXED.parserVersion) fail('fixed parser');
  const texts = {};
  let total = 0;
  for (const [name, pin] of Object.entries(FIXED.pins)) {
    const record = execution?.sources?.[name],
      text = record?.text;
    if (
      typeof text !== 'string' ||
      Buffer.byteLength(text) !== pin.bytes ||
      record.sha256 !== pin.sha256 ||
      hash(text) !== pin.sha256
    )
      fail('fixed source/image ' + name);
    total += Buffer.byteLength(text);
    if (total > 65536) fail('source-control byte bound');
    texts[name] = text;
  }
  if (
    !same(Object.keys(execution.sources).sort(), Object.keys(FIXED.pins).sort()) ||
    !same(execution.sourceFiles, FIXED.sourceFiles) ||
    !same(execution.tests, FIXED.tests) ||
    !same(execution.mockSpecifiers, [SPEC, 'next/cache']) ||
    !same(execution.retainedSegments, FIXED.retainedSegments) ||
    !same(execution.actualExportProjection, FIXED.actualExportProjection) ||
    execution.suiteName !== FIXED.suiteName ||
    execution.compilerVersion !== '5.9.3' ||
    execution.esbuildVersion !== '0.28.2' ||
    execution.vitestVersion !== '4.1.11' ||
    execution.directFactoryCoverageObserved !== false ||
    execution.factorySourceControlRelationRequired !== true
  )
    fail('current finite source/assertion class');
  if (
    !same(
      execution.actualCases,
      FIXED.tests.map(row => ({ name: row.name, state: 'pass' }))
    ) ||
    !same(execution.actualSuites, [
      { name: 'wrapper.test.mjs', state: 'pass' },
      { name: FIXED.suiteName, state: 'pass' },
    ]) ||
    !same(execution.ordinaryPartition?.capsule, [FIXED.sourceFile]) ||
    !Array.isArray(execution.ordinaryPartition.ambient) ||
    execution.ordinaryPartition.ambient.includes(FIXED.sourceFile)
  )
    fail('actual exact ten completion/partition');
  const original = unit(FIXED.sourceFile, texts.originalTest);
  const wrapper = unit(FIXED.wrapperFile, texts.originalWrapper);
  const relay = unit(FIXED.relayFile, texts.originalRelay);
  const generated = unit('wrapper.test.source.ts', texts.generatedTestTs);
  const imports = ast =>
    ast.statements.filter(ts.isImportDeclaration).map(row => row.moduleSpecifier.text);
  if (
    !same(imports(original), ['vitest', './assign.core', SPEC, 'next/cache']) ||
    !same(imports(wrapper), [SPEC, 'next/cache'])
  )
    fail('closed current imports');
  const registrations = original.statements.filter(
    row =>
      ts.isExpressionStatement(row) &&
      ts.isCallExpression(row.expression) &&
      row.expression.expression.getText(original) === 'vi.mock'
  );
  if (
    !same(
      registrations.map(row => row.expression.arguments[0]?.text),
      [SPEC, 'next/cache']
    )
  )
    fail('current mock factories; historical DB mocks are absent');
  const statements = ast =>
    ast.statements
      .filter(row => !ts.isImportDeclaration(row))
      .map(row => [row.getStart(ast), row.end]);
  retained(
    texts.originalTest,
    texts.generatedTestTs,
    FIXED.sourceFile,
    execution.retainedSegments,
    statements(original)
  );
  retained(
    texts.originalWrapper,
    texts.generatedWrapperTs,
    FIXED.wrapperFile,
    execution.retainedSegments,
    statements(wrapper)
  );
  const setup = generated.statements.filter(
    row =>
      ts.isExpressionStatement(row) &&
      ts.isAwaitExpression(row.expression) &&
      ts.isCallExpression(row.expression.expression) &&
      row.expression.expression.expression.getText(generated) === 'materializeMocks' &&
      row.expression.expression.arguments.length === 0
  );
  const describes = generated.statements.filter(
    row =>
      ts.isExpressionStatement(row) &&
      ts.isCallExpression(row.expression) &&
      row.expression.expression.getText(generated) === 'describe'
  );
  if (setup.length !== 1 || describes.length !== 1 || setup[0].end >= describes[0].pos)
    fail('mandatory awaited two-mock setup');
  if (
    !same(
      testPrograms(original),
      FIXED.requiredAssertions.map(row => ({
        name: row.name,
        assertions: row.assertions.map(assertion => assertion.tokensSha256),
      }))
    )
  )
    fail('all mandatory current assertion nodes');
  const mapper = relay.statements.filter(
    row => ts.isFunctionDeclaration(row) && row.name?.text === 'assignmentRelayFailure'
  );
  if (mapper.length !== 1) fail('unique fixed actual export');
  retained(
    texts.originalRelay,
    texts.generatedRelayTs,
    FIXED.relayFile,
    execution.retainedSegments,
    [[mapper[0].getStart(relay), mapper[0].end]]
  );
  const projection = unit('relay.source.ts', texts.generatedRelayTs);
  if (projection.statements.length !== 1 || !ts.isFunctionDeclaration(projection.statements[0]))
    fail('pure actual export only');
  function purity(node) {
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isImportDeclaration(node)
    )
      fail('actual export authority');
    ts.forEachChild(node, purity);
  }
  purity(projection);
  for (const [name, source, generatedName] of [
    ['wrapper.test.source.ts', texts.generatedTestTs, 'generatedTestJs'],
    ['wrapper.source.ts', texts.generatedWrapperTs, 'generatedWrapperJs'],
    ['relay.source.ts', texts.generatedRelayTs, 'generatedRelayJs'],
  ]) {
    const result = ts.transpileModule(source, {
      fileName: name,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        sourceMap: true,
        inlineSources: true,
      },
    });
    if (result.outputText !== texts[generatedName]) fail('fixed compiled program');
  }
  return freeze({
    version: 1,
    kind: 'm4-current-mounted-proof-construction',
    dataOnly: true,
    currentProofClassQualified: true,
    exactCaseCount: FIXED.tests.length,
    sourceFiles: { ...FIXED.sourceFiles },
    exactCases: execution.actualCases.map(row => ({ ...row })),
    mockSpecifiers: [...FIXED.mockSpecifiers],
    pureActualExportProjection: { ...FIXED.actualExportProjection },
    historicalFactoryTransitions: FIXED.historicalFactories.identities.map(identity => ({
      identity,
      disposition: FIXED.historicalFactories.disposition,
      priorSourceSha256: FIXED.historicalFactories.sourceSha256,
      currentSourceSha256: FIXED.sourceFiles[FIXED.sourceFile],
      currentSourceFactoryCallbacksAbsent: true,
      currentNativeIdentityAccepted: false,
    })),
    acceptedOldIdentityCount: 0,
    directFactoryCoverageObserved: false,
    noSDKNetworkAuthorityFromUnitClass: true,
    actualP2FreshOwnerRequired: true,
    runtimeAdmission: false,
    nativeAdmission: false,
  });
}
