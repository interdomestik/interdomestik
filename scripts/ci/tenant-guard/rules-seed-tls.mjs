// Seed confinement depends on module reachability, never on exported symbol/value origins.
import ts from 'typescript';
import { SEED_TLS_CLOSURE, TEST_SOURCE } from './manifest.mjs';
import { moduleEdges, reachesSeedClosure } from './seed-tls-import-graph.mjs';
import { checkDatabaseLoader } from './seed-tls-loaders.mjs';

/** scanFiles excludes tests from enforcement, but the graph below includes their imports. */
export function checkSeedTlsModuleUse(scan, node) {
  checkDatabaseLoader(scan, node);
  const graph = scan.seedTls?.graph ?? scan.graph;
  const edge = moduleEdges(graph, scan.file).get(node);
  if (!edge) return;
  const { specifier, targets } = edge;
  if (edge.computed) scan.report(node, 'R-a', 'nonliteral loader may reach seed-only closure');
  if (edge.unsupportedUrl) {
    scan.report(node, 'R-a', `unsupported URL import may reach seed-only closure ${specifier}`);
  }
  if (
    !SEED_TLS_CLOSURE.has(scan.file) &&
    targets.some(target => reachesSeedClosure(graph, target, false))
  ) {
    scan.report(node, 'R-a', `import of seed-only closure module ${specifier}`);
  }
  // The existing test-import rule misses export-from, type imports and kernel dynamic imports.
  // Tighten only tests that transitively reach this closure; ordinary test policy is unchanged.
  if (targets.some(target => scan.isTest(target) && reachesSeedClosure(graph, target))) {
    scan.report(node, 'R-a', `import of test module reaching seed-only closure ${specifier}`);
  }
}

// Next also loads root entry files without a source import. Enforce only this seed rule here.
export function scanSeedTlsEntries(ctx) {
  if (!ctx.seedTls) return;
  ctx.violations.push(...ctx.seedTls.violations);
  for (const file of ctx.seedTls.runtimeEntries) {
    if (ctx.sources.has(file) || TEST_SOURCE.test(file)) continue;
    const sourceFile = ctx.seedTls.graph.sourceFileOf(file);
    if (!sourceFile) continue;
    const scan = {
      file,
      sourceFile,
      graph: ctx.graph,
      seedTls: ctx.seedTls,
      isTest: ctx.isTest,
      report: (node, rule, detail) => ctx.violate(file, node, sourceFile, rule, detail),
    };
    ts.forEachChild(sourceFile, function visit(node) {
      checkSeedTlsModuleUse(scan, node);
      ts.forEachChild(node, visit);
    });
  }
}
