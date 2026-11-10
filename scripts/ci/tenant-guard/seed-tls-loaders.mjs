// Kernel code must not hide new module edges behind computed or indirect Node loaders.
import ts from 'typescript';
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

export function checkDatabaseLoader(scan, node) {
  const refuse = () => scan.report(node, 'R-e', 'opaque or indirect database loader');
  const edge = moduleEdges(scan.graph, scan.file).get(node);
  // The exported verifier operations object contains the admitted computed loader. Runtime
  // may acquire only the existing checked entry functions, never that object or a namespace.
  if (edge?.targets.includes(VERIFIER)) {
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
  if (!scan.file.startsWith('packages/database/src/')) return;
  const member = loaderMember(node);
  if (['require', 'createRequire', '_load', 'getBuiltinModule'].includes(member)) refuse();
  if (member === 'importModule' && !isVerifierUnit(scan, node, 'verifyMigrationCallbackSources'))
    refuse();
  // require/import()/import-equals of node:module produces a loader-bearing object. Do not let
  // destructuring or value aliases hide createRequire; ordinary static named imports stay visible.
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
  if (!ts.isIdentifier(node)) return;
  const reference = referenceAt(scan, node);
  if (!reference) return;
  if (opaqueGlobalLoaderUse(node, referencesByFact.get(scan.fact))) refuse();
  const { binding } = reference;
  if (node.text === 'createRequire' && !existingVerifierSite(scan, node)) refuse();
  if (scan.file === VERIFIER) {
    if (binding?.name === 'requireFromHere' && !isVerifierUnit(scan, node, 'resolveCallbackSource'))
      refuse();
    if (
      binding?.name === 'CALLBACK_SOURCE_OPS' &&
      !isVerifierUnit(scan, node, 'verifyMigrationCallbackSources')
    )
      refuse();
  }
  if (node.text === 'require' && !binding) {
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
    // Namespace/default/Module objects expose createRequire even through .default or .Module.
    if (['*', 'default', 'Module'].includes(origin.name)) refuse();
  }
  // db.ts#loadOptionalSentry's new Function is already checked by R-e and its exact source-bound
  // eval contract in contracts.mjs. No file-wide or additional eval exemption is introduced here.
}
