// Seed confinement depends on module reachability, never on exported symbol/value origins.
import { SEED_TLS_CLOSURE } from './manifest.mjs';
import { moduleEdges, reachesSeedClosure } from './seed-tls-import-graph.mjs';
import { checkDatabaseLoader } from './seed-tls-loaders.mjs';

/** scanFiles excludes tests from enforcement, but the graph below includes their imports. */
export function checkSeedTlsModuleUse(scan, node) {
  checkDatabaseLoader(scan, node);
  const edge = moduleEdges(scan.graph, scan.file).get(node);
  if (!edge) return;
  const { specifier, targets } = edge;
  if (edge.unsupportedUrl) {
    scan.report(node, 'R-a', `unsupported URL import may reach seed-only closure ${specifier}`);
  }
  if (!SEED_TLS_CLOSURE.has(scan.file) && targets.some(target => SEED_TLS_CLOSURE.has(target))) {
    scan.report(node, 'R-a', `import of seed-only closure module ${specifier}`);
  }
  // The existing test-import rule misses export-from, type imports and kernel dynamic imports.
  // Tighten only tests that transitively reach this closure; ordinary test policy is unchanged.
  if (targets.some(target => scan.isTest(target) && reachesSeedClosure(scan.graph, target))) {
    scan.report(node, 'R-a', `import of test module reaching seed-only closure ${specifier}`);
  }
}
