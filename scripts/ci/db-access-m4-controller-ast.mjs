// Private finite runtime-AST grammar for the M4 controller premise, not a JS analyzer.
import ts from 'typescript';

export const reject = reason => {
  throw new Error('m4 controller source rejected: ' + reason);
};
const need = (condition, reason) => {
  if (!condition) reject(reason);
};
const GLOBALS = new Set([
  'undefined',
  'Error',
  'Date',
  'Number',
  'JSON',
  'Object',
  'Array',
  'TextEncoder',
  'Set',
]);
const nameOf = node => {
  need(ts.isIdentifier(node) || ts.isStringLiteral(node), 'computed or unsupported property');
  return node.text;
};

function sqlText(text) {
  let quote = null,
    result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      result += char;
      if (char === quote) {
        if (text[i + 1] === quote) result += text[++i];
        else quote = null;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else if (/\s/u.test(char)) {
      if (!result.endsWith(' ')) result += ' ';
    } else result += char;
  }
  need(!quote, 'SQL quote cannot cross an interpolated boundary');
  return result.trim();
}

export function readRuntimeModule(text, file) {
  need(typeof text === 'string', 'source must be text');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  need(source.parseDiagnostics.length === 0, 'malformed TypeScript');
  const imports = [],
    functions = new Map(),
    constants = new Map(),
    names = new Map();
  function reserve(name, value) {
    need(!names.has(name) && !GLOBALS.has(name), 'duplicate or shadowed module binding');
    names.set(name, value);
  }
  for (const node of source.statements) {
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) continue;
    if (ts.isImportDeclaration(node)) {
      need(
        ts.isStringLiteral(node.moduleSpecifier) && node.importClause && !node.attributes,
        'unsupported or side-effect import'
      );
      const clause = node.importClause,
        module = node.moduleSpecifier.text;
      need(!clause.name && clause.namedBindings, 'default import');
      const bindings = ts.isNamespaceImport(clause.namedBindings)
        ? [
            {
              name: clause.namedBindings.name,
              imported: '*',
              type: clause.isTypeOnly,
            },
          ]
        : clause.namedBindings.elements.map(part => ({
            name: part.name,
            imported: (part.propertyName ?? part.name).text,
            type: clause.isTypeOnly || part.isTypeOnly,
          }));
      for (const part of bindings) {
        const identity = module + '#' + part.imported;
        imports.push([identity, Boolean(part.type)]);
        reserve(part.name.text, part.type ? 'erased:' + identity : 'import:' + identity);
      }
      continue;
    }
    if (ts.isFunctionDeclaration(node)) {
      need(
        node.name &&
          node.body &&
          !node.asteriskToken &&
          (node.modifiers ?? []).every(m =>
            [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.AsyncKeyword].includes(m.kind)
          ),
        'unsupported function declaration'
      );
      reserve(node.name.text, 'function:' + node.name.text);
      functions.set(node.name.text, node);
      continue;
    }
    if (ts.isVariableStatement(node)) {
      need(
        !node.modifiers?.length && node.declarationList.flags === ts.NodeFlags.Const,
        'module variables must be private constants'
      );
      for (const declaration of node.declarationList.declarations) {
        need(
          ts.isIdentifier(declaration.name) && declaration.initializer,
          'module constant binding'
        );
        reserve(declaration.name.text, 'constant:' + declaration.name.text);
        constants.set(declaration.name.text, declaration.initializer);
      }
      continue;
    }
    reject('unaccounted module execution');
  }
  return {
    source,
    imports: imports.sort((a, b) =>
      JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0
    ),
    functions,
    constants,
    names,
  };
}

