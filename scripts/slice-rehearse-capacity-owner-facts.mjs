export function projectionCapacityOwnerPaths(protectedBudget, manifest) {
  if (manifest.topology?.closeoutMode !== 'projection-only') return [];
  const projectionPaths = new Set(manifest.topology.projectionPaths);
  return [
    ...new Set(
      protectedBudget.allocations
        .filter(allocation =>
          allocation.writerPaths.some(filePath => projectionPaths.has(filePath))
        )
        .flatMap(allocation => allocation.writerPaths)
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function capacityOwnerDeltasFromFacts(facts) {
  return Object.fromEntries(
    Object.entries(facts).map(([filePath, value]) => [
      filePath,
      {
        bytes: value.currentBytes - value.baseBytes,
        currentBytes: value.currentBytes,
        currentSha256: value.currentSha256,
        files: Number(value.currentExists) - Number(value.baseExists),
        capacityBaselineExists: value.baseExists,
        currentExists: value.currentExists,
      },
    ])
  );
}
