import ts from 'typescript';
import { hasFlag } from './rules-digest.mjs';

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

// Parents whose identifiers never read a binding: import names, `export * as ns`, `import.meta`,
// and a catch clause's own (its variable is a declaration).
const NEVER_READS = [
  ts.isImportClause,
  ts.isNamespaceImport,
  ts.isImportSpecifier,
  ts.isNamespaceExport,
  ts.isMetaProperty,
  ts.isCatchClause,
];
// Parents whose `name` declares or keys something rather than reading a binding.
const NAMES_DECLARATION = [
  ts.isPropertyAccessExpression,
  ts.isPropertyAssignment,
  ts.isPropertyDeclaration,
  ts.isPropertySignature,
  ts.isMethodDeclaration,
  ts.isMethodSignature,
  ts.isGetAccessorDeclaration,
  ts.isSetAccessorDeclaration,
  ts.isEnumMember,
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isFunctionDeclaration,
  ts.isFunctionExpression,
  ts.isClassDeclaration,
  ts.isClassExpression,
  ts.isEnumDeclaration,
  ts.isModuleDeclaration,
  ts.isTypeParameterDeclaration,
  ts.isImportEqualsDeclaration,
  ts.isJsxAttribute,
];
const LABELLED = [ts.isLabeledStatement, ts.isBreakStatement, ts.isContinueStatement];

/** Identifiers that name a declaration, a property key or a label rather than reading a binding. */
export function isNonReference(node) {
  const parent = node.parent;
  if (!parent) return true;
  if (NEVER_READS.some(is => is(parent))) return true;
  if (NAMES_DECLARATION.some(is => is(parent))) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node || parent.name === node;
  if (LABELLED.some(is => is(parent))) return parent.label === node;
  if (ts.isExportSpecifier(parent)) {
    // `export { local as name }` without a module specifier reads `local`.
    const declaration = parent.parent.parent;
    if (declaration.moduleSpecifier) return true;
    return (parent.propertyName ?? parent.name) !== node;
  }
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
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      for (const identifier of bindingNames(node.variableDeclaration.name, [])) {
        declare(node, identifier, { kind: 'catch', decl: node });
      }
      // The catch variable itself is handled here, not as a VariableDeclaration.
      if (node.block) ts.forEachChild(node.block, collect);
      return;
    }
    declareNode(declare, sourceFile, node);
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

// Named function, class and enum declarations: [test, kind, declared in the enclosing block].
const NAMED_BINDINGS = [
  [ts.isFunctionDeclaration, 'function', true],
  [ts.isFunctionExpression, 'function', false],
  [ts.isClassDeclaration, 'class', true],
  [ts.isClassExpression, 'class', false],
  [ts.isEnumDeclaration, 'enum', true],
];

/** Declares the bindings `node` itself introduces (other than a catch variable). */
function declareNode(declare, sourceFile, node) {
  if (ts.isImportDeclaration(node)) {
    if (node.importClause && !node.importClause.isTypeOnly)
      declareImport(declare, sourceFile, node);
  } else if (ts.isImportEqualsDeclaration(node)) {
    declareImportEquals(declare, sourceFile, node);
  } else if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    declareNames(declare, node);
  } else {
    const named = NAMED_BINDINGS.find(([is]) => is(node));
    if (named && node.name) {
      const [, kind, inBlock] = named;
      declare(inBlock ? blockScopeOf(node) : node, node.name, { kind, decl: node });
    }
  }
}

function declareImportEquals(declare, sourceFile, node) {
  const reference = node.moduleReference;
  const specifier =
    ts.isExternalModuleReference(reference) && ts.isStringLiteral(reference.expression)
      ? reference.expression.text
      : null;
  declare(sourceFile, node.name, { kind: 'import', specifier, imported: '*', decl: node });
}

/** The names a variable declaration or a parameter binds. */
function declareNames(declare, node) {
  const [scopeNode, binding] = ts.isParameter(node)
    ? [node.parent, { kind: 'param', decl: node.parent }]
    : [variableScopeOf(node), { kind: 'var', decl: node }];
  for (const identifier of bindingNames(node.name, [])) declare(scopeNode, identifier, binding);
}

function declareImport(declare, sourceFile, node) {
  const clause = node.importClause;
  const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
  const imported = (name, from) =>
    declare(sourceFile, name, { kind: 'import', specifier, imported: from, decl: node });
  if (clause.name) imported(clause.name, 'default');
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    imported(bindings.name, '*');
  } else if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) imported(element.name, (element.propertyName ?? element.name).text);
    }
  }
}

/** `var` is function-scoped; `let`/`const` belong to their loop, else their block. */
function variableScopeOf(node) {
  const list = node.parent;
  const isVar = ts.isVariableDeclarationList(list) && !hasFlag(list, ts.NodeFlags.BlockScoped);
  if (isVar) return functionScopeOf(node);
  const loop =
    list.parent &&
    (ts.isForStatement(list.parent) ||
      ts.isForInStatement(list.parent) ||
      ts.isForOfStatement(list.parent));
  return loop ? list.parent : blockScopeOf(list.parent ?? node);
}
