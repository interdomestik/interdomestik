// One createSourceFile pass per file: no type checker, no cross-file value flow. This module turns a
// file into the facts the tenant guard needs: units (the outermost function, or the top-level
// statement, that encloses a point), a normalized fingerprint per unit, and every identifier
// reference resolved to its lexical binding.

import ts from 'typescript';
import { isFunctionLike } from './scopes.mjs';
export { analyzeScopes, isFunctionLike } from './scopes.mjs';

const SCRIPT_KINDS = [
  [/\.[cm]?tsx$/u, ts.ScriptKind.TSX],
  [/\.[cm]?jsx$/u, ts.ScriptKind.JSX],
  [/\.[cm]?js$/u, ts.ScriptKind.JS],
];

export function parseSource(file, text) {
  const kind = SCRIPT_KINDS.find(([pattern]) => pattern.test(file))?.[1] ?? ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

const isJsDoc = node =>
  node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;

/** Comment- and whitespace-insensitive token text of a node. Token boundaries come from the parser. */
export function fingerprint(node, sourceFile) {
  // Token text alone is not exact: under automatic semicolon insertion `return value` and
  // `return\nvalue` share their tokens but parse differently. Each inner node therefore also
  // contributes its kind and extent, so equal fingerprints mean equal syntax trees.
  const tokens = [];
  const visit = current => {
    if (isJsDoc(current)) return;
    const children = current.getChildren(sourceFile);
    if (children.length === 0) {
      if (current.kind !== ts.SyntaxKind.EndOfFileToken) tokens.push(current.getText(sourceFile));
      return;
    }
    tokens.push(`(${current.kind}`);
    for (const child of children) visit(child);
    tokens.push(')');
  };
  visit(node);
  return tokens.join('\u0001');
}

/** The unit that owns a node: its outermost enclosing function, else its top-level statement. */
export function unitOf(node) {
  let outermostFunction = null;
  let topStatement = null;
  for (let current = node; current && !ts.isSourceFile(current); current = current.parent) {
    if (isFunctionLike(current)) outermostFunction = current;
    if (current.parent && ts.isSourceFile(current.parent)) topStatement = current;
  }
  return outermostFunction ?? topStatement;
}

/** Every unit in a file: outermost functions plus top-level statements. */
export function collectUnits(sourceFile) {
  const units = [];
  const visit = (node, insideFunction) => {
    if (!insideFunction && isFunctionLike(node)) {
      units.push(node);
      return;
    }
    ts.forEachChild(node, child => visit(child, insideFunction));
  };
  for (const statement of sourceFile.statements) {
    if (!isFunctionLike(statement)) units.push(statement);
    visit(statement, false);
  }
  return units;
}

export function unitName(unit, sourceFile) {
  const named = current =>
    current.name && (ts.isIdentifier(current.name) || ts.isStringLiteral(current.name))
      ? current.name.text
      : null;
  if (named(unit)) return named(unit);
  const parent = unit.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  // `const f = cache(async () => ...)`: the wrapped function carries the declared name.
  if (
    parent &&
    ts.isCallExpression(parent) &&
    parent.arguments.length === 1 &&
    ts.isVariableDeclaration(parent.parent) &&
    ts.isIdentifier(parent.parent.name)
  ) {
    return parent.parent.name.text;
  }
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name))
    return parent.name.text;
  if (ts.isVariableStatement(unit)) {
    return unit.declarationList.declarations
      .map(declaration => (ts.isIdentifier(declaration.name) ? declaration.name.text : '<pattern>'))
      .join(',');
  }
  const { line } = sourceFile.getLineAndCharacterOfPosition(unit.getStart(sourceFile));
  return `<${ts.SyntaxKind[unit.kind]}@${line + 1}>`;
}

/** How a reference is used: `f()` is a call, `x.y` a member read, `x[y]` computed, else a value. */
export function referenceForm(node) {
  let current = node;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent))
  ) {
    current = current.parent;
  }
  const parent = current.parent;
  if (!parent) return 'value';
  if (ts.isCallExpression(parent) && parent.expression === current) return 'call';
  if (ts.isTaggedTemplateExpression(parent) && parent.tag === current) return 'call';
  if (ts.isPropertyAccessExpression(parent) && parent.expression === current) return 'member';
  if (ts.isElementAccessExpression(parent) && parent.expression === current) return 'computed';
  if (ts.isExportSpecifier(parent)) return 'export';
  if (
    (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
    parent.tagName === current
  )
    return 'jsx';
  return 'value';
}

/** The argument expressions of a call or JSX element whose callee is `node`. */
export function callArguments(node) {
  let current = node;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent))
  ) {
    current = current.parent;
  }
  const parent = current.parent;
  if (ts.isCallExpression(parent)) return [...parent.arguments];
  if (ts.isTaggedTemplateExpression(parent)) return [parent.template];
  if (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) {
    const values = parent.attributes.properties.flatMap(property => {
      if (ts.isJsxSpreadAttribute(property)) return [property.expression];
      return property.initializer ? [property.initializer] : [];
    });
    if (ts.isJsxOpeningElement(parent)) values.push(...parent.parent.children);
    return values;
  }
  return [];
}

/** For `ns.name` returns the member name and the member's own usage form. */
export function memberUse(node) {
  let current = node;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent))
  ) {
    current = current.parent;
  }
  const access = current.parent;
  if (!access || !ts.isPropertyAccessExpression(access)) return null;
  return { name: access.name.text, node: access, form: referenceForm(access) };
}
