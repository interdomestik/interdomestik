// Tenant guard stage helper (L): module loaders that could reach a transaction entry unseen.
//
// The lifetime analysis follows a transaction entry only through static imports. Outside the
// kernel, every other way to obtain a module is refused unless its target is a literal that the
// module graph resolves: indirect or computed requires and imports, the module loader package,
// loader members (`require`, `mainModule`, `getBuiltinModule`) under any receiver or binding key,
// computed member access on the global loader receivers, import-equals declarations, eval-like
// or bundler loader globals, the code evaluator package, `constructor` members, property
// descriptor reads and `Reflect` operations other than key queries.

import ts from 'typescript';

const LOADER_MODULES = new Set(['module', 'node:module']);
// Modules that compile and run source text in the current realm.
const EVALUATOR_MODULES = new Set(['node:vm', 'vm']);
// Loader members, including the Module API reachable through `module.constructor`.
const LOADER_MEMBERS = new Set([
  '_load',
  'createRequire',
  'getBuiltinModule',
  'mainModule',
  'require',
]);
const LOADER_RECEIVERS = new Set(['global', 'globalThis', 'module', 'process', 'require']);
// Descriptor reads yield a value without a member read naming it. The singular form is admitted
// called in place; its literal key counts as a member read by that name. The plural form names
// every key at once.
const DESCRIPTOR_ALL = 'getOwnPropertyDescriptors';
const DESCRIPTOR_ONE = 'getOwnPropertyDescriptor';
// Literal descriptor keys refused beyond the refused member names: an opener and the readers.
const DESCRIBED_NAMES = new Set(['transaction', DESCRIPTOR_ALL, DESCRIPTOR_ONE]);
// A specifier with a URL scheme (`data:`, `file:`, `https:`) loads source the module graph never
// scans; `node:` names a built-in, which the loader and evaluator sets cover by name.
const URL_SPECIFIER = /^(?!node:)[a-z][\d+.a-z-]*:/iu;
// `Reflect` operations that only enumerate or test keys; the rest read, call or construct.
const REFLECT_QUERIES = new Set(['has', 'ownKeys']);
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
    return (
      identifierProblem(fact, node) ??
      declarationProblem(node) ??
      dynamicLoadProblem(fact, node) ??
      memberProblem(fact, node)
    );
  }

  /** An unbound `require` not called in place, an eval-like global, or a `Reflect` operation. */
  function identifierProblem(fact, node) {
    if (!ts.isIdentifier(node)) return null;
    if (isRequire(fact, node) && !calledInPlace(node)) return 'an indirect require';
    if (GLOBAL_LOADERS.has(node.text) && referenceAt(fact, node))
      return `an eval-like global or bundler loader (${node.text})`;
    if (node.text === 'Reflect' && unbound(fact, node) && !reflectQuery(node))
      return 'a Reflect operation other than has or ownKeys';
    return null;
  }

  const calledInPlace = node => {
    const value = ctx.outermost(node);
    return ts.isCallExpression(value.parent) && value.parent.expression === value;
  };

  const reflectQuery = node => {
    const value = ctx.outermost(node);
    const parent = value.parent;
    return (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === value &&
      REFLECT_QUERIES.has(parent.name.text)
    );
  };

  /** A dynamic `import()` / `require()`: its specifier must be a literal or a data template. */
  function dynamicLoadProblem(fact, node) {
    if (!ts.isCallExpression(node) || !dynamicLoad(fact, node)) return null;
    if (!literalSpecifier(node))
      return dataSpecifier(node) ? null : 'a dynamic import with a computed specifier';
    return specifierProblem(node.arguments[0].text, 'a dynamic import of');
  }

  /** A loader member read under any name form, or a computed member of a loader receiver. */
  function memberProblem(fact, node) {
    const name = staticMemberName(node);
    const named = typeof name === 'string' ? nameProblem(name) : null;
    if (named) return named;
    if (name === DESCRIPTOR_ALL) return `a property descriptor read (${name})`;
    if (name === DESCRIPTOR_ONE) return descriptorProblem(node) ?? undefined;
    if (name === null && !ts.isBindingElement(node) && !ts.isObjectLiteralElementLike(node)) {
      const receiver = unwrap(node.expression);
      if (
        ts.isMetaProperty(receiver) ||
        (LOADER_RECEIVERS.has(receiver.text) && unbound(fact, receiver))
      )
        return 'a computed member of a module loader receiver';
    }
    return undefined;
  }

  /** `getOwnPropertyDescriptor(target, key)`: admitted only called in place, without spreads. A
   * literal key reads that member by name, so it obeys the member names refused above and may not
   * name an opener or a descriptor reader; a computed key is outside the stated model (B2). */
  function descriptorProblem(node) {
    const refused = `a property descriptor read (${DESCRIPTOR_ONE})`;
    if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return refused;
    const value = ctx.outermost(node);
    const call = value.parent;
    if (!ts.isCallExpression(call) || call.expression !== value) return refused;
    // A spread could shift any literal into the key position.
    if (call.arguments.some(ts.isSpreadElement) || call.arguments.length < 2) return refused;
    const key = unwrap(call.arguments[1]);
    if (!ts.isStringLiteralLike(key)) return null;
    if (DESCRIBED_NAMES.has(key.text) || nameProblem(key.text))
      return `a property descriptor read (${key.text})`;
    return null;
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

/** A static import, re-export or `import = require` of a module outside the scanned graph. */
function declarationProblem(node) {
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return 'a CommonJS import (import = require)';
  const specifier =
    ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : null;
  if (!specifier || !ts.isStringLiteralLike(specifier)) return null;
  return specifierProblem(specifier.text, 'an import of');
}

/** Why reading a member called `name`, under any receiver and key form, is refused, or null. */
function nameProblem(name) {
  if (LOADER_MEMBERS.has(name)) return `a module loader member (${name})`;
  if (GLOBAL_LOADERS.has(name)) return `an eval-like global or bundler loader (${name})`;
  // `Reflect` reached as a member (`globalThis.Reflect`) bypasses the unbound-name check.
  if (name === 'Reflect') return 'a Reflect object read through a receiver';
  // Any function's `constructor` is `Function`, which compiles source text.
  if (name === 'constructor') return 'a constructor member (it reaches the Function evaluator)';
  return null;
}

/** A literal specifier naming the loader, the evaluator or a URL module, worded as `form`. */
function specifierProblem(text, form) {
  if (LOADER_MODULES.has(text)) return `${form} the module loader`;
  if (EVALUATOR_MODULES.has(text)) return `${form} the code evaluator`;
  if (URL_SPECIFIER.test(text)) return `${form} a URL module outside the scanned graph`;
  return null;
}

const literalSpecifier = call =>
  call.arguments.length > 0 && ts.isStringLiteralLike(call.arguments[0]);

/** A data template such as `../messages/${locale}/${name}.json`: a static relative prefix and a
 * `.json` suffix, so the bundler's context holds JSON modules only. */
function dataSpecifier(call) {
  const [specifier] = call.arguments;
  if (call.arguments.length !== 1 || !ts.isTemplateExpression(specifier)) return false;
  const tail = specifier.templateSpans.at(-1).literal.text;
  return /^(?:\.{1,2}|@)\/[\w./-]+\//u.test(specifier.head.text) && tail.endsWith('.json');
}

/** The member name `node` reads: a string for a static name, null for a computed one, undefined
 * when `node` reads no member. Keys of binding patterns and of object literals (which may be
 * destructuring assignment targets) count as reads; a computed key counts by its literal. */
function staticMemberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node))
    return ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
  let key;
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent))
    key = node.propertyName ?? node.name;
  else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) key = node.name;
  else return undefined;
  if (ts.isComputedPropertyName(key))
    return ts.isStringLiteralLike(key.expression) ? key.expression.text : null;
  return ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : undefined;
}
