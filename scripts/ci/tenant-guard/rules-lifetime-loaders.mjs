// Tenant guard stage helper (L): module loaders that could reach a transaction entry unseen.
//
// The lifetime analysis follows a transaction entry only through static imports. Outside the
// kernel, every other way to obtain a module is refused unless its target is a literal that the
// module graph resolves: indirect or computed requires and imports, the module loader package,
// loader members (`require`, `mainModule`, `getBuiltinModule`) under any receiver or binding key,
// computed member access on the global loader receivers, import-equals declarations and
// eval-like or bundler loader globals.

import ts from 'typescript';

const LOADER_MODULES = new Set(['module', 'node:module']);
const LOADER_MEMBERS = new Set(['getBuiltinModule', 'mainModule', 'require']);
const LOADER_RECEIVERS = new Set(['global', 'globalThis', 'module', 'process', 'require']);
// Globals that evaluate code or load a module by a name computed at runtime.
const GLOBAL_LOADERS = new Set([
  'eval',
  'Function',
  '__non_webpack_require__',
  '__webpack_require__',
]);

/** Builds `{ loaderProblem(fact, node), loadsEntryModule(fact, call) }` over `ctx`. */
export function createLoaderChecks(ctx, entryModule) {
  const { graph, referenceAt, unwrap } = ctx;
  const unbound = (fact, node) =>
    ts.isIdentifier(node) && referenceAt(fact, node) && !referenceAt(fact, node).binding;
  const isRequire = (fact, node) => node.text === 'require' && unbound(fact, node);

  /** Why `node` reaches a module loader other than a direct `import()` / `require()` call with a
   * literal specifier, or null. */
  function loaderProblem(fact, node) {
    if (ts.isIdentifier(node) && isRequire(fact, node)) {
      const value = ctx.outermost(node);
      if (!(ts.isCallExpression(value.parent) && value.parent.expression === value))
        return 'an indirect require';
    }
    if (ts.isIdentifier(node) && GLOBAL_LOADERS.has(node.text) && referenceAt(fact, node))
      return `an eval-like global or bundler loader (${node.text})`;
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      return 'a CommonJS import (import = require)';
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : null;
    if (specifier && ts.isStringLiteralLike(specifier) && LOADER_MODULES.has(specifier.text))
      return 'an import of the module loader';
    if (ts.isCallExpression(node) && dynamicLoad(fact, node)) {
      if (!literalSpecifier(node) && !dataSpecifier(node))
        return 'a dynamic import with a computed specifier';
      if (literalSpecifier(node) && LOADER_MODULES.has(node.arguments[0].text))
        return 'a dynamic import of the module loader';
    }
    return memberProblem(fact, node);
  }

  /** A loader member read under any name form, or a computed member of a loader receiver. */
  function memberProblem(fact, node) {
    const name = staticMemberName(node);
    if (typeof name === 'string' && LOADER_MEMBERS.has(name))
      return `a module loader member (${name})`;
    if (name === null) {
      const receiver = unwrap(node.expression);
      if (
        ts.isMetaProperty(receiver) ||
        (LOADER_RECEIVERS.has(receiver.text) && unbound(fact, receiver))
      )
        return 'a computed member of a module loader receiver';
    }
    return undefined;
  }

  const dynamicLoad = (fact, call) => {
    const callee = unwrap(call.expression);
    return (
      callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && isRequire(fact, callee))
    );
  };

  /** A dynamic `import()` / `require()` of a module exporting a transaction entry. */
  function loadsEntryModule(fact, call) {
    if (!dynamicLoad(fact, call) || !literalSpecifier(call)) return false;
    return graph.resolveSpecifier(fact.file, call.arguments[0].text).files.some(entryModule);
  }

  return { loaderProblem: (fact, node) => loaderProblem(fact, node) ?? null, loadsEntryModule };
}

const literalSpecifier = call =>
  call.arguments.length > 0 && ts.isStringLiteralLike(call.arguments[0]);

/** A data template such as `../messages/${locale}/${name}.json`: a static relative prefix and a
 * `.json` suffix, so the bundler's context holds JSON modules only. */
function dataSpecifier(call) {
  const [specifier] = call.arguments;
  if (call.arguments.length !== 1 || !ts.isTemplateExpression(specifier)) return false;
  const tail = specifier.templateSpans.at(-1).literal.text;
  return /^(?:\.{1,2}|@)\/[\w./-]+\//u.test(specifier.head.text) && /\.json$/u.test(tail);
}

/** The member name `node` reads: a string for a static name, null for a computed element access,
 * undefined when `node` reads no member. Binding-pattern keys count as reads. */
function staticMemberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node))
    return ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const key = node.propertyName ?? node.name;
    if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) return key.text;
    return undefined;
  }
  return undefined;
}
