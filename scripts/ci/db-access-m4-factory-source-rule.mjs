// Pure finite source derivation. Genuine execution ownership comes only from P2's private take.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
function readFactoryContract() {
  const file = path.join(import.meta.dirname, 'db-access-m4-factory-contract.json');
  if (fs.realpathSync(file) !== file) throw Error('Physical fixed factory contract required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd),
      bytes = fs.readFileSync(fd),
      after = fs.fstatSync(fd),
      current = fs.lstatSync(file);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      ![0o644, 0o444].includes(before.mode & 0o7777) ||
      before.size !== 4297 ||
      bytes.length !== 4297 ||
      createHash('sha256').update(bytes).digest('hex') !==
        '0599c16deb90a431fe409160708a5171eecd418aab500be9c1e1c74297aa9295' ||
      ['dev', 'ino', 'size', 'mode', 'uid', 'nlink', 'mtimeMs', 'ctimeMs'].some(
        key => before[key] !== after[key] || after[key] !== current[key]
      )
    )
      throw Error('Fixed factory contract bytes or custody changed');
    return JSON.parse(bytes);
  } finally {
    fs.closeSync(fd);
  }
}
const FIXED = readFactoryContract();
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
const fail = reason => {
  throw Error('M4 fixed factory construction refused: ' + reason);
};
const unit = (file, text) => {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) fail('source syntax');
  return ast;
};
function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text),
    result = [];
  for (let k; (k = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken;)
    result.push([k, scanner.getTokenText()]);
  return JSON.stringify(result);
}
function fingerprint(source) {
  return hash(
    tokens(
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
          verbatimModuleSyntax: true,
          removeComments: true,
        },
      }).outputText
    )
  );
}
const locate = (file, node) => [file, node.pos, node.end, node.kind];
const expression = statement =>
  ts.isExpressionStatement(statement) ? statement.expression : undefined;
function registrations(ast) {
  return ast.statements.flatMap(statement => {
    const call = expression(statement);
    return call && ts.isCallExpression(call) && call.expression.getText(ast) === 'vi.mock'
      ? [call]
      : [];
  });
}
function awaitedMaterialization(ast, mocks) {
  const materializations = ast.statements.filter(statement => {
    const exp = expression(statement);
    return (
      exp &&
      ts.isAwaitExpression(exp) &&
      ts.isCallExpression(exp.expression) &&
      exp.expression.expression.getText(ast) === 'materializeMocks' &&
      exp.expression.arguments.length === 0
    );
  });
  const describes = ast.statements.filter(statement => {
    const exp = expression(statement);
    return exp && ts.isCallExpression(exp) && exp.expression.getText(ast) === 'describe';
  });
  if (
    materializations.length !== 1 ||
    describes.length !== 1 ||
    mocks.some(mock => mock.end > materializations[0].getStart(ast)) ||
    materializations[0].end >= describes[0].pos
  )
    fail('mandatory six-factory setup before tests');
  return materializations[0];
}
function retainedFactory(original, generated, segments, factory) {
  const matches = segments.filter(
    segment =>
      segment.file === FIXED.sourceFile &&
      segment.start <= factory.getStart() &&
      segment.end >= factory.end
  );
  if (matches.length !== 1) fail('unique retained factory segment');
  const s = matches[0],
    text = original.slice(s.start, s.end);
  if (
    hash(text) !== s.sha256 ||
    s.generatedEnd - s.generatedStart !== s.end - s.start ||
    generated.slice(s.generatedStart, s.generatedEnd) !== text
  )
    fail('retained source bytes');
  return {
    originalStart: s.start,
    originalEnd: s.end,
    generatedStart: s.generatedStart,
    generatedEnd: s.generatedEnd,
    sha256: s.sha256,
  };
}

