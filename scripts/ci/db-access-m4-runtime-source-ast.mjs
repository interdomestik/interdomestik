// Closed bootstrap/posture adapter. The existing notification grammar is unchanged.
import ts from 'typescript';
import { notificationModule, sourceClause } from './db-access-m4-notification-ast.mjs';
import { canon } from './db-access-m4-syntax.mjs';
export const reject = reason => {
  throw Error('m4 private runtime source rejected: ' + reason);
};
const need = (value, reason) => {
  if (!value) reject(reason);
};
export function parse(text, file) {
  need(typeof text === 'string', 'source text required: ' + file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  need(source.parseDiagnostics.length === 0, 'malformed TypeScript: ' + file);
  return source;
}
export function runtimeModule(text, file) {
  const source = parse(text, file),
    exports = [],
    taggedLiteralTokens = [];
  function tagged(node) {
    if (ts.isTaggedTemplateExpression(node)) {
      const template = node.template;
      taggedLiteralTokens.push(
        ts.isTemplateExpression(template)
          ? [
              template.head.getText(source),
              ...template.templateSpans.map(span => span.literal.getText(source)),
            ]
          : [template.getText(source)]
      );
    }
    ts.forEachChild(node, tagged);
  }
  tagged(source);
  let erased = text;
  for (const node of [...source.statements].reverse()) {
    if (!ts.isExportDeclaration(node)) continue;
    need(
      node.isTypeOnly &&
        !node.exportClause &&
        !node.attributes &&
        !node.modifiers?.length &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier),
      'only erased export-type-star is supported'
    );
    exports.unshift(['export-type-star', node.moduleSpecifier.text]);
    const start = node.getStart(source),
      end = node.getEnd();
    // Retain every original source offset and line. No executable syntax is removed.
    erased =
      erased.slice(0, start) +
      erased.slice(start, end).replace(/[^\r\n]/gu, ' ') +
      erased.slice(end);
  }
  const module = notificationModule(erased, file);
  return { ...module, typeExports: exports, taggedLiteralTokens };
}
export function typeModule(text, file) {
  const source = parse(text, file);
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node))
      need(
        node.importClause?.isTypeOnly && !node.attributes,
        'type module runtime import: ' + file
      );
    else
      need(
        ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node),
        'type module executable statement: ' + file
      );
  }
  // Keep the complete reviewed type structure, import names/paths and public signatures.
  return { tree: canon(source), runtimeEffects: [] };
}
export function clauses(module, entries) {
  const facts = entries.map(([name, selector]) => {
    const expected = sourceClause(module.expected, name, selector);
    const tree = JSON.stringify(expected.tree);
    return sourceClause(
      module,
      name,
      node =>
        module.observed.has(node) &&
        ts.SyntaxKind[node.kind] === expected.kind &&
        JSON.stringify(module.observed.get(node)) === tree
    );
  });
  need(
    facts.every((fact, index) => !index || fact.start > facts[index - 1].start),
    'ordered runtime clauses'
  );
  return facts;
}
export const variable = name => node =>
  ts.isVariableDeclaration(node) && node.initializer && node.name.getText() === name;
export const fn = name => node => ts.isFunctionDeclaration(node) && node.name?.text === name;
export const statement = text => node => ts.isExpressionStatement(node) && node.getText() === text;
export const guard = text => node =>
  ts.isIfStatement(node) && node.expression.getText().includes(text);
