// Explicit data-only fixtures. No native/source/loader authority is claimed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { pathFixture } from './db-access-m4-path-test-utils.mjs';
import { entry } from './db-access-m4-context-test-utils.mjs';
import { M4_LINEAGE_CATALOG } from './db-access-m4-lineage-catalog.mjs';
import { createLineageObserver } from './db-access-m4-lineage-observer.mjs';
import { resolveLineageData } from './db-access-m4-lineage-selection.mjs';
import { digest } from './db-access-trust.mjs';
export function modeWireFixture() {
  const fixtures = ['root-a.ts', 'root-b.ts'].map(pathFixture),
    model = fixtures[0].model;
  const root = fileURLToPath(new URL('../..', import.meta.url)),
    files = new WeakMap();
  model.sources = new Map([...model.parsed].map(([file, sf]) => [file, sf.text]));
  for (const file of Object.keys(M4_LINEAGE_CATALOG.frontier)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    model.sources.set(file, text);
    if (!file.endsWith('.json'))
      model.parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  }
  model.fileOf = node => files.get(node);
  model.walk = (sf, visit) => {
    function walk(node) {
      files.set(node, sf.fileName);
      visit(node);
      ts.forEachChild(node, walk);
    }
    walk(sf);
  };
  const groups = fixtures.map((f, index) => [
    f.batch.roots[0],
    ...Array.from({ length: 63 }, (_, i) => 'unit-empty-' + index + '-' + i + '.ts'),
  ]);
  for (const file of groups.flat().filter(file => !model.sources.has(file))) {
    model.sources.set(file, 'export const empty = true;');
    model.parsed.set(
      file,
      ts.createSourceFile(file, 'export const empty = true;', ts.ScriptTarget.Latest, true)
    );
  }
  const source = {
    files: [...model.sources.keys()],
    policyDigest: digest('unit-policy'),
    bookends: { before: digest('unit-source'), after: digest('unit-source') },
  };
  const inventory = {
    changed: new Set(groups.flat()),
    entries: fixtures[0].batch.observations.map(row =>
      entry(row, row.incomplete ? 'legacy' : undefined)
    ),
  };
  const prepared = {
    repoRoot: root,
    model,
    inventory,
    providerUnit: { m4Proof: source },
    provenance: { environmentChanges: [], analysisUnknown: new Set() },
    resolutionSources: new Map(),
    sources: model.sources,
    trusted: new Map(),
    adoption: { critical: [] },
  };
  const selection = resolveLineageData(model, inventory, M4_LINEAGE_CATALOG),
    binding = {
      sourcePolicyDigest: source.policyDigest,
      sourceBookends: source.bookends,
      modelDigest: digest(JSON.stringify([...model.sources])),
    };
  const results = fixtures.map((f, index) => {
    for (const item of f.result.incomplete)
      if (item.file === '<analysis>') item.reason = 'provenance-work-bound';
    const row = f.batch.observations[0],
      lineage = createLineageObserver(
        selection,
        node => (node ? [model.fileOf(node), node.pos, node.end, node.kind] : null),
        () => undefined
      );
    lineage.begin();
    return {
      ...f.result,
      origins: groups[index],
      reachedTestSources: ['unit-reached-' + index + '.test.ts'],
      failures: [],
      m4Contexts: {
        version: 1,
        ...binding,
        roots: groups[index],
        selectedIdentities: f.batch.observations.map(x => x.identity),
        observations: f.batch.observations,
        attributions: f.batch.attributions,
        pathDiagnostics: f.batch.pathDiagnostics,
        frames: {
          [row.context]: f.batch.pathDiagnostics.frames[0].bindings.map(x => ({
            parameter: x.parameter,
            argument: x.argument,
            caller: null,
          })),
        },
        affectedLineage: lineage.finish(binding, groups[index]),
        unresolved: f.result.incomplete,
        allExecutableContextsQualified: false,
        runtimeAdmission: false,
      },
    };
  });
  inventory.entries.push({
    identity: 'unselected-ordinary-failure',
    file: 'outside-m4-source.ts',
  });
  results[0].failures.push({
    identity: 'unselected-ordinary-failure',
    file: 'outside-m4-source.ts',
    method: 'select',
    mountedFrom: fixtures[0].batch.roots[0],
  });
  return { prepared, source, results, partitions: groups };
}
