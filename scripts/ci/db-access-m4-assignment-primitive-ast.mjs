// Fixed primitive syntax checks; data-only derivation, no receiver or admission authority.
import ts from 'typescript';
export const fail = reason => {
  throw Error('M4 assignment primitive refused: ' + reason);
};
function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text),
    rows = [];
  for (let k; (k = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken;)
    rows.push([
      k,
      k === ts.SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText(),
    ]);
  return JSON.stringify(rows);
}
export const same = (a, b, label) => {
  if (tokens(a) !== tokens(b)) fail(label);
};
export function named(unit, name) {
  const found = [];
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name)
      found.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(unit);
  if (found.length !== 1) fail('unique ' + name);
  return found[0];
}
export function parameters(node, unit, expected, label) {
  if (!node.parameters) fail(label + ' parameters');
  same(
    '(' + node.parameters.map(value => value.getText(unit)).join(',') + ')',
    expected,
    label + ' parameters'
  );
}
export function sqlTemplate(node, unit, tag, expressions, parts) {
  if (
    !ts.isTaggedTemplateExpression(node) ||
    node.tag.getText(unit) !== tag ||
    !ts.isTemplateExpression(node.template)
  )
    fail('SQL template');
  const spans = node.template.templateSpans;
  if (node.template.head.text !== parts[0] || spans.length !== expressions.length)
    fail('SQL template arity');
  spans.forEach((span, i) => {
    same(span.expression.getText(unit), expressions[i], 'SQL operand');
    if (span.literal.text !== parts[i + 1]) fail('SQL operator');
  });
}
export function columns(unit, name, tableName, expected) {
  const node = named(unit, name);
  if (
    !ts.isCallExpression(node) ||
    node.expression.getText(unit) !== 'pgTable' ||
    !node.arguments[0] ||
    !ts.isStringLiteral(node.arguments[0]) ||
    node.arguments[0].text !== tableName ||
    !ts.isObjectLiteralExpression(node.arguments[1])
  )
    fail('table ' + name);
  for (const [key, column] of Object.entries(expected)) {
    const fields = node.arguments[1].properties.filter(field => field.name?.getText(unit) === key);
    if (fields.length !== 1 || !ts.isPropertyAssignment(fields[0])) fail('column ' + key);
    let value = fields[0].initializer;
    while (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression))
      value = value.expression.expression;
    if (
      !ts.isCallExpression(value) ||
      !['text', 'timestamp', 'jsonb'].includes(value.expression.getText(unit)) ||
      !value.arguments[0] ||
      !ts.isStringLiteral(value.arguments[0]) ||
      value.arguments[0].text !== column
    )
      fail('column mapping ' + key);
  }
  return { table: tableName, columns: expected };
}
