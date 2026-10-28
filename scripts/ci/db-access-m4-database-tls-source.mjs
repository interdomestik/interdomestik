// Finite private-factory TLS source law, not a general callback or TLS analyzer.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { runtimeModule } from './db-access-m4-runtime-source-ast.mjs';
import { deepFreeze } from './db-access-m4-syntax.mjs';
const FILES = Object.freeze({
  posture: 'apps/web/src/server/operations/m4-pool-posture.ts',
  bootstrap: 'apps/web/src/server/operations/m4-private-runtime.ts',
  notification: 'apps/web/src/server/operations/m4-notification-runtime.ts',
});
const digest = value => createHash('sha256').update(value).digest('hex');
const reject = reason => {
  throw Error('m4 database TLS source rejected: ' + reason);
};
const need = (value, reason) => {
  if (!value) reject(reason);
};
const same = (a, b, reason) => need(JSON.stringify(a) === JSON.stringify(b), reason);
// Independent executable law. A source-contract/hash refresh cannot replace this body.
const HELPER = [
  "import { checkServerIdentity, type PeerCertificate } from 'node:tls';",
  'export function captureM4DatabaseTls(target: M4PoolTarget) {',
  '  const expectedHostname = new URL(target.url).hostname;',
  '  return Object.freeze({',
  '    rejectUnauthorized: true,',
  '    checkServerIdentity(_driverHostname: string, certificate: PeerCertificate) {',
  '      return checkServerIdentity(expectedHostname, certificate);',
  '    },',
  '  });',
  '}',
].join('\n');
const POOL_IMPORTS = Object.freeze({
  bootstrap:
    "import { assertM4DriverEnvironment, assertM4PoolPosture, captureM4DatabaseTls } from './m4-pool-posture';",
  notification:
    "import { assertM4DriverEnvironment, assertM4PoolPosture, captureM4PoolTarget, captureM4DatabaseTls } from './m4-pool-posture';",
});
const POOLS = Object.freeze({
  bootstrap: [
    ['identity', 'identityTarget'],
    ['data', 'dataTarget'],
  ],
  notification: [['pool', 'notificationTarget']],
});
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}
function only(module, predicate, label) {
  const found = [];
  walk(module.source, node => {
    if (predicate(node)) found.push(node);
  });
  need(found.length === 1, 'unique ' + label);
  return found[0];
}
const importFrom = name => node =>
  ts.isImportDeclaration(node) && node.moduleSpecifier.text === name;
