// Tenant guard stage: trusted fingerprints, per-file facts, origins and the legacy kernel closure.

import ts from 'typescript';
import { LEGACY, PRIVILEGED, TEST_SOURCE } from './manifest.mjs';
import { originKey } from './modules.mjs';
import { byCodeUnit, sha256, within } from './rules-digest.mjs';
import {
  analyzeScopes,
  collectUnits,
  fingerprint,
  memberUse,
  parseSource,
  referenceForm,
} from './syntax.mjs';

/** Installs the trusted-tree comparison and legacy-closure analyses on `ctx`. */
export function installTrust(ctx) {
  const { graph, legacyPins, trusted } = ctx;

  // ---- trusted fingerprints, per file ------------------------------------------------------
  const trustedPrints = new Map();
  const trustedPrintsOf = file => {
    let prints = trustedPrints.get(file);
    if (!prints) {
      prints = new Set();
      const text = trusted.get(file);
      if (text !== undefined) {
        const sourceFile = parseSource(file, text);
        for (const unit of collectUnits(sourceFile)) prints.add(fingerprint(unit, sourceFile));
      }
      trustedPrints.set(file, prints);
    }
    return prints;
  };

  // ---- per-file facts, computed lazily -----------------------------------------------------
  const facts = new Map();
  const factsOf = file => {
    let fact = facts.get(file);
    if (fact) return fact;
    const sourceFile = graph.sourceFileOf(file);
    if (!sourceFile) return null;
    const { references } = analyzeScopes(sourceFile);
    const printCache = new Map();
    const unchanged = unit => {
      let state = printCache.get(unit);
      if (state === undefined) {
        state = trustedPrintsOf(file).has(fingerprint(unit, sourceFile));
        printCache.set(unit, state);
      }
      return state;
    };
    // Top-level declarations by name, so an origin { file, name } maps to its unit.
    // `statements` maps each name to its whole top-level statement, which is what a closure
    // comparison binds (a wrapper and its arguments included).
    const declarations = new Map();
    const statements = new Map();
    for (const statement of sourceFile.statements) {
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        declarations.set(statement.name.text, statement);
        statements.set(statement.name.text, statement);
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          statements.set(declaration.name.text, statement);
          let initializer = declaration.initializer;
          // `const f = cache(async (...) => ...)`: an argument-forwarding wrapper around one function
          // declares f as that function, so its callers stay resolvable.
          if (
            initializer &&
            ts.isCallExpression(initializer) &&
            initializer.arguments.length === 1 &&
            (ts.isArrowFunction(initializer.arguments[0]) ||
              ts.isFunctionExpression(initializer.arguments[0]))
          ) {
            initializer = initializer.arguments[0];
          }
          const unit =
            initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
              ? initializer
              : statement;
          declarations.set(declaration.name.text, unit);
        }
      }
    }
    fact = { file, sourceFile, references, unchanged, declarations, statements };
    facts.set(file, fact);
    return fact;
  };

  const isTest = file => TEST_SOURCE.test(file);

  // ---- origin resolution for a reference ---------------------------------------------------
  function originsOf(fact, reference) {
    const { binding, node } = reference;
    if (!binding) return { origins: [], form: referenceForm(node) };
    if (binding.kind === 'import') {
      if (binding.specifier === null)
        return { origins: [{ unresolved: '<import=>' }], form: referenceForm(node) };
      if (binding.imported === '*') {
        const [moduleObject] = graph.resolveImport(fact.file, binding.specifier, '*');
        const member = memberUse(node);
        if (!moduleObject?.namespace)
          return { origins: [moduleObject].filter(Boolean), form: referenceForm(node) };
        if (member) {
          const origins = moduleObject.namespace.flatMap(target =>
            graph.resolveExport(target, member.name)
          );
          return { origins, form: member.form, namespace: moduleObject.namespace };
        }
        return { origins: [], form: 'namespace-value', namespace: moduleObject.namespace };
      }
      const origins = graph.resolveImport(fact.file, binding.specifier, binding.imported);
      if (binding.imported === 'default' && origins.length === 0) {
        // No declared default: under CJS interop the binding is the module object itself.
        const { files } = graph.resolveSpecifier(fact.file, binding.specifier);
        return { origins: [], form: 'namespace-value', namespace: files };
      }
      return { origins, form: referenceForm(node) };
    }
    if (
      binding.scope === fact.sourceFile &&
      ['var', 'function', 'class', 'enum'].includes(binding.kind)
    ) {
      return {
        origins: [{ file: fact.file, name: binding.name, local: true }],
        form: referenceForm(node),
      };
    }
    return { origins: [], form: referenceForm(node), local: true };
  }

  const privilegedModule = new Map();
  function isPrivilegedModule(file) {
    if (privilegedModule.has(file)) return privilegedModule.get(file);
    privilegedModule.set(file, false);
    let result = false;
    for (const name of graph.exportNames(file)) {
      for (const origin of graph.resolveExport(file, name)) {
        const key = originKey(origin);
        if ((key && (LEGACY.has(key) || PRIVILEGED.has(key))) || origin.unresolved) result = true;
      }
    }
    privilegedModule.set(file, result);
    return result;
  }

  // ---- reviewed legacy kernel contract ------------------------------------------------------
  // A legacy entry is trusted only as the exact reviewed kernel implementation. Its digest binds
  // every complete workspace module in the runtime import closure of its declaring module (module
  // initialization, wrappers and effects included) plus the external specifiers that closure
  // names; package resolution and external implementations stay separately fixed inputs. A closure
  // edge that cannot be resolved, or a dynamic import with a non-literal specifier, makes the
  // entry unpinnable. A null pin map (fixture setup only) computes digests without enforcing them.
  const legacyDigests = new Map();
  const legacyClosureProblems = new Map();
  function moduleEdges(file, sourceFile) {
    const edges = [];
    const problems = [];
    const visit = node => {
      let specifier = null;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const typeOnly = ts.isImportDeclaration(node)
          ? node.importClause?.isTypeOnly
          : node.isTypeOnly;
        if (!typeOnly && ts.isStringLiteral(node.moduleSpecifier))
          specifier = node.moduleSpecifier.text;
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        specifier = ts.isStringLiteral(node.moduleReference.expression)
          ? node.moduleReference.expression.text
          : null;
        if (specifier === null) problems.push(`${file}: opaque import-equals`);
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const loader =
          callee.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(callee) && callee.text === 'require');
        if (loader) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteralLike(argument)) specifier = argument.text;
          else problems.push(`${file}: dynamic import with a non-literal specifier`);
        }
      }
      if (specifier !== null) edges.push(specifier);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { edges, problems };
  }
  function legacyDigest(key) {
    if (legacyDigests.has(key)) return legacyDigests.get(key);
    const start = key.slice(0, key.lastIndexOf('#'));
    const lines = [`entry=${key}`];
    const problems = [];
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const file = queue.shift();
      const fact = factsOf(file);
      if (!fact) {
        problems.push(`${file}: missing module`);
        continue;
      }
      // Exact bytes: a finite reviewed kernel module is bound as written, layout included.
      lines.push(`module:${file}=${sha256(fact.sourceFile.text)}`);
      const { edges, problems: edgeProblems } = moduleEdges(file, fact.sourceFile);
      problems.push(...edgeProblems);
      for (const specifier of edges) {
        const resolved = graph.resolveSpecifier(file, specifier);
        if (resolved.external) lines.push(`external:${resolved.external}`);
        else if (resolved.unresolved) problems.push(`${file}: unresolved import ${specifier}`);
        for (const target of resolved.files) {
          if (seen.has(target)) continue;
          seen.add(target);
          queue.push(target);
        }
      }
    }
    for (const file of seen) ctx.pinnedModules.add(file);
    for (const problem of problems) lines.push(`problem:${problem}`);
    const digest = sha256([...new Set(lines)].sort(byCodeUnit).join('\n'));
    legacyDigests.set(key, digest);
    legacyClosureProblems.set(key, [...new Set(problems)]);
    return digest;
  }
  const legacyPinned = key =>
    legacyPins === null ||
    (legacyPins.get(key) === legacyDigest(key) && legacyClosureProblems.get(key).length === 0);

  // ---- closure-unchanged: a workspace declaration and everything it references -------------
  const closureMemo = new Map();
  function closureUnchanged(origin) {
    if (origin.external) return true;
    if (origin.unresolved) return false;
    if (origin.namespace) return true; // a module object carries no code of its own
    const key = originKey(origin);
    // A legacy entry is judged where it is called (C1 admits the operation only in an unchanged
    // unit with an unchanged tenant closure). The entry itself is not compared with the trusted
    // tree: it is held to the pinned digest of its reviewed kernel implementation instead.
    if (LEGACY.has(key)) return legacyPinned(key);
    if (closureMemo.has(key)) return closureMemo.get(key) !== false;
    closureMemo.set(key, 'pending');
    const fact = factsOf(origin.file);
    let result = true;
    if (!fact) result = false;
    else {
      const unit = fact.statements.get(origin.name);
      if (!unit)
        result = true; // re-export or type-only name; resolution already followed it
      else if (!fact.unchanged(unit)) result = false;
      else {
        for (const reference of fact.references) {
          if (!within(reference.node, unit) || !reference.binding) continue;
          const { origins } = originsOf(fact, reference);
          for (const dependency of origins) {
            if (dependency.local && dependency.name === origin.name) continue;
            if (!closureUnchanged(dependency)) {
              result = false;
              break;
            }
          }
          if (!result) break;
        }
      }
    }
    closureMemo.set(key, result);
    return result;
  }
  Object.assign(ctx, {
    closureUnchanged,
    factsOf,
    isPrivilegedModule,
    isTest,
    legacyClosureProblems,
    legacyDigest,
    legacyDigests,
    legacyPinned,
    originsOf,
  });
}
