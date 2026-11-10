// Exact-path confinement of the seed-only driver, including uses inside the database kernel.
import ts from 'typescript';
import { SEED_TLS_IMPORTERS, SEED_TLS_MODULE } from './manifest.mjs';

/** Refuses every import outside the finite seed caller list, and every re-export. Tests are
 * already excluded by scanFiles using the unchanged TEST_SOURCE classification. */
export function checkSeedTlsModuleUse(scan, node) {
  checkLocalExport(scan, node);
  const specifier = moduleSpecifier(scan, node);
  if (!specifier) return;
  // Match resolved paths, not spelling: package subpaths and resolver aliases obey the same rule.
  const reachesSeedTls = scan.graph
    .resolveSpecifier(scan.file, specifier)
    .files.some(target => moduleReachesSeedTls(scan.graph, target));
  if (!reachesSeedTls) return;
  const reexport = ts.isExportDeclaration(node);
  if (reexport || !SEED_TLS_IMPORTERS.has(scan.file))
    scan.report(
      node,
      'R-a',
      `${reexport ? 're-export' : 'runtime import'} of seed-only module ${specifier}`
    );
}

const seedTlsOrigin = (graph, origin, seen = new Set()) =>
  origin.file === SEED_TLS_MODULE ||
  origin.namespace?.some(target => moduleReachesSeedTls(graph, target, seen));

// Namespace exports can forward another module object. Follow only those export origins, with
// cycle detection, so skipped test modules cannot launder the seed driver into runtime code.
function moduleReachesSeedTls(graph, file, seen = new Set()) {
  if (file === SEED_TLS_MODULE) return true;
  if (seen.has(file)) return false;
  seen.add(file);
  return [...graph.exportNames(file)].some(name =>
    graph.resolveExport(file, name).some(origin => seedTlsOrigin(graph, origin, seen))
  );
}

function moduleSpecifier(scan, node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  )
    return node.moduleSpecifier.text;
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteral(node.moduleReference.expression)
  )
    return node.moduleReference.expression.text;
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  const loader =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) &&
      callee.text === 'require' &&
      !scan.fact.references.find(reference => reference.node === callee)?.binding);
  const argument = node.arguments[0];
  return loader && argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

function checkLocalExport(scan, node) {
  // Local named/default/namespace aliases still resolve to the declaring module.
  const names = ts.isExportAssignment(node)
    ? ['default']
    : ts.isExportDeclaration(node) &&
        !node.moduleSpecifier &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements.map(element => element.name.text)
      : [];
  if (
    names.some(name =>
      scan.graph.resolveExport(scan.file, name).some(origin => seedTlsOrigin(scan.graph, origin))
    )
  )
    scan.report(node, 'R-a', `re-export of seed-only module ${SEED_TLS_MODULE}`);
}
