import ts from 'typescript';
import { hasExportModifier } from './package-exports.mjs';
import { sha256 } from './rules-digest.mjs';

// Reviewed pilot forwarders are admitted only at these paths and with their exact current bytes.
const REVIEWED_FORWARDERS = new Map([
  ['scripts/pilot/import-pilot-database.ts', '78fad889b6bd87c5e3291556abdd2e075cb4a6d2d52e5b1ec96a4ae7b19700cd'],
  ['scripts/pilot/scenario_helpers.ts', 'e14e27eb2de5bababead915d97946824e016d66997a5ac7aafd8eb288dbb4445'],
]);

export function reviewedOutsideForward(file, text) {
  const digest = REVIEWED_FORWARDERS.get(file);
  return digest !== undefined && sha256(text) === digest;
}

export function changedOutsideForwarders(sources) {
  return [...REVIEWED_FORWARDERS.keys()].filter(file =>
    sources.has(file) && !reviewedOutsideForward(file, sources.get(file))
  );
}

function literalSpecifier(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

export function loaderArgument(node) {
  if (!ts.isCallExpression(node)) return null;
  const callee = ts.skipOuterExpressions(node.expression);
  const [argument] = node.arguments;
  if (!argument) return null;
  if (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require')
  )
    return ts.skipOuterExpressions(argument);
  return null;
}

function loadedSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    return literalSpecifier(node.moduleSpecifier);
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return literalSpecifier(node.moduleReference.expression);
  return literalSpecifier(loaderArgument(node));
}

function hasCommonJsExport(node) {
  if (ts.isExportAssignment(node)) return node.isExportEquals;
  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
    return exportsObject(node.left) || exportsObject(node.left.expression);
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const { expression, name } = node.expression;
  if (!ts.isIdentifier(expression) || expression.text !== 'Object') return false;
  return (
    ['assign', 'defineProperty', 'defineProperties'].includes(name.text) &&
    exportsObject(node.arguments[0])
  );
}

function exportsObject(node) {
  if (!node) return false;
  const value = ts.skipOuterExpressions(node);
  if (ts.isIdentifier(value)) return value.text === 'exports';
  if (!ts.isPropertyAccessExpression(value) && !ts.isElementAccessExpression(value)) return false;
  const key = ts.isPropertyAccessExpression(value)
    ? value.name.text
    : literalSpecifier(value.argumentExpression);
  return (
    ts.isIdentifier(value.expression) && value.expression.text === 'module' && key === 'exports'
  );
}

/** An outside module with exports and a load edge can forward any binding on that edge. */
export function outsideExportLoads(source, commonJsOnly) {
  const imports = new Set();
  let exports = false;
  const visit = node => {
    const specifier = loadedSpecifier(node);
    if (specifier) imports.add(specifier);
    if (
      hasCommonJsExport(node) ||
      (!commonJsOnly &&
        (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || hasExportModifier(node)))
    )
      exports = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return exports ? imports : [];
}
