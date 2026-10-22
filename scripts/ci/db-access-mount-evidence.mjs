export function mountEvidence(directChanges, firstInvalidatingDependency, graph, incomplete) {
  const paths = new Set([...directChanges, ...firstInvalidatingDependency.keys()]);
  for (const failure of graph.failures) paths.add(failure.mountedFrom);
  const files = [...paths].sort((left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  const ids = new Map(files.map((file, id) => [file, id]));
  const roots = files.map((file, id) => {
    const dependency = firstInvalidatingDependency.get(file);
    return {
      id,
      file,
      changeKind: directChanges.has(file) ? 'runtime-source' : 'runtime-consumer',
      ...(dependency ? { firstInvalidatingDependencyId: ids.get(dependency) } : {}),
    };
  });
  const operations = new Map();
  for (const failure of graph.failures) {
    const rootsForOperation = operations.get(failure.identity) ?? new Set();
    rootsForOperation.add(ids.get(failure.mountedFrom));
    operations.set(failure.identity, rootsForOperation);
  }
  return {
    version: 1,
    analysisIncomplete: incomplete,
    roots,
    operations: [...operations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([identity, observedRootIds]) => ({
        identity,
        observedRootIds: [...observedRootIds].sort((left, right) => left - right),
      })),
  };
}
