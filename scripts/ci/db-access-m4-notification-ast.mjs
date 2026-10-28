// Private closed grammar for exactly the two fixed notification modules, not a JS analyzer.
import ts from 'typescript';

export const reject = reason => {
  throw Error('m4 notification source rejected: ' + reason);
};
const need = (value, reason) => {
  if (!value) reject(reason);
};
const modifiers = n => (n.modifiers ?? []).map(x => ts.SyntaxKind[x.kind]);
export function notificationModule(text, file) {
  need(typeof text === 'string', 'text required');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  need(source.parseDiagnostics.length === 0, 'malformed TypeScript');
  const observed = new WeakMap();
  function tree(n) {
    const value = build(n);
    if (n) observed.set(n, value);
    return value;
  }
  function build(n) {
    if (!n) return null;
    if (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return null;
    if (ts.isParenthesizedExpression(n)) return ['parenthesized', tree(n.expression)];
    if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) || ts.isNonNullExpression(n))
      return tree(n.expression);
    if (ts.isIdentifier(n)) return ['identifier', n.text];
    if (
      ts.isStringLiteral(n) ||
      ts.isNumericLiteral(n) ||
      ts.isRegularExpressionLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n)
    )
      return [ts.SyntaxKind[n.kind], n.text];
    if (
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
        n.kind
      )
    )
      return [ts.SyntaxKind[n.kind]];
    if (ts.isSourceFile(n)) return ['module', n.statements.map(tree).filter(x => x !== null)];
    if (ts.isImportDeclaration(n)) {
      need(
        ts.isStringLiteral(n.moduleSpecifier) && n.importClause && !n.attributes,
        'side-effect/import attributes'
      );
      const c = n.importClause,
        b = c.namedBindings;
      return [
        'import',
        n.moduleSpecifier.text,
        Boolean(c.isTypeOnly),
        c.name?.text ?? null,
        !b
          ? null
          : ts.isNamespaceImport(b)
            ? ['namespace', b.name.text]
            : b.elements.map(x => [
                Boolean(x.isTypeOnly),
                (x.propertyName ?? x.name).text,
                x.name.text,
              ]),
      ];
    }
    if (ts.isVariableStatement(n)) return ['variables', modifiers(n), tree(n.declarationList)];
    if (ts.isVariableDeclarationList(n)) return ['declarations', n.flags, n.declarations.map(tree)];
    if (ts.isVariableDeclaration(n)) return ['binding', tree(n.name), tree(n.initializer)];
    if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))
      return [ts.SyntaxKind[n.kind], n.elements.map(tree)];
    if (ts.isBindingElement(n))
      return [
        'binding-element',
        Boolean(n.dotDotDotToken),
        tree(n.propertyName),
        tree(n.name),
        tree(n.initializer),
      ];
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n)
    ) {
      need(n.body && !n.asteriskToken, 'body required; generator unsupported');
      return [
        ts.SyntaxKind[n.kind],
        modifiers(n),
        tree(n.name),
        n.parameters.map(tree),
        tree(n.body),
      ];
    }
    if (ts.isParameter(n))
      return [
        'parameter',
        modifiers(n),
        Boolean(n.dotDotDotToken),
        tree(n.name),
        tree(n.initializer),
      ];
    if (ts.isBlock(n)) return ['block', n.statements.map(tree).filter(x => x !== null)];
    if (ts.isReturnStatement(n)) return ['return', tree(n.expression)];
    if (ts.isExpressionStatement(n)) return ['expression', tree(n.expression)];
    if (ts.isIfStatement(n))
      return ['if', tree(n.expression), tree(n.thenStatement), tree(n.elseStatement)];
    if (ts.isTryStatement(n))
      return ['try', tree(n.tryBlock), tree(n.catchClause), tree(n.finallyBlock)];
    if (ts.isCatchClause(n)) return ['catch', tree(n.variableDeclaration), tree(n.block)];
    if (ts.isThrowStatement(n)) return ['throw', tree(n.expression)];
    if (ts.isForOfStatement(n))
      return [
        'for-of',
        Boolean(n.awaitModifier),
        tree(n.initializer),
        tree(n.expression),
        tree(n.statement),
      ];
    if (ts.isAwaitExpression(n) || ts.isVoidExpression(n) || ts.isTypeOfExpression(n))
      return [ts.SyntaxKind[n.kind], tree(n.expression)];
    if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
      return [ts.SyntaxKind[n.kind], ts.SyntaxKind[n.operator], tree(n.operand)];
    if (ts.isBinaryExpression(n))
      return ['binary', ts.SyntaxKind[n.operatorToken.kind], tree(n.left), tree(n.right)];
    if (ts.isConditionalExpression(n))
      return ['conditional', tree(n.condition), tree(n.whenTrue), tree(n.whenFalse)];
    if (ts.isPropertyAccessExpression(n))
      return [
        'property',
        ts.isOptionalChain(n),
        Boolean(n.questionDotToken),
        tree(n.expression),
        tree(n.name),
      ];
    if (ts.isElementAccessExpression(n))
      return [
        'element',
        ts.isOptionalChain(n),
        Boolean(n.questionDotToken),
        tree(n.expression),
        tree(n.argumentExpression),
      ];
    if (ts.isCallExpression(n) || ts.isNewExpression(n))
      return [
        ts.SyntaxKind[n.kind],
        ts.isOptionalChain(n),
        Boolean(n.questionDotToken),
        tree(n.expression),
        (n.arguments ?? []).map(tree),
      ];
    if (ts.isTaggedTemplateExpression(n)) return ['tag', tree(n.tag), tree(n.template)];
    if (ts.isTemplateExpression(n))
      return [
        'template',
        n.head.text,
        n.templateSpans.map(x => [tree(x.expression), x.literal.text]),
      ];
    if (ts.isArrayLiteralExpression(n)) return ['array', n.elements.map(tree)];
    if (ts.isObjectLiteralExpression(n)) return ['object', n.properties.map(tree)];
    if (ts.isPropertyAssignment(n)) return ['field', tree(n.name), tree(n.initializer)];
    if (ts.isShorthandPropertyAssignment(n))
      return ['short-field', tree(n.name), tree(n.objectAssignmentInitializer)];
    if (ts.isSpreadElement(n) || ts.isSpreadAssignment(n))
      return [ts.SyntaxKind[n.kind], tree(n.expression)];
    reject('unsupported runtime syntax ' + ts.SyntaxKind[n.kind]);
  }
  const runtimeTree = tree(source);
  return { source, runtimeTree, observed };
}

export function sourceClause(module, name, predicate) {
  const matches = [];
  function visit(n) {
    if (predicate(n, module.source)) matches.push(n);
    ts.forEachChild(n, visit);
  }
  visit(module.source);
  need(matches.length === 1, 'unique clause ' + name);
  const node = matches[0],
    start = node.getStart(module.source),
    end = node.getEnd();
  need(module.observed.has(node), 'runtime clause ' + name);
  return {
    name,
    start,
    end,
    line: module.source.getLineAndCharacterOfPosition(start).line + 1,
    kind: ts.SyntaxKind[node.kind],
    tree: module.observed.get(node),
  };
}
