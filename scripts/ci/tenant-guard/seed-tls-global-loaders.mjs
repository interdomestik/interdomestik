import ts from 'typescript';

export function loaderMember(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
    return node.argumentExpression.text;
  return null;
}
function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node))
  )
    node = node.expression;
  return node;
}
function globalRoot(node, references, seen = new Set()) {
  node = unwrap(node);
  if (!node || !ts.isIdentifier(node) || seen.has(node)) return null;
  seen.add(node);
  const reference = references.get(node);
  if (!reference) return null;
  if (!reference.binding)
    return ['globalThis', 'global', 'process', 'module'].includes(node.text) ? node.text : null;
  const declaration = reference.binding.decl;
  return ts.isVariableDeclaration(declaration)
    ? globalRoot(declaration.initializer, references, seen)
    : null;
}
function symbolKey(node, references) {
  node = unwrap(node);
  if (!node || !ts.isIdentifier(node)) return false;
  const declaration = references.get(node)?.binding?.decl;
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    (declaration.parent.flags & ts.NodeFlags.Const) === 0
  )
    return false;
  const initializer = unwrap(declaration.initializer);
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const callee = initializer.expression;
  let symbol = null;
  if (ts.isIdentifier(callee) && callee.text === 'Symbol') symbol = callee;
  else if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'for' &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Symbol'
  )
    symbol = callee.expression;
  return symbol !== null && !references.get(symbol)?.binding;
}

// Follow local aliases, including erased casts, so normal database-client state aliases stay
// usable without turning those aliases into a way to obtain require or select unknown globals.
export function opaqueGlobalLoaderUse(node, references) {
  const root = globalRoot(node, references);
  if (!root) return false;
  if (root === 'module') return true;
  let expression = node;
  while (expression.parent && unwrap(expression.parent) === node) expression = expression.parent;
  const parent = expression.parent;
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === expression &&
    ts.isIdentifier(parent.name)
  )
    return (
      parent.parent.parent.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
      ) ?? false
    );
  if (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === expression
  ) {
    const member = loaderMember(parent);
    if (member)
      return [
        'valueOf',
        'Function',
        'constructor',
        'eval',
        'require',
        'createRequire',
        'getBuiltinModule',
        'mainModule',
        'module',
        'process',
        'global',
        'globalThis',
      ].includes(member);
    return (
      !ts.isElementAccessExpression(parent) || !symbolKey(parent.argumentExpression, references)
    );
  }
  // Seed target binding defines a symbol-keyed global facade. A symbol cannot name a Node loader.
  if (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === expression &&
    parent.expression.getText() === 'Object.defineProperty' &&
    !references.get(parent.expression.expression)?.binding &&
    symbolKey(parent.arguments[1], references) &&
    ts.isExpressionStatement(parent.parent)
  )
    return false;
  return true;
}

// Any reference can be aliased/carried/called indirectly; checking call syntax is insufficient.
export function opaqueExecutionReference(node, references) {
  const reference = references.get(node);
  return (
    ts.isIdentifier(node) &&
    ['Function', 'eval'].includes(node.text) &&
    reference !== undefined &&
    !reference.binding
  );
}
