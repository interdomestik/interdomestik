import ts from 'typescript';
import { hasExportModifier } from './package-exports.mjs';

function literalSpecifier(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function loadedSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    return literalSpecifier(node.moduleSpecifier);
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return literalSpecifier(node.moduleReference.expression);
  if (!ts.isCallExpression(node)) return null;
  const callee = ts.skipOuterExpressions(node.expression);
  const [argument] = node.arguments;
  if (!argument) return null;
  if (
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require')
  )
    return literalSpecifier(ts.skipOuterExpressions(argument));
  return null;
}

function hasCommonJsExport(node) {
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
export function outsideExportLoads(source) {
  const imports = new Set();
  let exports = false;
  const visit = node => {
    const specifier = loadedSpecifier(node);
    if (specifier) imports.add(specifier);
    if (
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node) ||
      hasExportModifier(node) ||
      hasCommonJsExport(node)
    )
      exports = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return exports ? imports : [];
}
