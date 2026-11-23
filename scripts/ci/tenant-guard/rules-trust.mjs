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
  topLevelDeclarations,
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
    const { references, hasBinding } = analyzeScopes(sourceFile);
    const printCache = new Map();
    const unchanged = unit => {
      let state = printCache.get(unit);
      if (state === undefined) {
        state = trustedPrintsOf(file).has(fingerprint(unit, sourceFile));
        printCache.set(unit, state);
      }
      return state;
    };
    const { declarations, statements } = topLevelDeclarations(sourceFile);
    fact = { file, sourceFile, references, hasBinding, unchanged, declarations, statements };
    facts.set(file, fact);
    return fact;
  };

  const isTest = file => TEST_SOURCE.test(file);

  // ---- origin resolution for a reference ---------------------------------------------------
  function originsOf(fact, reference) {
    const { binding, node } = reference;
    if (!binding) return { origins: [], form: referenceForm(node) };
    if (binding.kind === 'import') return importOrigins(fact, binding, node);
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
  function importOrigins(fact, binding, node) {
    if (binding.specifier === null)
      return { origins: [{ unresolved: '<import=>' }], form: referenceForm(node) };
    if (binding.imported === '*') return namespaceOrigins(fact, binding, node);
    const origins = graph.resolveImport(fact.file, binding.specifier, binding.imported);
    if (binding.imported === 'default' && origins.length === 0) {
      // No declared default: under CJS interop the binding is the module object itself.
      const { files } = graph.resolveSpecifier(fact.file, binding.specifier);
      return { origins: [], form: 'namespace-value', namespace: files };
    }
    return { origins, form: referenceForm(node) };
  }
  function namespaceOrigins(fact, binding, node) {
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
  function legacyDigest(key, { diagnostic = false } = {}) {
    if (legacyDigests.has(key)) return legacyDigests.get(key);
    const { digest, problems, seen } = kernelWalk(graph, key);
    if (!diagnostic) for (const file of seen) ctx.pinnedModules.add(file);
    legacyDigests.set(key, digest);
    legacyClosureProblems.set(key, problems);
    return digest;
  }
  function legacyPinned(key) {
    if (legacyPins === null) return true;
    const exact = legacyDigest(key);
    if (legacyClosureProblems.get(key).length) return false;
    if (ctx.schemaAdmission) return ctx.schemaAdmission.ok && LEGACY.has(key);
    return [legacyPins.get(key) ?? []].flat().includes(exact);
  }

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
    const result = declarationClosureUnchanged(origin);
    closureMemo.set(key, result);
    return result;
  }
  function declarationClosureUnchanged(origin) {
    const fact = factsOf(origin.file);
    if (!fact) return false;
    const unit = fact.statements.get(origin.name);
    if (!unit) return true; // re-export or type-only name; resolution already followed it
    if (!fact.unchanged(unit) && !ctx.c1Admitted(fact, unit)) return false;
    return fact.references.every(
      reference =>
        !within(reference.node, unit) ||
        !reference.binding ||
        originsOf(fact, reference).origins.every(
          dependency =>
            (dependency.local && dependency.name === origin.name) || closureUnchanged(dependency)
        )
    );
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

/** Unfiltered legacy walk, with v2 records for every resolved edge in source order. */
export function kernelWalk(graph, key) {
  const start = key.slice(0, key.lastIndexOf('#'));
  const lines = [`entry=${key}`];
  const problems = [];
  const seen = new Set([start]);
  const queue = [start];
  const resolutions = new Map();
  while (queue.length > 0) {
    const file = queue.shift();
    const source = graph.sourceFileOf(file);
    if (!source) {
      problems.push(`${file}: missing module`);
      continue;
    }
    lines.push(`module:${file}=${sha256(source.text)}`);
    const resolvedEdges = resolveKernelEdges(graph, file, source, lines, problems);
    resolutions.set(file, resolvedEdges);
    for (const [, targets] of resolvedEdges) {
      for (const target of targets) {
        if (seen.has(target)) continue;
        seen.add(target);
        queue.push(target);
      }
    }
  }
  for (const problem of problems) lines.push(`problem:${problem}`);
  const records = [...new Set(lines)].sort(byCodeUnit);
  const anchorRecords = [...resolutions].sort(([left], [right]) => byCodeUnit(left, right));
  return {
    digest: sha256(records.join('\n')),
    versioned: `v2:${sha256(JSON.stringify([2, records, anchorRecords]))}`,
    problems: [...new Set(problems)],
    seen,
    resolutions,
  };
}

function resolveKernelEdges(graph, file, source, lines, problems) {
  const { edges, problems: edgeProblems } = moduleEdges(file, source);
  problems.push(...edgeProblems);
  return edges.map(specifier => {
    const { files, external, unresolved } = graph.resolveSpecifier(file, specifier);
    if (external) lines.push(`external:${external}`);
    else if (unresolved) problems.push(`${file}: unresolved import ${specifier}`);
    return [specifier, files, external, unresolved];
  });
}

function moduleEdges(file, sourceFile) {
  const edges = [];
  const problems = [];
  const visit = node => {
    const specifier = edgeSpecifier(node, file, problems);
    if (specifier !== null) edges.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { edges, problems };
}

/** The runtime module specifier a node imports, or null (recording an opaque one in `problems`). */
function edgeSpecifier(node, file, problems) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
    return !typeOnly && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    if (ts.isStringLiteral(node.moduleReference.expression))
      return node.moduleReference.expression.text;
    problems.push(`${file}: opaque import-equals`);
    return null;
  }
  return ts.isCallExpression(node) ? loaderSpecifier(node, file, problems) : null;
}

/** The specifier of a dynamic `import()` or `require()` call, or null. */
function loaderSpecifier(node, file, problems) {
  const callee = node.expression;
  const loader =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require');
  if (!loader) return null;
  const argument = node.arguments[0];
  if (argument && ts.isStringLiteralLike(argument)) return argument.text;
  problems.push(`${file}: dynamic import with a non-literal specifier`);
  return null;
}