export function runtimeTree(node, module, functionNode = false, observed = new WeakMap()) {
  const names = new Map(module.names),
    locals = new Map();
  function bind(pattern) {
    if (ts.isIdentifier(pattern)) {
      need(!names.has(pattern.text) && !GLOBALS.has(pattern.text), 'shadowed/redeclared local');
      const identity = 'local:' + locals.size;
      names.set(pattern.text, identity);
      locals.set(pattern.text, identity);
      return;
    }
    need(
      ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern),
      'unsupported binding'
    );
    for (const part of pattern.elements) {
      need(
        ts.isBindingElement(part) && !part.dotDotDotToken && !part.initializer,
        'rest/default/omitted binding'
      );
      bind(part.name);
    }
  }
  function collect(current) {
    if (ts.isParameter(current)) {
      need(
        !current.initializer && !current.dotDotDotToken && !current.modifiers?.length,
        'parameter effects'
      );
      bind(current.name);
    } else if (ts.isVariableDeclaration(current)) bind(current.name);
    else if (ts.isFunctionExpression(current) && current.name) bind(current.name);
    ts.forEachChild(current, collect);
  }
  if (functionNode) collect(node);
  function tree(n) {
    const value = build(n);
    if (n) observed.set(n, value);
    return value;
  }
  function build(n) {
    if (!n) return null;
    if (ts.isIdentifier(n)) {
      const resolved = names.get(n.text) ?? (GLOBALS.has(n.text) ? 'global:' + n.text : null);
      need(
        resolved && !resolved.startsWith('erased:'),
        'unbound or erased runtime reference ' + n.text
      );
      return ['ref', resolved];
    }
    if (
      ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isTypeAssertionExpression(n) ||
      ts.isNonNullExpression(n)
    )
      return tree(n.expression);
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
    if (ts.isPropertyAccessExpression(n)) {
      need(!n.questionDotToken, 'optional access');
      return ['property', tree(n.expression), n.name.text];
    }
    if (ts.isElementAccessExpression(n))
      return ['element', tree(n.expression), tree(n.argumentExpression)];
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      need(!n.questionDotToken, 'optional call');
      return [
        ts.isNewExpression(n) ? 'new' : 'call',
        tree(n.expression),
        (n.arguments ?? []).map(tree),
      ];
    }
    if (ts.isTaggedTemplateExpression(n)) {
      const template = n.template;
      return [
        'tag',
        tree(n.tag),
        ts.isNoSubstitutionTemplateLiteral(template)
          ? [sqlText(template.text)]
          : [
              sqlText(template.head.text),
              ...template.templateSpans.map(span => [
                tree(span.expression),
                sqlText(span.literal.text),
              ]),
            ],
      ];
    }
    if (ts.isArrayLiteralExpression(n)) return ['array', n.elements.map(tree)];
    if (ts.isObjectLiteralExpression(n)) return ['object', n.properties.map(tree)];
    if (ts.isPropertyAssignment(n)) return ['field', nameOf(n.name), tree(n.initializer)];
    if (ts.isShorthandPropertyAssignment(n)) {
      need(!n.objectAssignmentInitializer, 'shorthand default');
      return ['field', n.name.text, tree(n.name)];
    }
    if (ts.isSpreadAssignment(n)) return ['spread', tree(n.expression)];
    if (ts.isBinaryExpression(n))
      return ['binary', ts.SyntaxKind[n.operatorToken.kind], tree(n.left), tree(n.right)];
    if (ts.isPrefixUnaryExpression(n)) return ['unary', ts.SyntaxKind[n.operator], tree(n.operand)];
    if (ts.isTypeOfExpression(n) || ts.isAwaitExpression(n))
      return [ts.SyntaxKind[n.kind], tree(n.expression)];
    if (ts.isConditionalExpression(n))
      return ['conditional', tree(n.condition), tree(n.whenTrue), tree(n.whenFalse)];
    if (ts.isBlock(n)) return ['block', n.statements.map(tree)];
    if (ts.isReturnStatement(n) || ts.isThrowStatement(n) || ts.isExpressionStatement(n))
      return [ts.SyntaxKind[n.kind], tree(n.expression)];
    if (ts.isIfStatement(n))
      return ['if', tree(n.expression), tree(n.thenStatement), tree(n.elseStatement)];
    if (ts.isTryStatement(n))
      return ['try', tree(n.tryBlock), tree(n.catchClause), tree(n.finallyBlock)];
    if (ts.isCatchClause(n)) return ['catch', tree(n.variableDeclaration), tree(n.block)];
    if (ts.isVariableStatement(n)) {
      need(!n.modifiers?.length, 'variable modifier');
      return ['variables', n.declarationList.flags, n.declarationList.declarations.map(tree)];
    }
    if (ts.isVariableDeclaration(n)) return ['declare', tree(n.name), tree(n.initializer)];
    if (ts.isObjectBindingPattern(n))
      return [
        'object-binding',
        n.elements.map(part => [
          'binding',
          nameOf(part.propertyName ?? part.name),
          tree(part.name),
        ]),
      ];
    if (ts.isArrayBindingPattern(n))
      return ['array-binding', n.elements.map(part => tree(part.name))];
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      need(
        !n.asteriskToken &&
          (n.modifiers ?? []).every(m =>
            [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.AsyncKeyword].includes(m.kind)
          ),
        'function modifiers'
      );
      return [
        'function',
        Boolean(n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)),
        Boolean(n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)),
        ts.isFunctionExpression(n) ? tree(n.name) : null,
        n.parameters.map(p => tree(p.name)),
        tree(n.body),
      ];
    }
    reject('unsupported runtime syntax ' + ts.SyntaxKind[n.kind]);
  }
  return tree(node);
}