const named = name => node => ts.isFunctionDeclaration(node) && node.name?.text === name;
const tree = (module, node) => {
  need(module.observed.has(node), 'executable AST node');
  return module.observed.get(node);
};
function bindingCount(module, name) {
  let count = 0;
  walk(module.source, node => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isImportSpecifier(node) ||
        ts.isNamespaceImport(node) ||
        ts.isImportClause(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    )
      count++;
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === name) count++;
  });
  return count;
}
function expressionTree(text) {
  const module = runtimeModule('const expected = ' + text + ';', 'fixed-tls-expression.ts');
  return tree(module, module.source.statements[0].declarationList.declarations[0].initializer);
}
function poolFacts(module, role) {
  const expectedImport = runtimeModule(POOL_IMPORTS[role], FILES[role]);
  const actualImport = only(module, importFrom('./m4-pool-posture'), 'posture helper import');
  same(
    tree(module, actualImport),
    tree(expectedImport, expectedImport.source.statements[0]),
    'exact imported posture helper binding'
  );
  need(bindingCount(module, 'captureM4DatabaseTls') === 1, 'helper import cannot be rebound');
  const driverImport = only(module, importFrom('postgres'), 'driver import');
  const expectedDriver = runtimeModule(
    "import postgres from 'postgres';",
    'fixed-driver-import.ts'
  );
  same(
    tree(module, driverImport),
    tree(expectedDriver, expectedDriver.source.statements[0]),
    'exact installed driver binding'
  );
  need(bindingCount(module, 'postgres') === 1, 'driver import cannot be rebound');
  const actualCalls = [];
  walk(module.source, node => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'postgres'
    )
      actualCalls.push(node);
  });
  need(actualCalls.length === POOLS[role].length, 'exact private pool construction count');
  const pools = POOLS[role].map(([purpose, target]) => {
    const assignment = only(
      module,
      node =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        node.left.text === purpose &&
        ts.isCallExpression(node.right) &&
        ts.isIdentifier(node.right.expression) &&
        node.right.expression.text === 'postgres',
      purpose + ' factory'
    );
    const call = assignment.right;
    need(
      call.arguments.length === 2 && ts.isObjectLiteralExpression(call.arguments[1]),
      'fixed pool argument envelope'
    );
    const options = call.arguments[1];
    need(
      options.properties.every(node => ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)),
      'no spread/computed/alternate pool options'
    );
    same(
      tree(module, call.arguments[0]),
      expressionTree(target + '.url'),
      purpose + ' captured URL'
    );
    const tlsFields = options.properties.filter(node => node.name.text === 'ssl');
    need(tlsFields.length === 1, 'one fixed TLS field');
    same(
      tree(module, tlsFields[0].initializer),
      expressionTree('loopbackQualification ? false : captureM4DatabaseTls(' + target + ')'),
      purpose + ' exact captured target and fixed local/strict TLS branches'
    );
    return {
      purpose,
      target,
      urlTree: tree(module, call.arguments[0]),
      tlsTree: tree(module, tlsFields[0].initializer),
      optionsTree: tree(module, options),
      node: tlsFields[0].initializer,
    };
  });
  return {
    importTree: tree(module, actualImport),
    driverImportTree: tree(module, driverImport),
    importNode: actualImport,
    driverImportNode: driverImport,
    pools,
  };
}
export function deriveM4DatabaseTlsSource({ postureSource, poolSource, poolRole }) {
  need(Object.hasOwn(POOLS, poolRole), 'one literal private pool role');
  const posture = runtimeModule(postureSource, FILES.posture);
  const expected = runtimeModule(HELPER, FILES.posture);
  same(
    posture.source.statements.map(node => {
      if (ts.isImportDeclaration(node))
        return ['import', node.moduleSpecifier.text, Boolean(node.importClause?.isTypeOnly)];
      if (ts.isTypeAliasDeclaration(node)) return ['type', node.name.text];
      if (ts.isFunctionDeclaration(node)) return ['function', node.name?.text];
      return ['extra-execution', ts.SyntaxKind[node.kind]];
    }),
    [
      ['import', 'postgres', true],
      ['import', 'node:tls', false],
      ['type', 'M4PoolTarget'],
      ['function', 'captureM4PoolTarget'],
      ['function', 'captureM4DatabaseTls'],
      ['function', 'assertM4DriverEnvironment'],
      ['function', 'assertM4PoolPosture'],
    ],
    'closed posture module declarations; no extra initializer or intrinsic rebinding'
  );
  const actualImport = only(posture, importFrom('node:tls'), 'Node TLS import');
  const helper = only(posture, named('captureM4DatabaseTls'), 'captured-host helper');
  same(
    tree(posture, actualImport),
    tree(expected, expected.source.statements[0]),
    'exact Node standard TLS checker import'
  );
  same(
    tree(posture, helper),
    tree(expected, expected.source.statements[1]),
    'captured URL host, frozen strict options and returned standard validation'
  );
  need(
    bindingCount(posture, 'checkServerIdentity') === 1,
    'Node standard checker cannot be rebound'
  );
  need(bindingCount(posture, 'captureM4DatabaseTls') === 1, 'sealed helper cannot be rebound');
  need(
    bindingCount(posture, 'URL') === 0 && bindingCount(posture, 'Object') === 0,
    'captured URL/freeze intrinsics cannot be shadowed'
  );
  const module = runtimeModule(poolSource, FILES[poolRole]),
    pools = poolFacts(module, poolRole);
  const facts = {
    helperImportTree: tree(posture, actualImport),
    helperTree: tree(posture, helper),
    poolRole,
    poolImportTree: pools.importTree,
    driverImportTree: pools.driverImportTree,
    pools: pools.pools.map(({ node, ...row }) => row),
  };
  const locate = (file, node) => ({
    file,
    pos: node.pos,
    start: node.getStart(),
    end: node.end,
    kind: ts.SyntaxKind[node.kind],
  });
  return deepFreeze({
    version: 1,
    sourcePremiseOnly: true,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    productionEventAuthenticated: false,
    sourceSha256: { [FILES.posture]: digest(postureSource), [FILES[poolRole]]: digest(poolSource) },
    facts,
    factsSha256: digest(JSON.stringify(facts)),
    sourceNodes: [
      locate(FILES.posture, actualImport),
      locate(FILES.posture, helper),
      locate(FILES[poolRole], pools.importNode),
      locate(FILES[poolRole], pools.driverImportNode),
      ...pools.pools.map(row => locate(FILES[poolRole], row.node)),
    ],
    guarantee:
      'Only a lexical captured URL hostname and the exact Node standard checker determine certificate identity; CA validation stays strict, options frozen, purpose targets fixed.',
    premises: [
      'Node TLS/URL/Object intrinsics, exact installed driver and load custody require qualification.',
      'No TLS handshake, SQL role, endpoint deployment, native or production admission follows from source derivation.',
    ],
  });
}
