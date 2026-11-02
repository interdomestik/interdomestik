import ts from 'typescript';

export const isFunctionLike = node =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

// ---------------------------------------------------------------------------------------------
// Lexical scopes. Declarations are collected per scope before references are resolved, so hoisted
// functions and `var` resolve the way the runtime resolves them.

export function bindingNames(name, out) {
  if (ts.isIdentifier(name)) out.push(name);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements)
      if (ts.isBindingElement(element)) bindingNames(element.name, out);
  }
  return out;
}

export const createsScope = node =>
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

export function functionScopeOf(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionLike(current) || ts.isSourceFile(current) || ts.isModuleBlock(current))
      return current;
  }
  return null;
}

export function blockScopeOf(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (createsScope(current)) return current;
  }
  return null;
}

/** True for identifiers in type-only positions, which never execute. */
export function inTypePosition(node) {
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
export function isNonReference(node) {
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
      const isVar =
        ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.BlockScoped) === 0;
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
