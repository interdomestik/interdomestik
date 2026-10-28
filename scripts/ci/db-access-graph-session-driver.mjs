import { createIncompleteCollector } from './db-access-incomplete.mjs';
// Keeps one traversal's resolver/reference/query state, while reporting each origin once.
export function createGraphSessionDriver(inventory, provenance, inspect) {
  const visited = new Set(),
    emittedReasons = new Set(provenance.analysisUnknown);
  const reached = new Set();
  let started = false,
    failed = false;
  return Object.freeze({
    run(origins, globalMetadata = false) {
      if (
        failed ||
        !Array.isArray(origins) ||
        new Set(origins).size !== origins.length ||
        origins.some(origin => !inventory.changed.has(origin) || visited.has(origin)) ||
        (globalMetadata && started)
      )
        throw new Error('incomplete: invalid graph session origins');
      started = true;
      for (const origin of origins) visited.add(origin);
      const output = {
        failures: [],
        incomplete: createIncompleteCollector(),
        reachedTestSources: new Set(),
      };
      if (globalMetadata) {
        for (const file of provenance.environmentChanges)
          output.incomplete.push({ file, reason: 'unsupported mutable global environment root' });
        for (const reason of emittedReasons) output.incomplete.push({ file: '<analysis>', reason });
      }
      try {
        inspect(origins, output);
      } catch (error) {
        failed = true;
        throw error;
      }
      for (const reason of provenance.analysisUnknown)
        if (!emittedReasons.has(reason)) {
          emittedReasons.add(reason);
          output.incomplete.push({ file: '<analysis>', reason });
        }
      const delta = new Set();
      for (const file of output.reachedTestSources)
        if (!reached.has(file)) {
          reached.add(file);
          delta.add(file);
        }
      return {
        failures: output.failures,
        incomplete: output.incomplete.entries,
        incompleteRawCount: output.incomplete.rawCount,
        reachedTestSources: delta,
        ...(output.m4Contexts
          ? { m4Contexts: { ...output.m4Contexts, unresolved: output.incomplete.entries } }
          : {}),
      };
    },
  });
}
