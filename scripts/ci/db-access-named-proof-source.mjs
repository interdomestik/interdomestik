import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';

// Owner-approved finite operations. This is not a test-name or directory exemption.
export const NAMED_PROOF_FILES = Object.freeze([
  'apps/web/src/instrumentation.ts',
  'apps/web/src/lib/observability/database-readiness.ts',
  'apps/web/src/lib/observability/sentry-privacy.ts',
  'packages/database/src/migrate.ts',
  'apps/web/src/features/health/health.service.ts',
  'apps/web/src/features/health/health-readiness.test.ts',
  'apps/web/src/lib/observability/database-readiness.test.ts',
  'apps/web/src/lib/rendering-build-mode.test.ts',
  'packages/database/test/owned-tenant-transaction.test.ts',
  'packages/database/test/rls-bootstrap.test.ts',
]);
const PRIVATE = new Set([NAMED_PROOF_FILES[3], ...NAMED_PROOF_FILES.slice(5)]);
const fail = reason => {
  throw new Error('incomplete: named proof ' + reason);
};
// Preserve deterministic UTF-16 ordering independently of host locale.
function compareSourceStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
const sorted = values => [...values].sort(compareSourceStrings);
const equal = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export function namedProofEdges(model, file, configurationSource) {
  const source =
    model.parsed.get(file) ??
    (file === 'apps/web/next.config.mjs' && configurationSource !== undefined
      ? ts.createSourceFile(
          file,
          configurationSource,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.JS
        )
      : undefined);
  if (!source || source.parseDiagnostics.length) fail('malformed source ' + file);
  const imports = {};
  function record(node) {
    if (!node || !ts.isStringLiteral(node)) fail('nonliteral loader ' + file);
    const name = node.text;
    const target =
      model.moduleFile(name, file) ??
      (file === 'apps/web/src/features/health/health.service.ts' &&
      name === '@interdomestik/database/schema/auth'
        ? 'packages/database/src/schema/auth.ts'
        : file === 'apps/web/src/lib/rendering-build-mode.test.ts' &&
            name === '../../next.config.mjs'
          ? 'apps/web/next.config.mjs'
          : undefined);
    if (!target && !model.externalModule(name, file) && !isBuiltin(name))
      fail('unresolved import ' + file + ': ' + name);
    imports[name] = target ?? null;
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      !isErasedTypeEdge(node)
    )
      record(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) fail('require import ' + file);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1) fail('import arguments ' + file);
        record(node.arguments[0]);
      } else if (
        /^(?:require|createRequire|eval|Function)$/u.test(node.expression.getText(source))
      ) {
        fail('unsupported loader ' + file);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return Object.fromEntries(Object.entries(imports).sort(([a], [b]) => a.localeCompare(b)));
}

// readExact comes from the authenticated provider verifier; policy is fixed guard data.
export function verifyNamedProofSource(root, model, policy, readExact) {
  const contract = policy.namedProof;
  if (!contract) return [];
  if (
    contract.id !== 's8-named-operations-v1' ||
    !equal(contract.operations ?? [], NAMED_PROOF_FILES) ||
    contract.runtimeRequired !== true ||
    contract.acceptedReceiptInputs !== false ||
    contract.requiredTests !== 17
  )
    fail('contract identity');
  const config = readExact(root, 'apps/web/tsconfig.json', contract.configuration);
  const parsedConfig = ts.parseConfigFileTextToJson('tsconfig.json', config);
  if (
    parsedConfig.error ||
    JSON.stringify(parsedConfig.config.compilerOptions.paths['@interdomestik/database/*']) !==
      '["../../packages/database/src/*"]'
  )
    fail('health schema alias configuration');
  const records = contract.files ?? {};
  if (Object.keys(records).length > 64 || NAMED_PROOF_FILES.some(file => !records[file]))
    fail('finite closure');
  for (const [file, expected] of Object.entries(records)) {
    const source = readExact(root, file, expected);
    if (file !== 'apps/web/next.config.mjs' && model.parsed.get(file)?.text !== source)
      fail('model/source mismatch ' + file);
    const edges = namedProofEdges(model, file, source);
    if (JSON.stringify(edges) !== JSON.stringify(expected.imports))
      fail('dependency mismatch ' + file);
    if (Object.values(edges).some(target => target && !records[target] && !policy.files[target]))
      fail('dependency leaves fixed closure ' + file);
  }
  for (const [file, source] of model.parsed) {
    if (records[file]) continue;
    function visit(node) {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && !isErasedTypeEdge(node))
        specifier = node.moduleSpecifier;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === 'require')
      )
        specifier = node.arguments[0];
      if (
        ts.isImportEqualsDeclaration(node) &&
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        specifier = node.moduleReference.expression;
      if (
        specifier &&
        ts.isStringLiteral(specifier) &&
        PRIVATE.has(model.moduleFile(specifier.text, file))
      )
        fail('ordinary consumer imports private proof/provisioning source ' + file);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...NAMED_PROOF_FILES];
}