export function deriveFixedFactoryConstruction(execution) {
  if (ts.version !== FIXED.parserVersion) fail('fixed parser');
  const names = {
    originalTest: 'originalTest',
    generatedTestSource: 'generatedTestTs',
    generatedTest: 'generatedTestJs',
    registry: 'registry',
    runSuite: 'runner',
    sourceFence: 'sourceFence',
    ordinaryJob: 'ordinaryJob',
    generatedWrapper: 'generatedWrapperJs',
  };
  const bytes = {};
  for (const [name, pin] of Object.entries(FIXED.pins)) {
    const record = execution.sources?.[names[name]],
      text = record?.text;
    if (
      typeof text !== 'string' ||
      Buffer.byteLength(text) !== pin.bytes ||
      hash(text) !== pin.sha256 ||
      record.sha256 !== pin.sha256
    )
      fail('fixed source/image input ' + name);
    bytes[name] = text;
  }
  const oracle = execution;
  if (
    !same(oracle.tests, FIXED.tests) ||
    !same(oracle.mockSpecifiers, FIXED.mockSpecifiers) ||
    oracle.compilerVersion !== '5.9.3' ||
    oracle.vitestVersion !== '4.1.11' ||
    oracle.esbuildVersion !== '0.28.2' ||
    oracle.sourceFiles[FIXED.sourceFile] !== FIXED.pins.originalTest.sha256
  )
    fail('fixed capsule source/assertion oracle');
  if (
    execution.directFactoryCoverageObserved !== false ||
    execution.factorySourceControlRelationRequired !== true
  )
    fail('source-control scope; no direct factory coverage is observed');
  if (
    !same(
      execution.actualCases,
      FIXED.tests.map(test => ({ name: test.name, state: 'pass' }))
    ) ||
    !same(execution.actualSuites, [
      { name: 'wrapper.test.mjs', state: 'pass' },
      { name: 'assignClaimCore (Wrapper Means)', state: 'pass' },
    ])
  )
    fail('actual exact nine completion');
  if (
    !same(execution.ordinaryPartition?.capsule, [FIXED.sourceFile]) ||
    !Array.isArray(execution.ordinaryPartition.ambient) ||
    execution.ordinaryPartition.ambient.includes(FIXED.sourceFile)
  )
    fail('source partition');
  const original = unit(FIXED.sourceFile, bytes.originalTest),
    generatedTs = unit('wrapper.test.source.ts', bytes.generatedTestSource),
    generatedJs = unit('wrapper.test.mjs', bytes.generatedTest);
  const mocks = registrations(original),
    tsMocks = registrations(generatedTs),
    jsMocks = registrations(generatedJs);
  for (const calls of [mocks, tsMocks, jsMocks])
    if (
      calls.length !== 6 ||
      !same(
        calls.map(call => call.arguments[0]?.text),
        FIXED.mockSpecifiers
      )
    )
      fail('six exact literal mock registrations');
  const setup = awaitedMaterialization(generatedTs, tsMocks);
  awaitedMaterialization(generatedJs, jsMocks);
  const registry = unit('registry.mjs', bytes.registry);
  const gate = registry.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'materializeMocks'
  );
  if (
    !gate?.body ||
    gate.body.statements.length !== 2 ||
    tokens(gate.body.statements[0].getText(registry)) !==
      tokens("if (pending.size !== 6) throw Error('Expected six source mocks');") ||
    tokens(gate.body.statements[1].getText(registry)) !==
      tokens('for (const [id, factory] of pending) mocks.set(id, await factory());')
  )
    fail('unconditional exact six-factory materialization');
  const init = original.statements.flatMap(statement =>
    ts.isVariableStatement(statement)
      ? [...statement.declarationList.declarations].filter(
          node => node.name.getText(original) === 'dbMocks'
        )
      : []
  );
  if (
    init.length !== 1 ||
    tokens(init[0].initializer.getText(original)) !==
      tokens(
        'vi.hoisted(() => ({claimFindFirst: vi.fn(), withTenant: vi.fn((tenantId, tenantColumn, condition) => ({tenantId, tenantColumn, condition,})),}))'
      )
  )
    fail('closed non-DB mock capture initialization');
  const expectedBodies = [
    '({db:{query:{claims:{findFirst:dbMocks.claimFindFirst,},},},})',
    '({withTenant:dbMocks.withTenant,})',
  ];
  const fp = fingerprint(bytes.originalTest);
  const factories = FIXED.specifiers.map((specifier, index) => {
    const at = FIXED.mockSpecifiers.indexOf(specifier),
      call = mocks[at],
      factory = call.arguments[1];
    if (
      call.arguments.length !== 2 ||
      !ts.isArrowFunction(factory) ||
      factory.parameters.length ||
      factory.modifiers?.length ||
      tokens(factory.body.getText(original)) !== tokens(expectedBodies[index])
    )
      fail('exact zero-argument object-return factory');
    if (
      tokens(tsMocks[at].arguments[1].getText(generatedTs)) !== tokens(factory.getText(original)) ||
      tokens(jsMocks[at].arguments[1].getText(generatedJs)) !== tokens(factory.getText(original))
    )
      fail('generated factory expression correspondence');
    const identity = hash(FIXED.sourceFile + '|' + fp + '|' + factory.body.pos + '|escape');
    if (identity !== FIXED.factoryIds[index]) fail('native operation identity');
    return {
      identity,
      specifier,
      sourceFile: FIXED.sourceFile,
      sourceSha256: FIXED.pins.originalTest.sha256,
      owner: locate(FIXED.sourceFile, factory),
      operation: locate(FIXED.sourceFile, factory.body),
      registration: locate(FIXED.sourceFile, call),
      returnText: factory.body.getText(original),
      retainedSegment: retainedFactory(
        bytes.originalTest,
        bytes.generatedTestSource,
        oracle.retainedSegments,
        factory
      ),
      capture: index === 0 ? 'vi.hoisted.vi.fn:claimFindFirst' : 'vi.hoisted.vi.fn:withTenant',
      class: 'exact-zero-argument-closed-registry-non-db-return',
    };
  });
  // Hashes above pin the complete reviewed registry and runner, not caller claims.
  // Registry rejects importActual, accepts only six unique literal registrations,
  // unconditionally awaits each factory, and getMock cannot expose the factory.
  // Both generated programs await materializeMocks before the sole test describe.
  return {
    version: 1,
    rule: FIXED.id,
    factories,
    sourceSha256: FIXED.pins.originalTest.sha256,
    sourceFenceSha256: FIXED.pins.sourceFence.sha256,
    registrySha256: FIXED.pins.registry.sha256,
    runSuiteSha256: FIXED.pins.runSuite.sha256,
    registryGate: { locator: locate('registry.mjs', gate), sha256: hash(gate.getText(registry)) },
    mandatorySetup: locate('wrapper.test.source.ts', setup),
    actualCases: structuredClone(execution.actualCases),
    assertionOracleSha256: hash(JSON.stringify(oracle.tests)),
    executionDerivation: 'fixed source control and actual nine completion; no factory V8 claim',
    nativeAdmission: false,
    productionCCredit: 0,
  };
}
