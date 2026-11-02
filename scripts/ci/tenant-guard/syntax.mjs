import ts from 'typescript';

// One createSourceFile pass per file: no type checker, no cross-file value flow. This module turns a
// file into the facts the tenant guard needs: units (the outermost function, or the top-level
// statement, that encloses a point), a normalized fingerprint per unit, and every identifier
// reference resolved to its lexical binding.

export function parseSource(file, text) {
  const kind = /\.[cm]?tsx$/u.test(file)
    ? ts.ScriptKind.TSX
    : /\.[cm]?jsx$/u.test(file)
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/u.test(file)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
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

export const isFunctionLike = node =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

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

// ---------------------------------------------------------------------------------------------
// Lexical scopes. Declarations are collected per scope before references are resolved, so hoisted
// functions and `var` resolve the way the runtime resolves them.

function bindingNames(name, out) {
  if (ts.isIdentifier(name)) out.push(name);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements)
      if (ts.isBindingElement(element)) bindingNames(element.name, out);
  }
  return out;
}

const createsScope = node =>
  ts.isSourceFile(node) ||
  isFunctionLike(node) ||
  ts.isBlock(node) ||
  ts.isForStatement(node) ||
  ts.isForInStatement(node) ||
  ts.isForOfStatement(node) ||
  ts.isCatchClause(node) ||
  ts.isClassLike(node) ||
  ts.isCaseBlock(node) ||
  ts.isModuleBlock(node);

function functionScopeOf(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionLike(current) || ts.isSourceFile(current) || ts.isModuleBlock(current))
      return current;
  }
  return null;
}

function blockScopeOf(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (createsScope(current)) return current;
  }
  return null;
}

/** True for identifiers in type-only positions, which never execute. */
function inTypePosition(node) {
  for (let current = node; current; current = current.parent) {
    const parent = current.parent;
    if (!parent) return false;
    if (ts.isTypeNode(current) && !ts.isExpressionWithTypeArguments(current)) return true;
    if (
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      (ts.isImportDeclaration(parent) && parent.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(parent) && parent.isTypeOnly)
    ) {
      return true;
    }
    if (ts.isExpressionWithTypeArguments(current) && ts.isHeritageClause(parent)) {
      return (
        parent.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(parent.parent)
      );
    }
    if (ts.isStatement(parent) || isFunctionLike(parent)) return false;
  }
  return false;
}

/** Identifiers that name a declaration, a property key or a label rather than reading a binding. */
function isNonReference(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  if (ts.isBindingElement(parent) && parent.propertyName === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isClassExpression(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isModuleDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  if (ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isImportSpecifier(parent))
    return true;
  if (ts.isImportEqualsDeclaration(parent) && parent.name === node) return true;
  if (ts.isExportSpecifier(parent)) {
    // `export { local as name }` without a module specifier reads `local`.
    const declaration = parent.parent.parent;
    if (declaration.moduleSpecifier) return true;
    return (parent.propertyName ?? parent.name) !== node;
  }
  if (ts.isNamespaceExport(parent)) return true;
  if (
    (ts.isLabeledStatement(parent) ||
      ts.isBreakStatement(parent) ||
      ts.isContinueStatement(parent)) &&
    parent.label === node
  ) {
    return true;
  }
  if (ts.isJsxAttribute(parent) && parent.name === node) return true;
  if (ts.isMetaProperty(parent)) return true;
  if (ts.isCatchClause(parent)) return true;
  return false;
}

/**
 * Resolves identifier references to lexical bindings. Returns
 *   { bindings: Map<declName node, Binding>, references: Array<{ node, binding|null }> }
 * where Binding = { kind: 'import'|'param'|'var'|'function'|'class'|'catch'|'enum', scope, name, decl }.
 */
export function analyzeScopes(sourceFile) {
  const scopes = new Map();
  const scopeFor = node => {
    let scope = scopes.get(node);
    if (!scope) {
      scope = new Map();
      scopes.set(node, scope);
    }
    return scope;
  };
  const declare = (scopeNode, identifier, binding) => {
    if (!scopeNode) return;
    scopeFor(scopeNode).set(identifier.text, {
      ...binding,
      scope: scopeNode,
      name: identifier.text,
      id: identifier,
    });
  };

  const collect = node => {
    if (ts.isImportDeclaration(node) && node.importClause && !node.importClause.isTypeOnly) {
      const clause = node.importClause;
      const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
      if (clause.name)
        declare(sourceFile, clause.name, {
          kind: 'import',
          specifier,
          imported: 'default',
          decl: node,
        });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        declare(sourceFile, bindings.name, {
          kind: 'import',
          specifier,
          imported: '*',
          decl: node,
        });
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          declare(sourceFile, element.name, {
            kind: 'import',
            specifier,
            imported: (element.propertyName ?? element.name).text,
            decl: node,
          });
        }
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      const specifier =
        ts.isExternalModuleReference(reference) && ts.isStringLiteral(reference.expression)
          ? reference.expression.text
          : null;
      declare(sourceFile, node.name, { kind: 'import', specifier, imported: '*', decl: node });
    } else if (ts.isVariableDeclaration(node)) {
      const list = node.parent;
      const isVar = ts.isVariableDeclarationList(list) && !(list.flags & ts.NodeFlags.BlockScoped);
      const loop =
        list.parent &&
        (ts.isForStatement(list.parent) ||
          ts.isForInStatement(list.parent) ||
          ts.isForOfStatement(list.parent));
      const scopeNode = isVar
        ? functionScopeOf(node)
        : loop
          ? list.parent
          : blockScopeOf(list.parent ?? node);
      for (const identifier of bindingNames(node.name, [])) {
        declare(scopeNode, identifier, { kind: 'var', decl: node });
      }
    } else if (ts.isParameter(node)) {
      for (const identifier of bindingNames(node.name, [])) {
        declare(node.parent, identifier, { kind: 'param', decl: node.parent });
      }
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      declare(blockScopeOf(node), node.name, { kind: 'function', decl: node });
    } else if (ts.isFunctionExpression(node) && node.name) {
      declare(node, node.name, { kind: 'function', decl: node });
    } else if (ts.isClassDeclaration(node) && node.name) {
      declare(blockScopeOf(node), node.name, { kind: 'class', decl: node });
    } else if (ts.isClassExpression(node) && node.name) {
      declare(node, node.name, { kind: 'class', decl: node });
    } else if (ts.isEnumDeclaration(node)) {
      declare(blockScopeOf(node), node.name, { kind: 'enum', decl: node });
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      for (const identifier of bindingNames(node.variableDeclaration.name, [])) {
        declare(node, identifier, { kind: 'catch', decl: node });
      }
      // The catch variable itself is handled here, not as a VariableDeclaration.
      if (node.block) ts.forEachChild(node.block, collect);
      return;
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);

  const lookup = node => {
    for (let current = node.parent; current; current = current.parent) {
      const scope = scopes.get(current);
      const binding = scope?.get(node.text);
      if (binding) return binding;
    }
    return null;
  };

  const references = [];
  const visit = node => {
    if (ts.isIdentifier(node)) {
      if (!isNonReference(node) && !inTypePosition(node))
        references.push({ node, binding: lookup(node) });
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      references.push({ node: node.name, binding: lookup(node.name) });
      if (node.objectAssignmentInitializer) visit(node.objectAssignmentInitializer);
      return;
    }
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { references, lookup };
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
    const values = parent.attributes.properties.flatMap(property =>
      ts.isJsxSpreadAttribute(property)
        ? [property.expression]
        : property.initializer
          ? [property.initializer]
          : []
    );
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
