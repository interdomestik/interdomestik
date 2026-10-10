import ts from 'typescript';
import { isFunction, unwrap } from './db-access-source.mjs';

export const frameworkEntry = file =>
  /(?:^|\/)app\/(?:.*\/)?(?:page|layout|template|default|loading|error|global-error|not-found|route)\.[cm]?[jt]sx?$/u.test(
    file
  ) || /(?:^|\/)(?:middleware|instrumentation)\.[cm]?[jt]s$/u.test(file);
export const BUILTIN_CONSTRUCTORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'Date',
  'Map',
  'Set',
  'URL',
  'URLSearchParams',
  'Promise',
]);
export const BUILTIN_CALLS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'String',
  'Number',
  'Boolean',
  'BigInt',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'fetch',
]);
export function createReferences(model, provenance) {
  function dynamicModule(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node || seen.has(node) || seen.size > 64) return undefined;
    seen = new Set(seen).add(node);
    if (ts.isAwaitExpression(node)) return dynamicModule(node.expression, seen);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      return ts.isStringLiteral(node.arguments[0])
        ? model.moduleFile(node.arguments[0].text, model.fileOf(node))
        : undefined;
    const decl = model.declaration(node);
    return decl && ts.isVariableDeclaration(decl) && decl.initializer
      ? dynamicModule(decl.initializer, seen)
      : undefined;
  }
  function resolve(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node) return { functions: [], unknown: false };
    if (seen.has(node) || seen.size > 256) return { functions: [], unknown: true };
    seen = new Set(seen).add(node);
    const mutated = provenance.isMutated(node);
    if (isFunction(node)) return { functions: [node], unknown: mutated };
    if (ts.isConditionalExpression(node))
      return merge([resolve(node.whenTrue, seen), resolve(node.whenFalse, seen)]);
    if (ts.isBinaryExpression(node))
      return node.operatorToken.kind === ts.SyntaxKind.CommaToken
        ? resolve(node.right, seen)
        : merge([resolve(node.left, seen), resolve(node.right, seen)]);
    if (ts.isObjectLiteralExpression(node))
      return merge(
        node.properties.map(item =>
          resolve(
            ts.isPropertyAssignment(item)
              ? item.initializer
              : ts.isShorthandPropertyAssignment(item)
                ? item.name
                : item,
            seen
          )
        )
      );
    if (ts.isArrayLiteralExpression(node))
      return merge(node.elements.map(item => resolve(item, seen)));
    if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node))
      return resolve(node.expression, seen);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'bind'
    )
      return resolve(node.expression.expression, seen);
    if (ts.isPropertyAccessExpression(node)) {
      if (['call', 'apply', 'bind'].includes(node.name.text)) return resolve(node.expression, seen);
      const module = dynamicModule(node.expression);
      if (module) return resolve(model.exportDeclaration(module, node.name.text), seen);
    }
    const decl = model.declaration(node);
    if (decl && isFunction(decl)) return { functions: [decl], unknown: mutated };
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
      const result = resolve(decl.initializer, seen);
      return { ...result, unknown: result.unknown || (mutated && result.functions.length > 0) };
    }
    if (decl && ts.isPropertyAssignment(decl)) {
      const result = resolve(decl.initializer, seen);
      return { ...result, unknown: result.unknown || (mutated && result.functions.length > 0) };
    }
    if (decl && ts.isShorthandPropertyAssignment(decl)) return resolve(decl.name, seen);
    if (decl && ts.isBindingElement(decl) && ts.isVariableDeclaration(decl.parent.parent)) {
      const module = dynamicModule(decl.parent.parent.initializer);
      if (module)
        return resolve(
          model.exportDeclaration(module, decl.propertyName?.text ?? decl.name.text),
          seen
        );
    }
    return { functions: [], unknown: false };
  }
  function merge(results) {
    return {
      functions: [...new Set(results.flatMap(item => item.functions))],
      unknown: results.some(item => item.unknown),
    };
  }
  function valuePosition(node) {
    const parent = node.parent;
    if (!parent) return false;
    if (ts.isPropertyAccessExpression(parent))
      return parent.name !== node && parent.expression !== node;
    if (parent.name === node && (ts.isDeclaration(parent) || ts.isPropertyAssignment(parent)))
      return false;
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isJsxAttribute(parent))
      return false;
    if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node)
      return false;
    let ancestor = parent;
    while (ancestor && !ts.isSourceFile(ancestor)) {
      if (ts.isTypeNode(ancestor)) return false;
      ancestor = ancestor.parent;
    }
    return true;
  }
  function localImport(expression) {
    const symbol = model.symbol(expression);
    const declarations = symbol?.declarations ?? [];
    // Unresolved local/workspace imports cannot become safe merely because the checker has no symbol.
    for (const sf of [expression.getSourceFile()]) {
      let found = false;
      model.walk(sf, node => {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
        const specifier = node.moduleSpecifier.text;
        if (
          !specifier.startsWith('.') &&
          !specifier.startsWith('@/') &&
          !specifier.startsWith('@interdomestik/')
        )
          return;
        model.walk(node.importClause ?? node, binding => {
          if (ts.isIdentifier(binding) && binding.text === expression.getText().split('.')[0])
            found = true;
        });
      });
      if (found && !declarations.length) return true;
      if (found && !resolve(expression).functions.length) return true;
    }
    return false;
  }
  return { resolve, valuePosition, localImport };
}
