// Kernel code must not hide new module edges behind computed or indirect Node loaders.
import ts from 'typescript';
import { opaqueExecutionReference } from './seed-tls-global-loaders.mjs';
import { CONTRACTS } from './contracts.mjs';
import { sha256 } from './rules-digest.mjs';
import { fingerprint, unitName, unitOf } from './syntax.mjs';
import { loaderMember, moduleEdges, opaqueGlobalLoaderUse } from './seed-tls-import-graph.mjs';
import { existingVerifierSite, isVerifierUnit, VERIFIER } from './seed-tls-loader-sites.mjs';

const referencesByFact = new WeakMap();
function referenceAt(scan, node) {
  if (!referencesByFact.has(scan.fact))
    referencesByFact.set(
      scan.fact,
      new Map(scan.fact.references.map(reference => [reference.node, reference]))
    );
  return referencesByFact.get(scan.fact).get(node);
}

function checkVerifierImport(node, refuse) {
  // Runtime may acquire only the checked entry functions, never the operations object.
  const bindings = ts.isImportDeclaration(node) && node.importClause?.namedBindings;
  if (
    !bindings ||
    !ts.isNamedImports(bindings) ||
    node.importClause.name ||
    bindings.elements.some(
      item =>
        !['verifyMigrationCallbackSources', 'recheckMigrationCallbackSources'].includes(
          (item.propertyName ?? item.name).text
        )
    )
  )
    refuse();
}

function checkLoaderSyntax(scan, node, edge, refuse) {
  const member = loaderMember(node);
  if (['require', 'createRequire', '_load', 'getBuiltinModule'].includes(member)) refuse();
  if (member === 'importModule' && !isVerifierUnit(scan, node, 'verifyMigrationCallbackSources'))
    refuse();
  // Node builtin objects expose loaders even through destructuring or value aliases.
  if (
    edge &&
    ['module', 'node:module', 'process', 'node:process'].includes(edge.specifier) &&
    !ts.isImportDeclaration(node)
  )
    refuse();
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) {
      if (!existingVerifierSite(scan, node)) refuse();
    }
  }
}

function checkVerifierBinding(scan, node, binding, refuse) {
  if (binding?.name === 'requireFromHere' && !isVerifierUnit(scan, node, 'resolveCallbackSource'))
    refuse();
  if (
    binding?.name === 'CALLBACK_SOURCE_OPS' &&
    !isVerifierUnit(scan, node, 'verifyMigrationCallbackSources')
  )
    refuse();
}

function checkRequireCall(node, refuse) {
  const call = node.parent;
  if (
    !ts.isCallExpression(call) ||
    call.expression !== node ||
    call.questionDotToken ||
    !call.arguments[0] ||
    !ts.isStringLiteralLike(call.arguments[0])
  )
    refuse();
}

function checkImportedLoader(scan, node, binding, refuse) {
  if (binding?.kind !== 'import') return;
  const imported = scan.graph.tableOf(scan.file).imports.get(binding.name);
  if (!imported) return;
  const origins = scan.graph.resolveImport(scan.file, imported.specifier, imported.imported);
  for (const origin of origins) {
    if (!['module', 'node:module', 'process', 'node:process'].includes(origin.external)) continue;
    if (
      ['createRequire', 'getBuiltinModule'].includes(origin.name) &&
      !existingVerifierSite(scan, node)
    )
      refuse();
    // Namespace/default/Module objects expose createRequire through .default or .Module.
    if (['*', 'default', 'Module'].includes(origin.name)) refuse();
  }
}

function checkLoaderReference(scan, node, reference, refuse) {
  if (opaqueGlobalLoaderUse(node, referencesByFact.get(scan.fact))) refuse();
  if (
    opaqueExecutionReference(node, referencesByFact.get(scan.fact)) &&
    !existingSentryReference(scan, node)
  )
    refuse();
  const { binding } = reference;
  if (node.text === 'createRequire' && !existingVerifierSite(scan, node)) refuse();
  if (scan.file === VERIFIER) checkVerifierBinding(scan, node, binding, refuse);
  if (node.text === 'require' && !binding) checkRequireCall(node, refuse);
  checkImportedLoader(scan, node, binding, refuse);
  // The ordinary R-e check and exact contracts.mjs source contract still check Sentry eval.
}

export function checkDatabaseLoader(scan, node) {
  const refuse = () => scan.report(node, 'R-e', 'opaque or indirect database loader');
  const edge = moduleEdges(scan.seedTls?.graph ?? scan.graph, scan.file).get(node);
  if (edge?.targets.includes(VERIFIER)) checkVerifierImport(node, refuse);
  if (!scan.file.startsWith('packages/database/src/')) return;
  checkLoaderSyntax(scan, node, edge, refuse);
  if (!ts.isIdentifier(node)) return;
  const reference = referenceAt(scan, node);
  if (!reference) return;
  checkLoaderReference(scan, node, reference, refuse);
}

function existingSentryReference(scan, node) {
  // Read the existing contract without consuming it twice. The ordinary R-e check still
  // enforces its count/unique-unit requirements; no verifier unit admits Function or eval.
  if (
    scan.file !== 'packages/database/src/db.ts' ||
    node.text !== 'Function' ||
    !ts.isNewExpression(node.parent) ||
    node.parent.expression !== node
  )
    return false;
  const unit = unitOf(node);
  const name = unitName(unit, scan.sourceFile);
  return (
    name === 'loadOptionalSentry' &&
    CONTRACTS.some(
      contract =>
        contract.file === scan.file &&
        contract.unit === name &&
        contract.kinds.eval === 1 &&
        contract.sha256 === sha256(fingerprint(unit, scan.sourceFile))
    )
  );
}
