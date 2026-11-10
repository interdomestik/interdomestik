import ts from 'typescript';
import { SEED_TLS_CLOSURE } from './manifest.mjs';
import { analyzeScopes } from './scopes.mjs';
import { loaderMember, opaqueGlobalLoaderUse } from './seed-tls-global-loaders.mjs';
export { loaderMember, opaqueGlobalLoaderUse } from './seed-tls-global-loaders.mjs';

const graphs = new WeakMap();
function cacheOf(graph) {
  if (!graphs.has(graph)) graphs.set(graph, { edges: new Map(), reaches: new Map() });
  return graphs.get(graph);
}

/** All literal module edges, including type-only and side-effect edges. */
export function moduleEdges(graph, file) {
  const cache = cacheOf(graph).edges;
  if (cache.has(file)) return cache.get(file);
  const edges = new Map();
  cache.set(file, edges);
  const source = graph.sourceFileOf(file);
  if (!source) return edges;
  const { lookup, references } = analyzeScopes(source);
  const referencesByNode = new Map(references.map(reference => [reference.node, reference]));
  ts.forEachChild(source, function visit(node) {
    const specifier = literalSpecifier(node, lookup);
    if (specifier !== null) {
      // Node's URL spelling still loads the same file. Resolve both spellings through the
      // existing resolver; do not modify its behavior for any other tenant-guard rule.
      let normalized = specifier.split(/[?#]/u)[0];
      try {
        normalized = decodeURIComponent(normalized);
      } catch {
        /* fail closed below */
      }
      const unsupportedUrl =
        /^(?!node:)[a-z][\d+.a-z-]*:/iu.test(normalized) ||
        /^[\/\\]/u.test(normalized) ||
        /%/u.test(normalized);
      const targets = [
        ...new Set(
          [specifier, normalized].flatMap(value => graph.resolveSpecifier(file, value).files)
        ),
      ];
      edges.set(node, {
        specifier,
        targets,
        unsupportedUrl,
        opaque: ['module', 'node:module', 'process', 'node:process'].includes(normalized),
      });
    } else if (opaqueLoader(node, referencesByNode)) {
      edges.set(node, { specifier: null, targets: [], opaque: true });
    }
    ts.forEachChild(node, visit);
  });
  return edges;
}

// Tests are not syntax-enforced, so an opaque loader in their reachable graph must taint them:
// runtime re-exports cannot use an unknown target to claim that the seed closure is unreachable.
function opaqueLoader(node, references) {
  if (opaqueGlobalLoaderUse(node, references)) return true;
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
    return true;
  if (
    ts.isIdentifier(node) &&
    node.text === 'require' &&
    references.has(node) &&
    !references.get(node).binding
  ) {
    const call = node.parent;
    return (
      !ts.isCallExpression(call) ||
      call.expression !== node ||
      call.questionDotToken ||
      !call.arguments[0] ||
      !ts.isStringLiteralLike(call.arguments[0])
    );
  }
  return ['require', 'createRequire', '_load', 'getBuiltinModule'].includes(loaderMember(node));
}

function literalSpecifier(node, lookup) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  )
    return node.moduleSpecifier.text;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const argument = node.moduleReference.expression;
    return argument && ts.isStringLiteral(argument) ? argument.text : null;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  )
    return node.argument.literal.text;
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  const loader =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === 'require' && !lookup(callee));
  const argument = node.arguments[0];
  return loader && argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

/** Iterative reachability: cache only completed root searches, never partial cycle results. */
export function reachesSeedClosure(graph, file) {
  const cache = cacheOf(graph).reaches;
  if (cache.has(file)) return cache.get(file);
  const pending = [file];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (SEED_TLS_CLOSURE.has(current)) {
      cache.set(file, true);
      return true;
    }
    if (seen.has(current)) continue;
    seen.add(current);
    for (const { targets, opaque, unsupportedUrl } of moduleEdges(graph, current).values()) {
      if (opaque || unsupportedUrl) {
        cache.set(file, true);
        return true;
      }
      pending.push(...targets);
    }
  }
  cache.set(file, false);
  return false;
}
